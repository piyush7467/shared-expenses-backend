import prisma from '../config/db.js';
import { calculateGroupBalances } from '../services/balance.service.js';
import { getSettlementSuggestions } from '../services/settlement.service.js';
import { processCSVImport } from '../services/csv.service.js';

// Setup Mock Data
const MOCK_USERS = [
  { id: '1', email: 'aisha@mail.com', name: 'Aisha' },
  { id: '2', email: 'rohan@mail.com', name: 'Rohan' },
  { id: '3', email: 'priya@mail.com', name: 'Priya' }
];

const MOCK_MEMBERSHIPS = [
  { id: 'm1', userId: '1', groupId: 'g1', joinedAt: new Date('2026-01-01'), leftAt: null, user: MOCK_USERS[0] },
  { id: 'm2', userId: '2', groupId: 'g1', joinedAt: new Date('2026-01-01'), leftAt: null, user: MOCK_USERS[1] },
  { id: 'm3', userId: '3', groupId: 'g1', joinedAt: new Date('2026-01-01'), leftAt: null, user: MOCK_USERS[2] }
];

// Test Runner
async function runTests() {
  console.log('=== STARTING UNIT TESTS FOR EXPENSE & SETTLEMENT ENGINE ===\n');

  // Test 1: Balance Calculation Mock
  console.log('Test 1: Verifying group balance calculations...');
  
  // Mock expenses: Aisha paid 1200 INR split equally among 3 users (Aisha, Rohan, Priya).
  // Aisha should have Paid = 1200, Owed = 400. Net = +800
  // Rohan should have Paid = 0, Owed = 400. Net = -400
  // Priya should have Paid = 0, Owed = 400. Net = -400
  const mockExpenses = [
    {
      id: 'e1',
      groupId: 'g1',
      payerId: '1',
      description: 'Dinner',
      originalAmount: 1200,
      currency: 'INR',
      exchangeRate: 1.0,
      baseAmountINR: 1200,
      splitType: 'EQUAL',
      date: new Date(),
      status: 'APPROVED',
      splits: [
        { id: 's1', expenseId: 'e1', userId: '1', amountOwed: 400, percentage: 33.33 },
        { id: 's2', expenseId: 'e1', userId: '2', amountOwed: 400, percentage: 33.33 },
        { id: 's3', expenseId: 'e1', userId: '3', amountOwed: 400, percentage: 33.33 }
      ]
    }
  ];

  // Intercept Prisma Client Methods
  prisma.membership.findMany = async () => MOCK_MEMBERSHIPS;
  prisma.expense.findMany = async () => mockExpenses;
  prisma.settlement.findMany = async () => [];

  const balances = await calculateGroupBalances('g1');
  console.log('Calculated Balances:', balances.map(b => `${b.name}: paid=${b.totalPaid}, owed=${b.totalOwed}, net=${b.netBalance}`));
  
  const aishaBal = balances.find(b => b.userId === '1');
  const rohanBal = balances.find(b => b.userId === '2');
  const priyaBal = balances.find(b => b.userId === '3');

  if (aishaBal.netBalance === 800 && rohanBal.netBalance === -400 && priyaBal.netBalance === -400) {
    console.log('✅ Test 1 Passed: Equal split calculations are correct.');
  } else {
    console.error('❌ Test 1 Failed: Balance mismatch!');
  }

  console.log('\n-----------------------------------------------\n');

  // Test 2: Settlement Suggestions Greedy Algorithm
  console.log('Test 2: Verifying greedy settlement suggestions solver...');
  const suggestions = await getSettlementSuggestions('g1');
  console.log('Generated Suggestions:', suggestions.map(s => `${s.fromUser.name} pays ${s.toUser.name} ₹${s.amount}`));

  const check1 = suggestions.find(s => s.fromUser.name === 'Rohan' && s.toUser.name === 'Aisha' && s.amount === 400);
  const check2 = suggestions.find(s => s.fromUser.name === 'Priya' && s.toUser.name === 'Aisha' && s.amount === 400);

  if (suggestions.length === 2 && check1 && check2) {
    console.log('✅ Test 2 Passed: Settlement suggestions resolved Aisha +800, Rohan -400, Priya -400 correctly.');
  } else {
    console.error('❌ Test 2 Failed: Suggestions solver failed!');
  }

  console.log('\n=== UNIT TESTS COMPLETE ===');
}

runTests().catch(console.error);
