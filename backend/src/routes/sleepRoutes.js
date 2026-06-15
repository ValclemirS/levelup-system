import express from 'express';
import { logSleep, getHistory, getStats } from '../controllers/sleepController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.post('/', logSleep);
router.get('/', getHistory);
router.get('/stats', getStats);

export default router;
