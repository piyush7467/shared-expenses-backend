import prisma from '../config/db.js';

// Create a new personal transaction
export const createTransaction = async (req, res) => {
  const { type, category, amount, currency, exchangeRate, description, date } = req.body;

  if (!type || !category || !amount || !currency) {
    return res.status(400).json({ message: 'Type, category, amount, and currency are required.' });
  }

  if (type !== 'EXPENSE' && type !== 'INCOME') {
    return res.status(400).json({ message: 'Type must be EXPENSE or INCOME.' });
  }

  try {
    const rate = currency === 'INR' ? 1.0 : Number(exchangeRate || 84.0);
    const amt = Number(amount);
    const baseAmountINR = amt * rate;

    const transaction = await prisma.personalTransaction.create({
      data: {
        userId: req.user.id,
        type,
        category: category.trim(),
        amount: amt,
        currency,
        exchangeRate: rate,
        baseAmountINR,
        description: description?.trim() || null,
        date: date ? new Date(date) : new Date()
      }
    });

    return res.status(201).json(transaction);
  } catch (error) {
    console.error('Create personal transaction error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

// Get personal transactions with filters and totals
export const getTransactions = async (req, res) => {
  const { type, category, startDate, endDate } = req.query;

  try {
    const whereClause = {
      userId: req.user.id
    };

    if (type && (type === 'EXPENSE' || type === 'INCOME')) {
      whereClause.type = type;
    }

    if (category) {
      whereClause.category = {
        equals: category.trim(),
        mode: 'insensitive'
      };
    }

    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) {
        whereClause.date.gte = new Date(startDate);
      }
      if (endDate) {
        whereClause.date.lte = new Date(endDate);
      }
    }

    // Fetch transactions
    const transactions = await prisma.personalTransaction.findMany({
      where: whereClause,
      orderBy: { date: 'desc' }
    });

    // Fetch totals for ALL user transactions
    const allUserTx = await prisma.personalTransaction.findMany({
      where: { userId: req.user.id }
    });

    const totalIncomeINR = allUserTx
      .filter(tx => tx.type === 'INCOME')
      .reduce((sum, tx) => sum + Number(tx.baseAmountINR), 0);

    const totalExpenseINR = allUserTx
      .filter(tx => tx.type === 'EXPENSE')
      .reduce((sum, tx) => sum + Number(tx.baseAmountINR), 0);

    return res.status(200).json({
      transactions,
      summary: {
        totalIncomeINR: Math.round(totalIncomeINR * 100) / 100,
        totalExpenseINR: Math.round(totalExpenseINR * 100) / 100,
        netBalanceINR: Math.round((totalIncomeINR - totalExpenseINR) * 100) / 100
      }
    });
  } catch (error) {
    console.error('Get personal transactions error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

// Update personal transaction
export const updateTransaction = async (req, res) => {
  const { id } = req.params;
  const { type, category, amount, currency, exchangeRate, description, date } = req.body;

  try {
    const existing = await prisma.personalTransaction.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    if (existing.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access Denied: Not your transaction.' });
    }

    const updatedData = {};

    if (type) {
      if (type !== 'EXPENSE' && type !== 'INCOME') {
        return res.status(400).json({ message: 'Type must be EXPENSE or INCOME.' });
      }
      updatedData.type = type;
    }

    if (category) {
      updatedData.category = category.trim();
    }

    if (description !== undefined) {
      updatedData.description = description?.trim() || null;
    }

    if (date) {
      updatedData.date = new Date(date);
    }

    // Handle recalculating amount & currency base Amount
    const currencyVal = currency || existing.currency;
    const amountVal = amount !== undefined ? Number(amount) : Number(existing.amount);
    const rateVal = currencyVal === 'INR' ? 1.0 : Number(exchangeRate !== undefined ? exchangeRate : existing.exchangeRate);

    if (amount !== undefined || currency !== undefined || exchangeRate !== undefined) {
      updatedData.amount = amountVal;
      updatedData.currency = currencyVal;
      updatedData.exchangeRate = rateVal;
      updatedData.baseAmountINR = amountVal * rateVal;
    }

    const updatedTx = await prisma.personalTransaction.update({
      where: { id },
      data: updatedData
    });

    return res.status(200).json(updatedTx);
  } catch (error) {
    console.error('Update personal transaction error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

// Delete personal transaction
export const deleteTransaction = async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await prisma.personalTransaction.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    if (existing.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access Denied: Not your transaction.' });
    }

    await prisma.personalTransaction.delete({
      where: { id }
    });

    return res.status(200).json({ message: 'Transaction deleted successfully.' });
  } catch (error) {
    console.error('Delete personal transaction error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};
