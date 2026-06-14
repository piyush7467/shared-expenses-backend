import { calculateGroupBalances } from './balance.service.js';

export const getSettlementSuggestions = async (groupId) => {
  const balances = await calculateGroupBalances(groupId);

  // Select users who have non-zero balance (allowing for minute rounding errors under 0.05)
  const members = balances
    .map(b => ({
      userId: b.userId,
      name: b.name,
      email: b.email,
      balance: b.netBalance
    }))
    .filter(u => Math.abs(u.balance) > 0.05);

  // Sort debtors in ascending order (most negative first)
  const debtors = members
    .filter(u => u.balance < 0)
    .sort((a, b) => a.balance - b.balance);

  // Sort creditors in descending order (most positive first)
  const creditors = members
    .filter(u => u.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  const suggestions = [];
  let dIndex = 0;
  let cIndex = 0;

  while (dIndex < debtors.length && cIndex < creditors.length) {
    const debtor = debtors[dIndex];
    const creditor = creditors[cIndex];

    const oweAmount = Math.abs(debtor.balance);
    const receiveAmount = creditor.balance;

    // Settle the smaller of the two balances
    const payment = Math.min(oweAmount, receiveAmount);

    suggestions.push({
      fromUser: {
        id: debtor.userId,
        name: debtor.name,
        email: debtor.email
      },
      toUser: {
        id: creditor.userId,
        name: creditor.name,
        email: creditor.email
      },
      amount: Math.round(payment * 100) / 100
    });

    debtor.balance += payment;
    creditor.balance -= payment;

    if (Math.abs(debtor.balance) < 0.05) {
      dIndex++;
    }
    if (Math.abs(creditor.balance) < 0.05) {
      cIndex++;
    }
  }

  return suggestions;
};
