import express from 'express';
import {
  listShop,
  buyItem,
  getInventory,
  useItem,
} from '../controllers/inventoryController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// protect por rota (e não router.use) para que URLs inexistentes
// caiam no handler de 404 em vez de responder 401
// Loja
router.get('/shop', protect, listShop);
router.post('/shop/:id/buy', protect, buyItem);

// Inventário
router.get('/inventory', protect, getInventory);
router.post('/inventory/:id/use', protect, useItem);

export default router;
