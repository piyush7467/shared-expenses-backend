import express from 'express';
import { importCSV, getImportReports } from '../controllers/import.controller.js';
import upload from '../middleware/upload.middleware.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);

// Endpoint matches: POST /api/import/csv
router.post('/csv', upload.single('file'), importCSV);
router.get('/reports/group/:groupId', getImportReports);

export default router;
