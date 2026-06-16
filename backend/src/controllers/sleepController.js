import { supabase } from '../config/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { clampStat } from '../utils/gamification.js';
import { serializeSleep } from '../utils/serializers.js';

/**
 * @route   POST /api/sleep
 * @desc    Registra uma noite de sono e concede HP conforme qualidade/duração
 * @access  Privado
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

  const hours = durationMinutes / 60;
  const idealScore = Math.max(0, 1 - Math.abs(hours - 8) / 8);
  const q = quality || 3;
  const hpGained = Math.round(40 * idealScore * (q / 5));

  const { data: record, error } = await supabase
    .from('sleep_records')
    .insert({
      user_id: req.user.id,
      bedtime: start.toISOString(),
      wake_time: end.toISOString(),
      duration_minutes: durationMinutes,
      quality: q,
      hp_gained: hpGained,
      date: end.toISOString().slice(0, 10),
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  const stats = { ...req.user.stats };
  stats.hp = clampStat(stats.hp + hpGained, stats.maxHp);

  const { error: uErr } = await supabase
    .from('users')
    .update({ stats, updated_at: new Date().toISOString() })
    .eq('id', req.user.id);
  if (uErr) throw new Error(uErr.message);

  res.status(201).json({ record: serializeSleep(record), stats });
});

/**
 * @route   GET /api/sleep
 * @desc    Histórico de sono
 * @access  Privado
 */
export const getHistory = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  const { data, error } = await supabase
    .from('sleep_records')
    .select('*')
    .eq('user_id', req.user.id)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  res.json((data || []).map(serializeSleep));
});

/**
 * @route   GET /api/sleep/stats
 * @desc    Médias de sono
 * @access  Privado
 */
export const getStats = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('sleep_records')
    .select('duration_minutes, quality, hp_gained')
    .eq('user_id', req.user.id);

  if (error) throw new Error(error.message);

  const records = data || [];
  const nights = records.length;
  const avgMinutes = nights ? records.reduce((s, r) => s + (r.duration_minutes || 0), 0) / nights : 0;
  const avgQuality = nights ? records.reduce((s, r) => s + (r.quality || 0), 0) / nights : 0;
  const totalHpGained = records.reduce((s, r) => s + (r.hp_gained || 0), 0);

  res.json({
    nights,
    avgMinutes,
    avgQuality,
    totalHpGained,
    avgHours: Math.round((avgMinutes / 60) * 10) / 10,
  });
});
