import express from 'express';
import {
  createExpense,
  getGroupExpenses,
  updateExpense,
  deleteExpense
} from '../controllers/expense.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.post('/create', createExpense);
router.get('/group/:groupId', getGroupExpenses);
router.put('/:expenseId', updateExpense);
router.delete('/:expenseId', deleteExpense);

export default router;
