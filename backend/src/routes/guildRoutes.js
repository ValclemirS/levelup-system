import express from 'express';
import {
  createGuild,
  listGuilds,
  getGuildLeaderboard,
  getGuild,
  joinGuild,
  leaveGuild,
} from '../controllers/guildController.js';
import {
  getMessages,
  postMessage,
  listGuildChallenges,
  createGuildChallenge,
  contributeGuildChallenge,
} from '../controllers/guildSocialController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/leaderboard', getGuildLeaderboard);
router.get('/', listGuilds);
router.post('/', createGuild);

// Chat
router.get('/:id/messages', getMessages);
router.post('/:id/messages', postMessage);

// Desafios de guilda
router.get('/:id/challenges', listGuildChallenges);
router.post('/:id/challenges', createGuildChallenge);
router.post('/:gid/challenges/:cid/contribute', contributeGuildChallenge);

router.get('/:id', getGuild);
router.post('/:id/join', joinGuild);
router.post('/:id/leave', leaveGuild);

export default router;
