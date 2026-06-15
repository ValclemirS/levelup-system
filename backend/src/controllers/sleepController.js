import SleepRecord from '../models/SleepRecord.js';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { clampStat } from '../utils/gamification.js';

/**
 * @route   POST /api/sleep
 * @desc    Registra uma noite de sono e concede HP conforme qualidade/duração
 * @access  Privado
 * @body    { bedtime, wakeTime, quality }
 */
export const logSleep = asyncHandler(async (req, res) => {
  const { bedtime, wakeTime, quality } = req.body;

  if (!bedtime || !wakeTime) {
    res.status(400);
    throw new Error('bedtime e wakeTime são obrigatórios (datas ISO)');
  }

  const start = new Date(bedtime);
  const end = new Date(wakeTime);
  let durationMinutes = Math.round((end - start) / 60000);
  if (durationMinutes < 0) durationMinutes += 24 * 60; // virou o dia

  // HP ganho: cheio (40) perto de 8h de sono, penaliza muito pouco ou muito
  const hours = durationMinutes / 60;
  const idealScore = Math.max(0, 1 - Math.abs(hours - 8) / 8); // 0..1
  const q = quality || 3;
  const hpGained = Math.round(40 * idealScore * (q / 5));

  const record = await SleepRecord.create({
    user: req.user._id,
    bedtime: start,
    wakeTime: end,
    durationMinutes,
    quality: q,
    hpGained,
    date: end.toISOString().slice(0, 10),
  });

  const user = await User.findById(req.user._id);
  user.stats.hp = clampStat(user.stats.hp + hpGained, user.stats.maxHp);
  await user.save();

  res.status(201).json({ record, stats: user.stats });
});

/**
 * @route   GET /api/sleep
 * @desc    Histórico de sono
 * @access  Privado
 */
export const getHistory = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  const records = await SleepRecord.find({ user: req.user._id })
    .sort({ date: -1 })
    .limit(limit);
  res.json(records);
});

/**
 * @route   GET /api/sleep/stats
 * @desc    Médias de sono
 * @access  Privado
 */
export const getStats = asyncHandler(async (req, res) => {
  const agg = await SleepRecord.aggregate([
    { $match: { user: req.user._id } },
    {
      $group: {
        _id: null,
        nights: { $sum: 1 },
        avgMinutes: { $avg: '$durationMinutes' },
        avgQuality: { $avg: '$quality' },
        totalHpGained: { $sum: '$hpGained' },
      },
    },
  ]);

  const stats = agg[0] || { nights: 0, avgMinutes: 0, avgQuality: 0, totalHpGained: 0 };
  delete stats._id;
  stats.avgHours = Math.round(((stats.avgMinutes || 0) / 60) * 10) / 10;

  res.json(stats);
});
