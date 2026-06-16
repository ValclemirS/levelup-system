import express from 'express';
import {
  listHabits,
  createHabit,
  updateHabit,
  deleteHabit,
  checkHabit,
  uncheckHabit,
  getCalendar,
  getStats,
} from '../controllers/habitController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/stats', getStats);
router.get('/calendar', getCalendar);
router.get('/', listHabits);
router.post('/', createHabit);
router.put('/:id', updateHabit);
router.delete('/:id', deleteHabit);
router.post('/:id/check', checkHabit);
router.delete('/:id/check', uncheckHabit);

export default router;
