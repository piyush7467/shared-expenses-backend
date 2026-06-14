import express from 'express';
import { createSettlement, getGroupSettlements } from '../controllers/settlement.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.post('/create', createSettlement);
router.get('/group/:groupId', getGroupSettlements);

export default router;
