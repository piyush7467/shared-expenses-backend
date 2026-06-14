import express from 'express';
import { getSuggestions } from '../controllers/balance.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/group/:groupId', getSuggestions);

export default router;
