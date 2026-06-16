import { supabase } from '../config/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { applyXpToStats, computeStreak, XP_REWARDS } from '../utils/gamification.js';
import { evaluateAchievements } from '../utils/achievements.js';
import { serializeChallenge, serializeChallengeTemplate } from '../utils/serializers.js';

const today = () => new Date().toISOString().slice(0, 10);

// XP e medalha por dificuldade (base = XP_REWARDS.challenge).
const DIFFICULTY = {
  easy: { mult: 1, medal: 'bronze' },
  medium: { mult: 1.5, medal: 'silver' },
  hard: { mult: 2.5, medal: 'gold' },
};

const xpFor = (difficulty) =>
  Math.round(XP_REWARDS.challenge * (DIFFICULTY[difficulty]?.mult || 1));

/**
 * @route   GET /api/challenges/templates
 * @desc    Desafios predefinidos para iniciar.
 * @access  Privado
 */
export const listTemplates = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('challenge_templates')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  res.json((data || []).map(serializeChallengeTemplate));
});

/**
 * @route   GET /api/challenges
 * @desc    Desafios do usuário (ativos primeiro), com status de hoje.
 * @access  Privado
 */
export const listChallenges = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('user_challenges')
    .select('*')
    .eq('user_id', req.user.id)
    .order('status', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const active = (data || []).filter((c) => c.status === 'active');
  let doneSet = new Set();
  if (active.length) {
    const { data: logs } = await supabase
      .from('challenge_logs')
      .select('user_challenge_id')
      .eq('user_id', req.user.id)
      .eq('date', today())
      .in('user_challenge_id', active.map((c) => c.id));
    doneSet = new Set((logs || []).map((l) => l.user_challenge_id));
  }

  res.json((data || []).map((c) =>
    serializeChallenge(c, { doneToday: doneSet.has(c.id) })
  ));
});

/**
 * @route   POST /api/challenges
 * @desc    Inicia um desafio (de template via templateKey, ou customizado).
 * @access  Privado
 */
export const startChallenge = asyncHandler(async (req, res) => {
  const { templateKey, name, description, icon, difficulty, goalDays } = req.body;

  let fields;
  if (templateKey) {
    const { data: tpl } = await supabase
      .from('challenge_templates')
      .select('*')
      .eq('key', templateKey)
      .single();
    if (!tpl) {
      res.status(404);
      throw new Error('Template de desafio não encontrado');
    }
    fields = {
      name: tpl.name,
      description: tpl.description,
      icon: tpl.icon,
      difficulty: tpl.difficulty,
      goal_days: tpl.goal_days,
    };
  } else {
    if (!name) {
      res.status(400);
      throw new Error('Nome do desafio é obrigatório');
    }
    const diff = DIFFICULTY[difficulty] ? difficulty : 'medium';
    fields = {
      name,
      description: description || '',
      icon: icon || '🔥',
      difficulty: diff,
      goal_days: Math.max(Number(goalDays) || 30, 1),
    };
  }

  const { data: challenge, error } = await supabase
    .from('user_challenges')
    .insert({
      user_id: req.user.id,
      ...fields,
      xp_reward: xpFor(fields.difficulty),
      start_date: today(),
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  res.status(201).json(serializeChallenge(challenge, { doneToday: false }));
});

/**
 * @route   POST /api/challenges/:id/checkin
 * @desc    Check-in diário (idempotente). Ao atingir a meta, conclui:
 *          XP por dificuldade + medalha + conquistas.
 * @access  Privado
 */
export const checkinChallenge = asyncHandler(async (req, res) => {
  const date = today();

  const { data: ch } = await supabase
    .from('user_challenges')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();
  if (!ch) {
    res.status(404);
    throw new Error('Desafio não encontrado');
  }
  if (ch.status !== 'active') {
    res.status(400);
    throw new Error('Desafio não está ativo');
  }

  // Insere check-in do dia (idempotente)
  const { data: inserted, error } = await supabase
    .from('challenge_logs')
    .insert({ user_challenge_id: ch.id, user_id: req.user.id, date })
    .select('id')
    .maybeSingle();
  const alreadyDone = error && error.code === '23505';
  if (error && !alreadyDone) throw new Error(error.message);

  // Recalcula streak/progresso pelos logs
  const { data: logs } = await supabase
    .from('challenge_logs')
    .select('date')
    .eq('user_challenge_id', ch.id);
  const dates = (logs || []).map((l) => l.date);
  const { current, longest } = computeStreak(dates);
  const progress = dates.length;

  const reachedGoal = progress >= ch.goal_days;
  const patch = {
    progress,
    current_streak: current,
    longest_streak: Math.max(longest, ch.longest_streak),
    last_check: date,
  };

  let xpGained = 0;
  let unlocked = [];
  let medal = ch.medal;

  if (reachedGoal && ch.status === 'active') {
    medal = DIFFICULTY[ch.difficulty]?.medal || 'bronze';
    patch.status = 'completed';
    patch.medal = medal;
    patch.completed_at = new Date().toISOString();

    xpGained = ch.xp_reward;
    const { stats } = applyXpToStats(req.user.stats, xpGained);
    await supabase
      .from('users')
      .update({ stats, updated_at: new Date().toISOString() })
      .eq('id', req.user.id);
    req.user.stats = stats;

    await supabase.from('journey_events').insert({
      user_id: req.user.id,
      type: 'milestone',
      title: `Desafio concluído: ${ch.name}`,
      description: `Medalha de ${medal}!`,
      icon: ch.icon,
      meta: { medal, challenge: ch.name },
    });
    unlocked = await evaluateAchievements(req.user);
  }

  const { data: updated } = await supabase
    .from('user_challenges')
    .update(patch)
    .eq('id', ch.id)
    .select('*')
    .single();

  res.json({
    challenge: serializeChallenge(updated, { doneToday: true }),
    xpGained,
    completed: reachedGoal,
    medal: reachedGoal ? medal : null,
    alreadyDone: !!alreadyDone,
    stats: req.user.stats,
    unlockedAchievements: unlocked,
  });
});

/**
 * @route   DELETE /api/challenges/:id
 * @desc    Abandona/remove um desafio.
 * @access  Privado
 */
export const deleteChallenge = asyncHandler(async (req, res) => {
  const { data } = await supabase
    .from('user_challenges')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id')
    .single();
  if (!data) {
    res.status(404);
    throw new Error('Desafio não encontrado');
  }
  res.json({ message: 'Desafio removido', id: req.params.id });
});

/**
 * @route   GET /api/challenges/ranking
 * @desc    Ranking local por desafios concluídos e medalhas.
 * @access  Privado
 */
export const getRanking = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  const { data: completed, error } = await supabase
    .from('user_challenges')
    .select('user_id, medal, user:users(username, display_name, stats)')
    .eq('status', 'completed');
  if (error) throw new Error(error.message);

  const agg = {};
  for (const c of completed || []) {
    if (!agg[c.user_id]) {
      agg[c.user_id] = {
        userId: c.user_id,
        username: c.user?.username || '',
        displayName: c.user?.display_name,
        level: c.user?.stats?.level ?? 1,
        completed: 0,
        gold: 0,
        silver: 0,
        bronze: 0,
      };
    }
    agg[c.user_id].completed += 1;
    if (c.medal && agg[c.user_id][c.medal] !== undefined) agg[c.user_id][c.medal] += 1;
  }

  const ranking = Object.values(agg)
    .sort((a, b) => b.completed - a.completed || b.gold - a.gold)
    .slice(0, limit)
    .map((r, i) => ({ rank: i + 1, ...r }));

  res.json(ranking);
});
