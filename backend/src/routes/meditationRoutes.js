import express from 'express';
import { logSession, getHistory, getStats } from '../controllers/meditationController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.post('/', logSession);
router.get('/', getHistory);
router.get('/stats', getStats);

export default router;
