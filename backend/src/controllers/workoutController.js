import { supabase } from '../config/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { applyXpToStats, XP_REWARDS } from '../utils/gamification.js';
import { evaluateAchievements } from '../utils/achievements.js';
import {
  serializeExercise,
  serializeWorkoutExercise,
  serializeWorkoutLog,
} from '../utils/serializers.js';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * @route   GET /api/workouts/exercises
 * @desc    Banco de exercícios (default + customizados do usuário).
 * @access  Privado
 */
export const listExercises = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .or(`is_default.eq.true,user_id.eq.${req.user.id}`)
    .order('muscle_group', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  res.json((data || []).map(serializeExercise));
});

/**
 * @route   GET /api/workouts?day=N
 * @desc    Exercícios do dia (ou todos agrupados por dia se sem ?day).
 * @access  Privado
 */
export const getWorkout = asyncHandler(async (req, res) => {
  let query = supabase
    .from('workout_exercises')
    .select('*')
    .eq('user_id', req.user.id)
    .order('day_of_week', { ascending: true })
    .order('sort_order', { ascending: true });

  if (req.query.day !== undefined) query = query.eq('day_of_week', Number(req.query.day));

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const exercises = (data || []).map(serializeWorkoutExercise);

  // Status do treino de hoje (se o dia consultado for hoje)
  let todayStatus = null;
  const { data: log } = await supabase
    .from('workout_logs')
    .select('status')
    .eq('user_id', req.user.id)
    .eq('date', today())
    .maybeSingle();
  if (log) todayStatus = log.status;

  res.json({ exercises, todayStatus });
});

/**
 * @route   POST /api/workouts
 * @desc    Adiciona um exercício a um dia da semana.
 * @access  Privado
 */
