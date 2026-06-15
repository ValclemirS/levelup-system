import express from 'express';
import {
  createGuild,
  listGuilds,
  getGuildLeaderboard,
  getGuild,
  joinGuild,
  leaveGuild,
} from '../controllers/guildController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/leaderboard', getGuildLeaderboard);
router.get('/', listGuilds);
router.post('/', createGuild);
router.get('/:id', getGuild);
router.post('/:id/join', joinGuild);
router.post('/:id/leave', leaveGuild);

export default router;
