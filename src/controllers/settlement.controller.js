import prisma from '../config/db.js';

export const createSettlement = async (req, res) => {
  const { groupId, payerId, payeeId, amount, date } = req.body;

  if (!groupId || !payerId || !payeeId || !amount) {
    return res.status(400).json({ message: 'Missing required settlement fields' });
  }

  const numericAmount = Number(amount);
  if (numericAmount <= 0) {
    return res.status(400).json({ message: 'Settlement amount must be greater than zero' });
  }

  try {
    // Verify payer and payee belong to the group
    const memberships = await prisma.membership.findMany({
      where: {
        groupId,
        userId: { in: [payerId, payeeId] }
      }
    });

    if (memberships.length < 2 && payerId !== payeeId) {
      return res.status(400).json({ message: 'Both payer and payee must be group members' });
    }

    const settlement = await prisma.settlement.create({
      data: {
        groupId,
        payerId,
        payeeId,
        amount: numericAmount,
        date: date ? new Date(date) : new Date()
      },
      include: {
        payer: { select: { id: true, name: true, email: true } },
        payee: { select: { id: true, name: true, email: true } }
      }
    });

    return res.status(201).json(settlement);
  } catch (error) {
    console.error('Create settlement error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getGroupSettlements = async (req, res) => {
  const { groupId } = req.params;

  try {
    const settlements = await prisma.settlement.findMany({
      where: { groupId },
      include: {
        payer: { select: { id: true, name: true, email: true } },
        payee: { select: { id: true, name: true, email: true } }
      },
      orderBy: { date: 'desc' }
    });

    return res.status(200).json(settlements);
  } catch (error) {
    console.error('Get group settlements error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};