export const addExercise = asyncHandler(async (req, res) => {
  const { dayOfWeek, exerciseName, muscleGroup, sets, reps, load, notes } = req.body;
  if (dayOfWeek === undefined || !exerciseName) {
    res.status(400);
    throw new Error('dayOfWeek e exerciseName são obrigatórios');
  }

  const { data, error } = await supabase
    .from('workout_exercises')
    .insert({
      user_id: req.user.id,
      day_of_week: Number(dayOfWeek),
      exercise_name: exerciseName,
      muscle_group: muscleGroup || 'Geral',
      sets: Number(sets) || 3,
      reps: Number(reps) || 10,
      load: Number(load) || 0,
      notes: notes || '',
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  res.status(201).json(serializeWorkoutExercise(data));
});

/**
 * @route   PUT /api/workouts/:id
 * @desc    Edita um exercício do treino.
 * @access  Privado
 */
export const updateExercise = asyncHandler(async (req, res) => {
  const { sets, reps, load, notes, exerciseName, muscleGroup } = req.body;
  const patch = {};
  if (sets !== undefined) patch.sets = Number(sets);
  if (reps !== undefined) patch.reps = Number(reps);
  if (load !== undefined) patch.load = Number(load);
  if (notes !== undefined) patch.notes = notes;
  if (exerciseName !== undefined) patch.exercise_name = exerciseName;
  if (muscleGroup !== undefined) patch.muscle_group = muscleGroup;

  const { data, error } = await supabase
    .from('workout_exercises')
    .update(patch)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('*')
    .single();
  if (error || !data) {
    res.status(404);
    throw new Error('Exercício não encontrado');
  }
  res.json(serializeWorkoutExercise(data));
});

/**
 * @route   DELETE /api/workouts/:id
 * @desc    Remove um exercício do treino.
 * @access  Privado
 */
export const deleteExercise = asyncHandler(async (req, res) => {
  const { data } = await supabase
    .from('workout_exercises')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id')
    .single();
  if (!data) {
    res.status(404);
    throw new Error('Exercício não encontrado');
  }
  res.json({ message: 'Exercício removido', id: req.params.id });
});

/**
 * @route   POST /api/workouts/log
 * @desc    Marca o treino do dia como Feito/Faltou.
 *          Feito: +150 XP, registra cargas (PR/evolução), conquistas.
 * @access  Privado
 */
export const logWorkout = asyncHandler(async (req, res) => {
  const { dayOfWeek, status } = req.body;
  const finalStatus = status === 'missed' ? 'missed' : 'done';
  const date = today();
  const day = dayOfWeek !== undefined ? Number(dayOfWeek) : new Date().getDay();

  // Upsert do log do dia (um por dia)
  const { data: existing } = await supabase
    .from('workout_logs')
    .select('id, status')
    .eq('user_id', req.user.id)
    .eq('date', date)
    .maybeSingle();

  let firstDone = false;
  if (existing) {
    firstDone = existing.status !== 'done' && finalStatus === 'done';
    await supabase
      .from('workout_logs')
      .update({ status: finalStatus, day_of_week: day })
      .eq('id', existing.id);
  } else {
    firstDone = finalStatus === 'done';
    await supabase
      .from('workout_logs')
      .insert({ user_id: req.user.id, day_of_week: day, date, status: finalStatus });
  }

  let xpGained = 0;
  let unlocked = [];
  if (firstDone) {
    // Snapshot das cargas do dia para PR/evolução
    const { data: exs } = await supabase
      .from('workout_exercises')
      .select('exercise_name, sets, reps, load')
      .eq('user_id', req.user.id)
      .eq('day_of_week', day);

    if (exs && exs.length) {
      await supabase.from('exercise_logs').insert(
        exs.map((e) => ({
          user_id: req.user.id,
          exercise_name: e.exercise_name,
          date,
          sets: e.sets,
          reps: e.reps,
          load: e.load,
        }))
      );
    }

    xpGained = XP_REWARDS.workout;
    const { stats } = applyXpToStats(req.user.stats, xpGained);
    await supabase
      .from('users')
      .update({ stats, updated_at: new Date().toISOString() })
      .eq('id', req.user.id);
    req.user.stats = stats;
    unlocked = await evaluateAchievements(req.user);
  }

  res.json({ status: finalStatus, xpGained, stats: req.user.stats, unlockedAchievements: unlocked });
});

/**
 * @route   GET /api/workouts/history
 * @desc    Histórico recente de treinos (logs).
 * @access  Privado
 */
export const getHistory = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('user_id', req.user.id)
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  res.json((data || []).map(serializeWorkoutLog));
});

/**
 * @route   GET /api/workouts/stats
 * @desc    Volume semanal, PRs por exercício e contagem de treinos.
 * @access  Privado
 */
export const getStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 6);
  const weekStart = weekAgo.toISOString().slice(0, 10);

  const [{ data: weekLogs }, { data: exLogs }, { data: doneLogs }] = await Promise.all([
    supabase.from('exercise_logs').select('sets, reps, load, date').eq('user_id', req.user.id).gte('date', weekStart),
    supabase.from('exercise_logs').select('exercise_name, load, reps').eq('user_id', req.user.id),
    supabase.from('workout_logs').select('status').eq('user_id', req.user.id).eq('status', 'done'),
  ]);

  // Volume semanal = soma(sets * reps * load)
  const weeklyVolume = (weekLogs || []).reduce(
    (s, e) => s + (e.sets || 0) * (e.reps || 0) * Number(e.load || 0), 0
  );

  // PR = maior carga por exercício
  const prs = {};
  for (const e of exLogs || []) {
    const load = Number(e.load || 0);
    if (!prs[e.exercise_name] || load > prs[e.exercise_name].load) {
      prs[e.exercise_name] = { load, reps: e.reps };
    }
  }
  const prList = Object.entries(prs)
    .map(([name, v]) => ({ exerciseName: name, load: v.load, reps: v.reps }))
    .sort((a, b) => b.load - a.load);

  res.json({
    weeklyVolume: Math.round(weeklyVolume),
    totalWorkouts: (doneLogs || []).length,
    prs: prList,
  });
});
