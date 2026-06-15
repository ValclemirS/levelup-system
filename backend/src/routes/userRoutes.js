import express from 'express';
import {
  getProfile,
  updateProfile,
  grantXp,
  adjustVitals,
  getLeaderboard,
  getJourney,
  savePushToken,
} from '../controllers/userController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect); // todas as rotas exigem autenticação

router.get('/leaderboard', getLeaderboard);
router.get('/me', getProfile);
router.put('/me', updateProfile);
router.post('/me/xp', grantXp);
router.post('/me/vitals', adjustVitals);
router.get('/me/journey', getJourney);
router.put('/me/push-token', savePushToken);

export default router;
