import express from 'express';
import { getBalances, getSuggestions } from '../controllers/balance.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/group/:groupId', getBalances);
router.get('/suggestions/group/:groupId', getSuggestions); // Standard route fallback

export default router;
