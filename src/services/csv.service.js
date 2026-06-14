import { Readable } from 'stream';
import csv from 'csv-parser';
import prisma from '../config/db.js';

// Parse CSV buffer into rows
export const parseCSVBuffer = (buffer) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const stream = Readable.from(buffer);
    stream
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
};

// Normalize key lookups
const getVal = (row, possibleKeys) => {
  const foundKey = Object.keys(row).find(k => 
    possibleKeys.includes(k.trim().toLowerCase())
  );
  return foundKey ? row[foundKey].trim() : '';
};

export const processCSVImport = async (groupId, buffer, fileName) => {
  const rawRows = await parseCSVBuffer(buffer);

  let totalRows = rawRows.length;
  let importedRows = 0;
  let failedRows = 0;
  const loggedAnomalies = [];

  // Get active and past members of the group
  const memberships = await prisma.membership.findMany({
    where: { groupId },
    include: { user: true }
  });

  // Pre-load all users from database for quick email lookups
  const allUsers = await prisma.user.findMany({
    select: { id: true, email: true, name: true }
  });

  // Create an Import Report placeholder first
  const report = await prisma.importReport.create({
    data: {
      groupId,
      fileName,
      totalRows,
      importedRows: 0,
      failedRows: 0
    }
  });

  for (const row of rawRows) {
    const rowAnomalies = [];
    let isFailed = false;

    // Extract values
    const dateStr = getVal(row, ['date', 'date (yyyy-mm-dd)', 'expense date']);
    const description = getVal(row, ['description', 'desc', 'title']);
    const originalAmountStr = getVal(row, ['originalamount', 'amount', 'original amount']);
    const currency = getVal(row, ['currency', 'curr']).toUpperCase();
    const exchangeRateStr = getVal(row, ['exchangerate', 'exchange rate', 'rate']);
    const payerEmail = getVal(row, ['payeremail', 'payer', 'payer email', 'email']).toLowerCase();
    const splitType = getVal(row, ['splittype', 'split type', 'type']).toUpperCase();
    const participantsStr = getVal(row, ['participants', 'members', 'split with', 'users']);
    const splitValuesStr = getVal(row, ['splitvalues', 'split values', 'shares', 'percentages', 'amounts']);

    // --- CRITICAL VALIDATIONS ---

    // 1. Missing Payer
    if (!payerEmail) {
      rowAnomalies.push({
        type: 'MISSING_PAYER',
        description: 'Row is missing the payer email address.'
      });
      isFailed = true;
    }

    // 2. Missing Participants
    if (!participantsStr) {
      rowAnomalies.push({
        type: 'MISSING_PARTICIPANTS',
        description: 'Row is missing the split participants list.'
      });
      isFailed = true;
    }

    // 3. Invalid Date
    let parsedDate = new Date(dateStr);
    if (!dateStr || isNaN(parsedDate.getTime())) {
      rowAnomalies.push({
        type: 'INVALID_DATE',
        description: `Invalid or empty date value: '${dateStr}'`
      });
      isFailed = true;
    } else if (parsedDate > new Date()) {
      rowAnomalies.push({
        type: 'INVALID_DATE',
        description: `Expense date cannot be in the future: '${dateStr}'`
      });
      isFailed = true;
    }

    // 4. Negative/Zero Amount
    const originalAmount = Number(originalAmountStr);
    if (isNaN(originalAmount) || originalAmount <= 0) {
      rowAnomalies.push({
        type: 'NEGATIVE_AMOUNT',
        description: `Expense amount must be greater than zero: '${originalAmountStr}'`
      });
      isFailed = true;
    }

    // 5. Invalid Currency
    if (currency !== 'INR' && currency !== 'USD') {
      rowAnomalies.push({
        type: 'INVALID_CURRENCY',
        description: `Currency '${currency}' is not supported. Must be INR or USD.`
      });
      isFailed = true;
    }

    // Resolve Payer User
    const payerUser = allUsers.find(u => u.email === payerEmail);
    let payerMember = null;
    if (!payerUser) {
      rowAnomalies.push({
        type: 'UNKNOWN_USERS',
        description: `Payer email '${payerEmail}' is not registered in the system.`
      });
      isFailed = true;
    } else {
      payerMember = memberships.find(m => m.userId === payerUser.id);
      if (!payerMember) {
        rowAnomalies.push({
          type: 'MISSING_USERS',
          description: `Payer '${payerUser.name}' (${payerEmail}) is not a member of this group.`
        });
        isFailed = true;
      }
    }

    // Parse Participants list
    const participantEmails = participantsStr
      .split(';')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    const participantUsers = [];
    const participantMembers = [];

    if (participantEmails.length === 0) {
      rowAnomalies.push({
        type: 'MISSING_PARTICIPANTS',
        description: 'Participant emails list is empty.'
      });
      isFailed = true;
    } else {
      for (const email of participantEmails) {
        const u = allUsers.find(user => user.email === email);
        if (!u) {
          rowAnomalies.push({
            type: 'UNKNOWN_USERS',
            description: `Participant email '${email}' is not registered.`
          });
          isFailed = true;
        } else {
          participantUsers.push(u);
          const member = memberships.find(m => m.userId === u.id);
          if (!member) {
            rowAnomalies.push({
              type: 'MISSING_USERS',
              description: `Participant '${u.name}' (${email}) is not a member of this group.`
            });
            isFailed = true;
          } else {
            participantMembers.push(member);
          }
        }
      }
    }

    // Parse Split Values
    const splitValues = splitValuesStr
      .split(';')
      .map(v => v.trim())
      .filter(Boolean)
      .map(Number);

    if (splitType === 'EXACT' || splitType === 'PERCENTAGE') {
      if (splitValues.length !== participantEmails.length) {
        rowAnomalies.push({
          type: 'INVALID_SPLIT_PERCENTAGE',
          description: `Mismatch: Number of split values (${splitValues.length}) does not match participants (${participantEmails.length})`
        });
        isFailed = true;
      }
    }

    // Split sum validations
    if (!isFailed) {
      if (splitType === 'PERCENTAGE') {
        const sum = splitValues.reduce((s, v) => s + v, 0);
        if (Math.abs(sum - 100) > 0.1) {
          rowAnomalies.push({
            type: 'INVALID_SPLIT_PERCENTAGE',
            description: `Sum of split percentages is ${sum}%, but must be exactly 100%`
          });
          isFailed = true;
        }
      } else if (splitType === 'EXACT') {
        const sum = splitValues.reduce((s, v) => s + v, 0);
        if (Math.abs(sum - originalAmount) > 0.1) {
          rowAnomalies.push({
            type: 'INVALID_SPLIT_PERCENTAGE',
            description: `Sum of exact split amounts (${sum}) must equal total expense amount (${originalAmount})`
          });
          isFailed = true;
        }
      }
    }

    // Stop processing row if critical error occurred
    if (isFailed) {
      failedRows++;
      // Save failures directly as report anomalies
      await Promise.all(
        rowAnomalies.map(a =>
          prisma.anomaly.create({
            data: {
              importReportId: report.id,
              type: a.type,
              description: `Row [${description || 'No Description'}]: ${a.description}`,
              status: 'REJECTED'
            }
          })
        )
      );
      loggedAnomalies.push(...rowAnomalies.map(a => ({ ...a, rowDesc: description, status: 'FAILED_IMPORT' })));
      continue;
    }

    // --- WARNING LEVEL ANOMALIES (Allowed to import as PENDING approval) ---
    
    // 6. Duplicate Expense check
    const oneHour = 60 * 60 * 1000;
    const existingMatches = await prisma.expense.findMany({
      where: {
        groupId,
        payerId: payerUser.id,
        description: { equals: description.trim(), mode: 'insensitive' },
        originalAmount,
        currency
      }
    });
    const duplicateMatch = existingMatches.some(e => {
      return Math.abs(new Date(e.date).getTime() - parsedDate.getTime()) < oneHour;
    });

    if (duplicateMatch) {
      rowAnomalies.push({
        type: 'DUPLICATE_EXPENSE',
        description: 'Duplicate expense detected (same description, amount, payer and date).'
      });
    }

    // 7. Settlement as Expense
    const lowerDesc = description.toLowerCase();
    if (lowerDesc.includes('settle') || lowerDesc.includes('payment to') || lowerDesc.includes('repay')) {
      rowAnomalies.push({
        type: 'SETTLEMENT_AS_EXPENSE',
        description: 'Expense description indicates this might be a settlement transaction.'
      });
    }

    // 8. Expense Date outside active Membership duration
    if (payerMember) {
      if (parsedDate < new Date(payerMember.joinedAt)) {
        rowAnomalies.push({
          type: 'EXPENSE_BEFORE_JOINED',
          description: `Payer '${payerUser.name}' joined group after the expense date.`
        });
      }
      if (payerMember.leftAt && parsedDate > new Date(payerMember.leftAt)) {
        rowAnomalies.push({
          type: 'EXPENSE_AFTER_LEFT',
          description: `Payer '${payerUser.name}' left group before the expense date.`
        });
      }
    }

    for (const m of participantMembers) {
      if (parsedDate < new Date(m.joinedAt)) {
        rowAnomalies.push({
          type: 'EXPENSE_BEFORE_JOINED',
          description: `Participant '${m.user.name}' joined group after the expense date.`
        });
      }
      if (m.leftAt && parsedDate > new Date(m.leftAt)) {
        rowAnomalies.push({
          type: 'EXPENSE_AFTER_LEFT',
          description: `Participant '${m.user.name}' left group before the expense date.`
        });
      }
    }

    // Determine final status
    const hasWarnings = rowAnomalies.length > 0;
    const expenseStatus = hasWarnings ? 'PENDING' : 'APPROVED';

    // Calculate splits
    const rate = currency === 'INR' ? 1.0 : Number(exchangeRateStr || 84.0);
    const baseAmountINR = originalAmount * rate;

    let calculatedSplits = [];
    if (splitType === 'EQUAL') {
      const share = baseAmountINR / participantUsers.length;
      let runningSum = 0;
      calculatedSplits = participantUsers.map((u, index) => {
        let amountOwed = Math.round(share * 100) / 100;
        if (index === participantUsers.length - 1) {
          amountOwed = Math.round((baseAmountINR - runningSum) * 100) / 100;
        }
        runningSum += amountOwed;
        return { userId: u.id, amountOwed, percentage: 100 / participantUsers.length };
      });
    } else if (splitType === 'EXACT') {
      let runningSum = 0;
      calculatedSplits = participantUsers.map((u, index) => {
        const val = splitValues[index];
        let amountOwed = Math.round(val * rate * 100) / 100;
        if (index === participantUsers.length - 1) {
          amountOwed = Math.round((baseAmountINR - runningSum) * 100) / 100;
        }
        runningSum += amountOwed;
        return { userId: u.id, amountOwed, percentage: (val / originalAmount) * 100 };
      });
    } else if (splitType === 'PERCENTAGE') {
      let runningSum = 0;
      calculatedSplits = participantUsers.map((u, index) => {
        const pct = splitValues[index];
        let amountOwed = Math.round((baseAmountINR * (pct / 100)) * 100) / 100;
        if (index === participantUsers.length - 1) {
          amountOwed = Math.round((baseAmountINR - runningSum) * 100) / 100;
        }
        runningSum += amountOwed;
        return { userId: u.id, amountOwed, percentage: pct };
      });
    }

    // Save Expense to database
    await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          groupId,
          payerId: payerUser.id,
          description: description.trim(),
          originalAmount,
          currency,
          exchangeRate: rate,
          baseAmountINR,
          splitType: splitType === 'EQUAL' ? 'EQUAL' : splitType === 'EXACT' ? 'EXACT' : 'PERCENTAGE',
          date: parsedDate,
          status: expenseStatus
        }
      });

      // Save Splits
      await Promise.all(
        calculatedSplits.map(s =>
          tx.expenseSplit.create({
            data: {
              expenseId: expense.id,
              userId: s.userId,
              amountOwed: s.amountOwed,
              percentage: s.percentage
            }
          })
        )
      );

      // Save Warning Anomalies
      if (hasWarnings) {
        await Promise.all(
          rowAnomalies.map(a =>
            tx.anomaly.create({
              data: {
                importReportId: report.id,
                expenseId: expense.id,
                type: a.type,
                description: a.description,
                status: 'PENDING'
              }
            })
          )
        );
      }
    });

    importedRows++;
    loggedAnomalies.push(...rowAnomalies.map(a => ({ ...a, rowDesc: description, status: 'IMPORTED_PENDING' })));
  }

  // Update Import Report with final results
  const updatedReport = await prisma.importReport.update({
    where: { id: report.id },
    data: {
      importedRows,
      failedRows
    },
    include: {
      anomalies: true
    }
  });

  return {
    report: updatedReport,
    anomalies: loggedAnomalies
  };
};
