import prisma from '../config/db.js';
import { createTransaction, getTransactions } from '../controllers/personal-transaction.controller.js';

async function runPersonalTests() {
  console.log('=== STARTING OFFLINE UNIT TESTS FOR PERSONAL TRANSACTION CONTROLLERS ===\n');

  const mockTx = [];

  // Mock Prisma Create
  prisma.personalTransaction.create = async ({ data }) => {
    const record = { id: 'tx-' + Math.random(), ...data };
    mockTx.push(record);
    return record;
  };

  // Mock Prisma FindMany
  prisma.personalTransaction.findMany = async ({ where }) => {
    return mockTx.filter(t => t.userId === where.userId);
  };

  // Mock req & res for create
  const req1 = {
    user: { id: 'user-1' },
    body: {
      type: 'INCOME',
      category: 'Salary',
      amount: 5000,
      currency: 'INR',
      description: 'Monthly Salary'
    }
  };

  let status1, json1;
  const res1 = {
    status: (code) => { status1 = code; return res1; },
    json: (data) => { json1 = data; return res1; }
  };

  await createTransaction(req1, res1);

  if (status1 === 201 && json1.amount === 5000 && json1.baseAmountINR === 5000) {
    console.log('✅ Test 1 Passed: Create personal transaction (INR) is correct.');
  } else {
    console.error('❌ Test 1 Failed: createTransaction response mismatch!', status1, json1);
  }

  // Mock req & res for create (USD)
  const req2 = {
    user: { id: 'user-1' },
    body: {
      type: 'EXPENSE',
      category: 'Food',
      amount: 100,
      currency: 'USD',
      exchangeRate: 84.0,
      description: 'Dinner out'
    }
  };

  let status2, json2;
  const res2 = {
    status: (code) => { status2 = code; return res2; },
    json: (data) => { json2 = data; return res2; }
  };

  await createTransaction(req2, res2);

  if (status2 === 201 && json2.amount === 100 && json2.baseAmountINR === 8400) {
    console.log('✅ Test 2 Passed: Create personal transaction (USD) handles conversion correctly.');
  } else {
    console.error('❌ Test 2 Failed: createTransaction (USD) response mismatch!', status2, json2);
  }

  // Mock req & res for get
  const req3 = {
    user: { id: 'user-1' },
    query: {}
  };

  let status3, json3;
  const res3 = {
    status: (code) => { status3 = code; return res3; },
    json: (data) => { json3 = data; return res3; }
  };

  await getTransactions(req3, res3);

  if (status3 === 200 && json3.transactions.length === 2 && json3.summary.totalIncomeINR === 5000 && json3.summary.totalExpenseINR === 8400 && json3.summary.netBalanceINR === -3400) {
    console.log('✅ Test 3 Passed: List personal transactions and summary calculations are correct.');
  } else {
    console.error('❌ Test 3 Failed: getTransactions response mismatch!', status3, json3);
  }

  console.log('\n=== UNIT TESTS COMPLETE ===');
}

runPersonalTests().catch(console.error);
