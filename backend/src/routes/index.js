import express from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import missionRoutes from './missionRoutes.js';
import guildRoutes from './guildRoutes.js';
import meditationRoutes from './meditationRoutes.js';
import sleepRoutes from './sleepRoutes.js';
import shopRoutes from './shopRoutes.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    name: 'LevelUp System API',
    version: '1.0.0',
    status: 'online',
    endpoints: [
      '/api/auth',
      '/api/users',
      '/api/missions',
      '/api/guilds',
      '/api/meditation',
      '/api/sleep',
      '/api/shop',
      '/api/inventory',
    ],
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/missions', missionRoutes);
router.use('/guilds', guildRoutes);
router.use('/meditation', meditationRoutes);
router.use('/sleep', sleepRoutes);
// shop e inventory compartilham o mesmo arquivo de rotas
router.use('/', shopRoutes);

export default router;
