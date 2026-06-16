import express from 'express';
import {
  listTemplates,
  listChallenges,
  startChallenge,
  checkinChallenge,
  deleteChallenge,
  getRanking,
} from '../controllers/challengeController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/templates', listTemplates);
router.get('/ranking', getRanking);
router.get('/', listChallenges);
router.post('/', startChallenge);
router.post('/:id/checkin', checkinChallenge);
router.delete('/:id', deleteChallenge);

export default router;
