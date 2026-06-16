import { supabase } from '../config/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { applyXpToStats, XP_REWARDS } from '../utils/gamification.js';
import { evaluateAchievements } from '../utils/achievements.js';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * @route   POST /api/pomodoro
 * @desc    Registra uma sessão de foco concluída. Concede +50 XP.
 * @access  Privado
 * @body    { focusMinutes, breakMinutes, cycles }
 */
export const logSession = asyncHandler(async (req, res) => {
  const focusMinutes = Math.max(Number(req.body.focusMinutes) || 0, 0);
  const breakMinutes = Math.max(Number(req.body.breakMinutes) || 0, 0);
  const cycles = Math.max(Number(req.body.cycles) || 0, 0);

  if (cycles <= 0 && focusMinutes <= 0) {
    res.status(400);
    throw new Error('Sessão vazia: conclua ao menos um ciclo de foco');
  }

  const { data: session, error } = await supabase
    .from('pomodoro_sessions')
    .insert({
      user_id: req.user.id,
      focus_minutes: focusMinutes,
      break_minutes: breakMinutes,
      cycles,
      date: today(),
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  const xpGained = XP_REWARDS.pomodoro;
  const { stats } = applyXpToStats(req.user.stats, xpGained);
  await supabase
    .from('users')
    .update({ stats, updated_at: new Date().toISOString() })
    .eq('id', req.user.id);
  req.user.stats = stats;

  const unlocked = await evaluateAchievements(req.user);

  res.status(201).json({
    session: {
      id: session.id,
      focusMinutes: session.focus_minutes,
      cycles: session.cycles,
      date: session.date,
    },
    xpGained,
    stats,
    unlockedAchievements: unlocked,
  });
});

/**
 * @route   GET /api/pomodoro/stats
 * @desc    Minutos focados (hoje/semana), ciclos do dia e sessões.
 * @access  Privado
 */
export const getStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 6);

  const { data, error } = await supabase
    .from('pomodoro_sessions')
    .select('focus_minutes, cycles, date')
    .eq('user_id', req.user.id)
    .gte('date', iso(weekAgo));
  if (error) throw new Error(error.message);

  const sessions = data || [];
  const t = iso(now);
  const todaySessions = sessions.filter((s) => s.date === t);

  res.json({
    todayMinutes: todaySessions.reduce((a, s) => a + (s.focus_minutes || 0), 0),
    todayCycles: todaySessions.reduce((a, s) => a + (s.cycles || 0), 0),
    todaySessions: todaySessions.length,
    weekMinutes: sessions.reduce((a, s) => a + (s.focus_minutes || 0), 0),
    weekSessions: sessions.length,
  });
});
