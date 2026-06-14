import prisma from '../config/db.js';

export const calculateGroupBalances = async (groupId) => {
  // Get all members (even if they left, they may still have outstanding splits)
  const memberships = await prisma.membership.findMany({
    where: { groupId },
    include: { user: { select: { id: true, name: true, email: true } } }
  });

  const uniqueUsers = new Map();
  memberships.forEach(m => {
    uniqueUsers.set(m.userId, m.user);
  });

  const usersList = Array.from(uniqueUsers.values());

  // Get all approved expenses in the group
  const expenses = await prisma.expense.findMany({
    where: {
      groupId,
      status: 'APPROVED'
    },
    include: {
      splits: true
    }
  });

  // Get all recorded settlements in the group
  const settlements = await prisma.settlement.findMany({
    where: { groupId }
  });

  // Calculate totals for each user
  const balanceSheet = usersList.map(user => {
    // Total paid as payer
    const paidExpensesSum = expenses
      .filter(e => e.payerId === user.id)
      .reduce((sum, e) => sum + Number(e.baseAmountINR), 0);

    // Total owed as participant
    let owedSplitsSum = 0;
    expenses.forEach(e => {
      const split = e.splits.find(s => s.userId === user.id);
      if (split) {
        owedSplitsSum += Number(split.amountOwed);
      }
    });

    // Settlements Paid
    const settlementsPaidSum = settlements
      .filter(s => s.payerId === user.id)
      .reduce((sum, s) => sum + Number(s.amount), 0);

    // Settlements Received
    const settlementsReceivedSum = settlements
      .filter(s => s.payeeId === user.id)
      .reduce((sum, s) => sum + Number(s.amount), 0);

    // Net Balance = (Total Paid + Settlements Paid) - (Total Owed + Settlements Received)
    const netBalance = (paidExpensesSum + settlementsPaidSum) - (owedSplitsSum + settlementsReceivedSum);

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      totalPaid: Math.round(paidExpensesSum * 100) / 100,
      totalOwed: Math.round(owedSplitsSum * 100) / 100,
      settlementsPaid: Math.round(settlementsPaidSum * 100) / 100,
      settlementsReceived: Math.round(settlementsReceivedSum * 100) / 100,
      netBalance: Math.round(netBalance * 100) / 100
    };
  });

  return balanceSheet;
};
