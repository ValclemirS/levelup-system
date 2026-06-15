import MeditationSession from '../models/MeditationSession.js';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { applyXpToUser } from '../utils/gamification.js';

/**
 * @route   POST /api/meditation
 * @desc    Registra uma sessão de meditação e concede Mana + XP
 * @access  Privado
 * @body    { durationSeconds, technique, cycles }
 */
export const logSession = asyncHandler(async (req, res) => {
  const { durationSeconds, technique, cycles } = req.body;

  if (!durationSeconds || durationSeconds <= 0) {
    res.status(400);
    throw new Error('durationSeconds deve ser maior que zero');
  }

  // Recompensa proporcional ao tempo: ~1 mana / 30s, 1 XP / minuto
  const minutes = durationSeconds / 60;
  const manaGained = Math.round(durationSeconds / 30);
  const xpGained = Math.round(minutes) * 5;

  const session = await MeditationSession.create({
    user: req.user._id,
    technique: technique || 'box-breathing',
    durationSeconds,
    cycles: cycles || 0,
    manaGained,
    xpGained,
  });

  const user = await User.findById(req.user._id);
  // XP da sessão + ganho de Mana proporcional ao tempo meditado.
  applyXpToUser(user, xpGained, { mana: manaGained });
  await user.save();

  res.status(201).json({ session, stats: user.stats });
});

/**
 * @route   GET /api/meditation
 * @desc    Histórico de sessões
 * @access  Privado
 */
export const getHistory = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  const sessions = await MeditationSession.find({ user: req.user._id })
    .sort({ completedAt: -1 })
    .limit(limit);
  res.json(sessions);
});

/**
 * @route   GET /api/meditation/stats
 * @desc    Estatísticas agregadas de meditação
 * @access  Privado
 */
export const getStats = asyncHandler(async (req, res) => {
  const agg = await MeditationSession.aggregate([
    { $match: { user: req.user._id } },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        totalSeconds: { $sum: '$durationSeconds' },
        totalCycles: { $sum: '$cycles' },
        totalMana: { $sum: '$manaGained' },
      },
    },
  ]);

  const stats = agg[0] || {
    totalSessions: 0,
    totalSeconds: 0,
    totalCycles: 0,
    totalMana: 0,
  };
  delete stats._id;
  stats.totalMinutes = Math.round((stats.totalSeconds || 0) / 60);

  res.json(stats);
});
