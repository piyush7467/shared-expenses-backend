import prisma from '../config/db.js';

// Helper to check for duplicate manual expenses
const detectManualAnomalies = async (expenseData, splits) => {
  const anomalies = [];
  const { groupId, payerId, description, originalAmount, date, currency } = expenseData;

  const expDate = new Date(date);

  // 1. Duplicate check (same group, description, payer, amount, and date within 1 hour)
  const oneHour = 60 * 60 * 1000;
  const potentialDuplicates = await prisma.expense.findMany({
    where: {
      groupId,
      payerId,
      description: { equals: description.trim(), mode: 'insensitive' },
      originalAmount: Number(originalAmount),
      currency
    }
  });

  const isDuplicate = potentialDuplicates.some(exp => {
    return Math.abs(new Date(exp.date).getTime() - expDate.getTime()) < oneHour;
  });

  if (isDuplicate) {
    anomalies.push({
      type: 'DUPLICATE_EXPENSE',
      description: `Potential duplicate expense found with same description, amount, and payer around this time.`
    });
  }

  // 2. Date checks relative to joined/left memberships
  const memberships = await prisma.membership.findMany({
    where: { groupId },
    include: { user: true }
  });

  // Check payer membership constraints
  const payerMember = memberships.find(m => m.userId === payerId);
  if (payerMember) {
    const payerName = payerMember.user?.name || 'payer';
    if (expDate < new Date(payerMember.joinedAt)) {
      anomalies.push({
        type: 'EXPENSE_BEFORE_JOINED',
        description: `Expense date (${expDate.toLocaleDateString()}) is before payer '${payerName}' joined the group (${new Date(payerMember.joinedAt).toLocaleDateString()}).`
      });
    }
    if (payerMember.leftAt && expDate > new Date(payerMember.leftAt)) {
      anomalies.push({
        type: 'EXPENSE_AFTER_LEFT',
        description: `Expense date (${expDate.toLocaleDateString()}) is after payer '${payerName}' left the group (${new Date(payerMember.leftAt).toLocaleDateString()}).`
      });
    }
  }

  // Check participants membership constraints
  for (const split of splits) {
    const partMember = memberships.find(m => m.userId === split.userId);
    if (partMember) {
      const participantName = partMember.user?.name || `user ${split.userId}`;
      if (expDate < new Date(partMember.joinedAt)) {
        anomalies.push({
          type: 'EXPENSE_BEFORE_JOINED',
          description: `Expense date is before participant '${participantName}' joined the group.`
        });
      }
      if (partMember.leftAt && expDate > new Date(partMember.leftAt)) {
        anomalies.push({
          type: 'EXPENSE_AFTER_LEFT',
          description: `Expense date is after participant '${participantName}' left the group.`
        });
      }
    }
  }

  // 3. Settlement recorded as expense
  const lowercaseDesc = description.toLowerCase();
  if (
    lowercaseDesc.includes('settle') ||
    lowercaseDesc.includes('payment to') ||
    lowercaseDesc.includes('repay')
  ) {
    anomalies.push({
      type: 'SETTLEMENT_AS_EXPENSE',
      description: `Description '${description}' suggests this is a settlement rather than a regular group expense.`
    });
  }

  return anomalies;
};

