import express from 'express';
import {
  createGroup,
  joinGroup,
  getMyGroups,
  getGroupMembers,
  leaveGroup,
  deleteGroup,
  downloadReport
} from '../controllers/group.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.post('/create', createGroup);
router.post('/join', joinGroup);
router.get('/my-groups', getMyGroups);
router.get('/:groupId/members', getGroupMembers);
router.put('/leave/:groupId', leaveGroup);
router.delete('/:groupId', deleteGroup);
router.get('/:groupId/report', downloadReport);

export default router;
