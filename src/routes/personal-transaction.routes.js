import express from 'express';
import {
  createTransaction,
  getTransactions,
  updateTransaction,
  deleteTransaction
} from '../controllers/personal-transaction.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.post('/', createTransaction);
router.get('/', getTransactions);
router.put('/:id', updateTransaction);
router.delete('/:id', deleteTransaction);

export default router;
