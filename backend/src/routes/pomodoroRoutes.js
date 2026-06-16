import express from 'express';
import { logSession, getStats } from '../controllers/pomodoroController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/stats', getStats);
router.post('/', logSession);

export default router;
