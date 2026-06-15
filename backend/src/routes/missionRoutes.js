import express from 'express';
import {
  getMissions,
  getTodayMissions,
  createMission,
  completeMission,
  deleteMission,
} from '../controllers/missionController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/today', getTodayMissions);
router.get('/', getMissions);
router.post('/', createMission);
router.post('/:id/complete', completeMission);
router.delete('/:id', deleteMission);

export default router;
