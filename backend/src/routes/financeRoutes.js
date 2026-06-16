import express from 'express';
import {
  listTransactions,
  addTransaction,
  deleteTransaction,
  getSummary,
  getEvolution,
  setGoal,
} from '../controllers/financeController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/summary', getSummary);
router.get('/evolution', getEvolution);
router.put('/goal', setGoal);
router.get('/transactions', listTransactions);
router.post('/transactions', addTransaction);
router.delete('/transactions/:id', deleteTransaction);

export default router;
