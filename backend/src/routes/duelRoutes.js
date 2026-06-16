import express from 'express';
import {
  createDuel,
  listDuels,
  acceptDuel,
  declineDuel,
  cancelDuel,
  resolveDuel,
} from '../controllers/duelController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', listDuels);
router.post('/', createDuel);
router.post('/:id/accept', acceptDuel);
router.post('/:id/decline', declineDuel);
router.post('/:id/cancel', cancelDuel);
router.post('/:id/resolve', resolveDuel);

export default router;
