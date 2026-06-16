import { supabase } from '../config/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { applyXpToStats, computeStreak, XP_REWARDS } from '../utils/gamification.js';
import { evaluateAchievements } from '../utils/achievements.js';
import { serializeHabit } from '../utils/serializers.js';

const today = () => new Date().toISOString().slice(0, 10);

/** Recalcula e persiste o streak de um hábito a partir dos seus logs. */
async function recomputeStreak(habitId) {
  const { data: logs } = await supabase
    .from('habit_logs')
    .select('date')
    .eq('habit_id', habitId);
  const dates = (logs || []).map((l) => l.date);
  const { current, longest } = computeStreak(dates);
  const last = dates.length ? dates.slice().sort().at(-1) : null;
  await supabase
    .from('habits')
    .update({ current_streak: current, longest_streak: longest, last_completed: last })
    .eq('id', habitId);
  return { current, longest };
}

/**
 * @route   GET /api/habits
 * @desc    Lista hábitos ativos do usuário, com status de hoje.
 * @access  Privado
 */
export const listHabits = asyncHandler(async (req, res) => {
  const { data: habits, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', req.user.id)
    .eq('archived', false)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  const ids = (habits || []).map((h) => h.id);
  let doneSet = new Set();
  if (ids.length) {
    const { data: logs } = await supabase
      .from('habit_logs')
      .select('habit_id')
      .eq('user_id', req.user.id)
      .eq('date', today())
      .in('habit_id', ids);
    doneSet = new Set((logs || []).map((l) => l.habit_id));
  }

  res.json((habits || []).map((h) => serializeHabit(h, { doneToday: doneSet.has(h.id) })));
});

/**
 * @route   POST /api/habits
 * @desc    Cria um hábito.
 * @access  Privado
 */
export const createHabit = asyncHandler(async (req, res) => {
  const { title, description, icon, color, frequency, targetPerWeek } = req.body;
  if (!title) {
    res.status(400);
    throw new Error('Título do hábito é obrigatório');
  }

  const { data: habit, error } = await supabase
    .from('habits')
    .insert({
      user_id: req.user.id,
      title,
      description: description || '',
      icon: icon || '🎯',
      color: color || '#f5c518',
      frequency: frequency === 'weekly' ? 'weekly' : 'daily',
      target_per_week: Math.min(Math.max(Number(targetPerWeek) || 7, 1), 7),
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  res.status(201).json(serializeHabit(habit, { doneToday: false }));
});

/**
 * @route   PUT /api/habits/:id
 * @desc    Edita um hábito.
 * @access  Privado
 */
export const updateHabit = asyncHandler(async (req, res) => {
  const { title, description, icon, color, frequency, targetPerWeek, archived } = req.body;
  const patch = {};
  if (title !== undefined) patch.title = title;
  if (description !== undefined) patch.description = description;
  if (icon !== undefined) patch.icon = icon;
  if (color !== undefined) patch.color = color;
  if (frequency !== undefined) patch.frequency = frequency === 'weekly' ? 'weekly' : 'daily';
  if (targetPerWeek !== undefined) patch.target_per_week = Math.min(Math.max(Number(targetPerWeek) || 7, 1), 7);
  if (archived !== undefined) patch.archived = !!archived;

  const { data: habit, error } = await supabase
    .from('habits')
    .update(patch)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('*')
    .single();
  if (error || !habit) {
    res.status(404);
    throw new Error('Hábito não encontrado');
  }
  res.json(serializeHabit(habit));
});

/**
 * @route   DELETE /api/habits/:id
 * @desc    Remove um hábito (e seus logs por cascade).
 * @access  Privado
 */
export const deleteHabit = asyncHandler(async (req, res) => {
  const { data: deleted } = await supabase
    .from('habits')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id')
    .single();
  if (!deleted) {
    res.status(404);
    throw new Error('Hábito não encontrado');
  }
  res.json({ message: 'Hábito removido', id: req.params.id });
});

/**
 * @route   POST /api/habits/:id/check
 * @desc    Marca o hábito como feito hoje (idempotente). Concede XP só na 1ª vez.
 * @access  Privado
 */
export const checkHabit = asyncHandler(async (req, res) => {
  const date = req.body.date || today();

  const { data: habit } = await supabase
    .from('habits')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();
  if (!habit) {
    res.status(404);
    throw new Error('Hábito não encontrado');
  }

  // Insere o log; se já existir (unique), não duplica nem concede XP.
  const { data: inserted, error } = await supabase
    .from('habit_logs')
    .insert({ habit_id: habit.id, user_id: req.user.id, date })
    .select('id')
    .maybeSingle();

  const alreadyDone = error && error.code === '23505';
  if (error && !alreadyDone) throw new Error(error.message);

  const streak = await recomputeStreak(habit.id);

  let stats = req.user.stats;
  let xpGained = 0;
  if (inserted) {
    xpGained = habit.xp_reward || XP_REWARDS.habit;
    ({ stats } = applyXpToStats(req.user.stats, xpGained));
    await supabase
      .from('users')
      .update({ stats, updated_at: new Date().toISOString() })
      .eq('id', req.user.id);
    req.user.stats = stats;
  }

  const unlocked = inserted ? await evaluateAchievements(req.user) : [];

  res.json({
    habit: serializeHabit({ ...habit, ...{ current_streak: streak.current, longest_streak: streak.longest, last_completed: date } }, { doneToday: true }),
    xpGained,
    stats: req.user.stats,
    alreadyDone: !!alreadyDone,
    unlockedAchievements: unlocked,
  });
});

/**
 * @route   DELETE /api/habits/:id/check
 * @desc    Desmarca o hábito de um dia (desfaz). XP não é estornado.
 * @access  Privado
 */
export const uncheckHabit = asyncHandler(async (req, res) => {
  const date = req.query.date || today();

  const { data: habit } = await supabase
    .from('habits')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();
  if (!habit) {
    res.status(404);
    throw new Error('Hábito não encontrado');
  }

  await supabase
    .from('habit_logs')
    .delete()
    .eq('habit_id', habit.id)
    .eq('user_id', req.user.id)
    .eq('date', date);

  const streak = await recomputeStreak(habit.id);
  res.json({ ok: true, currentStreak: streak.current, longestStreak: streak.longest });
});

/**
 * @route   GET /api/habits/calendar?month=YYYY-MM
 * @desc    Conclusões agregadas por dia no mês (heatmap).
 * @access  Privado
 */
export const getCalendar = asyncHandler(async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '')
    ? req.query.month
    : today().slice(0, 7);

  const { data: logs, error } = await supabase
    .from('habit_logs')
    .select('date')
    .eq('user_id', req.user.id)
    .gte('date', `${month}-01`)
    .lte('date', `${month}-31`);
  if (error) throw new Error(error.message);

  const counts = {};
  for (const l of logs || []) counts[l.date] = (counts[l.date] || 0) + 1;

  res.json({ month, counts });
});

/**
 * @route   GET /api/habits/stats
 * @desc    Estatísticas: total, concluídas hoje, taxa de conclusão,
 *          conclusões da semana e do mês, XP estimado.
 * @access  Privado
 */
export const getStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);

  const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 6);
  const monthStart = `${iso(now).slice(0, 7)}-01`;

  const [{ data: habits }, { data: weekLogs }, { data: monthLogs }, { data: todayLogs }] =
    await Promise.all([
      supabase.from('habits').select('id, xp_reward').eq('user_id', req.user.id).eq('archived', false),
      supabase.from('habit_logs').select('date').eq('user_id', req.user.id).gte('date', iso(weekAgo)),
      supabase.from('habit_logs').select('date').eq('user_id', req.user.id).gte('date', monthStart),
      supabase.from('habit_logs').select('habit_id').eq('user_id', req.user.id).eq('date', iso(now)),
    ]);

  const totalHabits = (habits || []).length;
  const completedToday = (todayLogs || []).length;
  const completionRate = totalHabits ? Math.round((completedToday / totalHabits) * 100) : 0;
  const weekCount = (weekLogs || []).length;
  const monthCount = (monthLogs || []).length;
  const avgXp = totalHabits
    ? Math.round((habits.reduce((s, h) => s + (h.xp_reward || 100), 0) / totalHabits))
    : 100;

  res.json({
    totalHabits,
    completedToday,
    completionRate,
    weekCompletions: weekCount,
    monthCompletions: monthCount,
    weekXp: weekCount * avgXp,
    monthXp: monthCount * avgXp,
    level: req.user.stats?.level ?? 1,
    streak: req.user.streak?.current ?? 0,
  });
});