export const createExpense = async (req, res) => {
  const {
    groupId,
    description,
    originalAmount,
    currency,
    exchangeRate,
    splitType,
    date,
    payerId,
    splits // [{ userId, amount, percentage }]
  } = req.body;

  // Basic Validations
  if (!groupId || !description || !originalAmount || !currency || !splitType || !payerId || !splits || splits.length === 0) {
    return res.status(400).json({ message: 'Missing required expense fields' });
  }

  const amount = Number(originalAmount);
  if (amount <= 0) {
    return res.status(400).json({ message: 'Amount must be greater than 0' });
  }

  if (currency !== 'INR' && currency !== 'USD') {
    return res.status(400).json({ message: 'Supported currencies are INR and USD' });
  }

  const rate = currency === 'INR' ? 1.0 : Number(exchangeRate || 84.0);
  const baseAmountINR = amount * rate;
  const expDate = date ? new Date(date) : new Date();

  // Validate splits based on splitType
  let calculatedSplits = [];
  try {
    if (splitType === 'EQUAL') {
      const splitShare = baseAmountINR / splits.length;
      let runningSum = 0;
      calculatedSplits = splits.map((s, index) => {
        let amountOwed = Math.round(splitShare * 100) / 100;
        // Adjust the last split to handle rounding differences
        if (index === splits.length - 1) {
          amountOwed = Math.round((baseAmountINR - runningSum) * 100) / 100;
        }
        runningSum += amountOwed;
        return {
          userId: s.userId,
          amountOwed,
          percentage: 100 / splits.length
        };
      });
    } else if (splitType === 'EXACT') {
      let sumOfOriginalSplits = 0;
      splits.forEach(s => { sumOfOriginalSplits += Number(s.amount || 0); });

      if (Math.abs(sumOfOriginalSplits - amount) > 0.05) {
        return res.status(400).json({
          message: `Sum of split amounts (${sumOfOriginalSplits}) must equal total expense amount (${amount})`
        });
      }

      let runningSum = 0;
      calculatedSplits = splits.map((s, index) => {
        const share = Number(s.amount);
        let amountOwed = Math.round(share * rate * 100) / 100;
        if (index === splits.length - 1) {
          amountOwed = Math.round((baseAmountINR - runningSum) * 100) / 100;
        }
        runningSum += amountOwed;
        return {
          userId: s.userId,
          amountOwed,
          percentage: (share / amount) * 100
        };
      });
    } else if (splitType === 'PERCENTAGE') {
      let sumOfPercentages = 0;
      splits.forEach(s => { sumOfPercentages += Number(s.percentage || 0); });

      if (Math.abs(sumOfPercentages - 100) > 0.01) {
        return res.status(400).json({
          message: `Sum of percentages (${sumOfPercentages}%) must equal 100%`
        });
      }

      let runningSum = 0;
      calculatedSplits = splits.map((s, index) => {
        const pct = Number(s.percentage);
        let amountOwed = Math.round((baseAmountINR * (pct / 100)) * 100) / 100;
        if (index === splits.length - 1) {
          amountOwed = Math.round((baseAmountINR - runningSum) * 100) / 100;
        }
        runningSum += amountOwed;
        return {
          userId: s.userId,
          amountOwed,
          percentage: pct
        };
      });
    } else {
      return res.status(400).json({ message: 'Invalid split type' });
    }
  } catch (err) {
    return res.status(400).json({ message: 'Error calculating splits: ' + err.message });
  }

  try {
    // Run Anomaly Detection
    const detected = await detectManualAnomalies(
      { groupId, payerId, description, originalAmount: amount, date: expDate, currency },
      splits
    );

    const hasAnomalies = detected.length > 0;
    const initialStatus = hasAnomalies ? 'PENDING' : 'APPROVED';

    const result = await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          groupId,
          payerId,
          description: description.trim(),
          originalAmount: amount,
          currency,
          exchangeRate: rate,
          baseAmountINR,
          splitType,
          date: expDate,
          status: initialStatus
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

      // Save Anomalies if any
      if (hasAnomalies) {
        await Promise.all(
          detected.map(a =>
            tx.anomaly.create({
              data: {
                expenseId: expense.id,
                type: a.type,
                description: a.description,
                status: 'PENDING'
              }
            })
          )
        );
      }

      return await tx.expense.findUnique({
        where: { id: expense.id },
        include: {
          splits: { include: { user: { select: { id: true, name: true, email: true } } } },
          payer: { select: { id: true, name: true, email: true } },
          anomalies: true
        }
      });
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error('Create expense error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getGroupExpenses = async (req, res) => {
  const { groupId } = req.params;

  try {
    const expenses = await prisma.expense.findMany({
      where: { groupId },
      include: {
        payer: { select: { id: true, name: true, email: true } },
        splits: { include: { user: { select: { id: true, name: true, email: true } } } },
        anomalies: true
      },
      orderBy: { date: 'desc' }
    });

    return res.status(200).json(expenses);
  } catch (error) {
    console.error('Get group expenses error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const updateExpense = async (req, res) => {
  const { expenseId } = req.params;
  const { description, status } = req.body;

  try {
    const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    // Handlers can approve/reject pending anomalies
    if (status && (status === 'APPROVED' || status === 'REJECTED')) {
      const updated = await prisma.$transaction(async (tx) => {
        const exp = await tx.expense.update({
          where: { id: expenseId },
          data: { status }
        });

        // Also update any related anomalies
        await tx.anomaly.updateMany({
          where: { expenseId },
          data: { status }
        });

        return exp;
      });

      return res.status(200).json(updated);
    }

    // General text edit
    const updated = await prisma.expense.update({
      where: { id: expenseId },
      data: {
        description: description ? description.trim() : expense.description
      }
    });

    return res.status(200).json(updated);
  } catch (error) {
    console.error('Update expense error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const deleteExpense = async (req, res) => {
  const { expenseId } = req.params;

  try {
    const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    await prisma.expense.delete({ where: { id: expenseId } });
    return res.status(200).json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Delete expense error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};
