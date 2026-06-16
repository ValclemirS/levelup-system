import express from 'express';
import {
  listExercises,
  getWorkout,
  addExercise,
  updateExercise,
  deleteExercise,
  logWorkout,
  getHistory,
  getStats,
} from '../controllers/workoutController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/exercises', listExercises);
router.get('/history', getHistory);
router.get('/stats', getStats);
router.post('/log', logWorkout);
router.get('/', getWorkout);
router.post('/', addExercise);
router.put('/:id', updateExercise);
router.delete('/:id', deleteExercise);

export default router;
