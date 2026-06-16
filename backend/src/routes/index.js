import express from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import missionRoutes from './missionRoutes.js';
import guildRoutes from './guildRoutes.js';
import meditationRoutes from './meditationRoutes.js';
import sleepRoutes from './sleepRoutes.js';
import shopRoutes from './shopRoutes.js';
import achievementRoutes from './achievementRoutes.js';
import habitRoutes from './habitRoutes.js';
import workoutRoutes from './workoutRoutes.js';
import challengeRoutes from './challengeRoutes.js';
import pomodoroRoutes from './pomodoroRoutes.js';
import financeRoutes from './financeRoutes.js';
import duelRoutes from './duelRoutes.js';

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
      '/api/achievements',
      '/api/habits',
      '/api/workouts',
      '/api/challenges',
      '/api/pomodoro',
      '/api/finance',
      '/api/duels',
    ],
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/missions', missionRoutes);
router.use('/guilds', guildRoutes);
router.use('/meditation', meditationRoutes);
router.use('/sleep', sleepRoutes);
router.use('/achievements', achievementRoutes);
router.use('/habits', habitRoutes);
router.use('/workouts', workoutRoutes);
router.use('/challenges', challengeRoutes);
router.use('/pomodoro', pomodoroRoutes);
router.use('/finance', financeRoutes);
router.use('/duels', duelRoutes);
// shop e inventory compartilham o mesmo arquivo de rotas
router.use('/', shopRoutes);

export default router;
