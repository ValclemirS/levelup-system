import { supabase } from '../config/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { applyXpToStats } from '../utils/gamification.js';
import { serializeMeditation } from '../utils/serializers.js';

/**
 * @route   POST /api/meditation
 * @desc    Registra uma sessão de meditação e concede Mana + XP
 * @access  Privado
 */
export const logSession = asyncHandler(async (req, res) => {
  const { durationSeconds, technique, cycles } = req.body;

  if (!durationSeconds || durationSeconds <= 0) {
    res.status(400);
    throw new Error('durationSeconds deve ser maior que zero');
  }

  const minutes = durationSeconds / 60;
  const manaGained = Math.round(durationSeconds / 30);
  const xpGained = Math.round(minutes) * 5;

  const { data: session, error } = await supabase
    .from('meditation_sessions')
    .insert({
      user_id: req.user.id,
      technique: technique || 'box-breathing',
      duration_seconds: durationSeconds,
      cycles: cycles || 0,
      mana_gained: manaGained,
      xp_gained: xpGained,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  const { stats } = applyXpToStats(req.user.stats, xpGained, { mana: manaGained });

  const { error: uErr } = await supabase
    .from('users')
    .update({ stats, updated_at: new Date().toISOString() })
    .eq('id', req.user.id);
  if (uErr) throw new Error(uErr.message);

  res.status(201).json({ session: serializeMeditation(session), stats });
});

/**
 * @route   GET /api/meditation
 * @desc    Histórico de sessões
 * @access  Privado
 */
export const getHistory = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  const { data, error } = await supabase
    .from('meditation_sessions')
    .select('*')
    .eq('user_id', req.user.id)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  res.json((data || []).map(serializeMeditation));
});

/**
 * @route   GET /api/meditation/stats
 * @desc    Estatísticas agregadas de meditação
 * @access  Privado
 */
export const getStats = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('meditation_sessions')
    .select('duration_seconds, cycles, mana_gained')
    .eq('user_id', req.user.id);

  if (error) throw new Error(error.message);

  const sessions = data || [];
  const totalSeconds = sessions.reduce((s, r) => s + (r.duration_seconds || 0), 0);
  const stats = {
    totalSessions: sessions.length,
    totalSeconds,
    totalCycles: sessions.reduce((s, r) => s + (r.cycles || 0), 0),
    totalMana: sessions.reduce((s, r) => s + (r.mana_gained || 0), 0),
    totalMinutes: Math.round(totalSeconds / 60),
  };

  res.json(stats);
});
