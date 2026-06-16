import { supabase } from '../config/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { applyXpToStats, updateStreak } from '../utils/gamification.js';
import { sendPush } from '../utils/pushNotifications.js';
import { serializeMission } from '../utils/serializers.js';
import { evaluateAchievements } from '../utils/achievements.js';

const today = () => new Date().toISOString().slice(0, 10);

// Recompensas sugeridas por dificuldade
const REWARD_TABLE = {
  easy: { xp: 10, coins: 5 },
  medium: { xp: 25, coins: 12 },
  hard: { xp: 50, coins: 25 },
  epic: { xp: 100, coins: 60 },
};

/**
 * @route   GET /api/missions
 * @desc    Lista missões do usuário (filtros opcionais)
 * @access  Privado
 */
export const getMissions = asyncHandler(async (req, res) => {
  let query = supabase.from('missions').select('*').eq('user_id', req.user.id);
  if (req.query.date) query = query.eq('date', req.query.date);
  if (req.query.type) query = query.eq('type', req.query.type);
  if (req.query.status) query = query.eq('status', req.query.status);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  res.json((data || []).map(serializeMission));
});

/**
 * @route   GET /api/missions/today
 * @desc    Missões diárias de hoje (gera padrões se ainda não existirem)
 * @access  Privado
 */
export const getTodayMissions = asyncHandler(async (req, res) => {
  const { data: existing, error } = await supabase
    .from('missions')
    .select('*')
    .eq('user_id', req.user.id)
    .eq('type', 'daily')
    .eq('date', today());

  if (error) throw new Error(error.message);

  if (existing && existing.length > 0) {
    return res.json(existing.map(serializeMission));
  }

  const defaults = [
    { title: 'Beber 2L de água', category: 'health', difficulty: 'easy' },
    { title: 'Meditar 10 minutos', category: 'focus', difficulty: 'easy' },
    { title: 'Estudar/trabalhar foco profundo', category: 'progress', difficulty: 'medium' },
    { title: 'Exercício físico', category: 'health', difficulty: 'medium' },
  ];

  const { data: created, error: insErr } = await supabase
    .from('missions')
    .insert(
      defaults.map((d) => ({
        user_id: req.user.id,
        title: d.title,
        category: d.category,
        type: 'daily',
        difficulty: d.difficulty,
        rewards: REWARD_TABLE[d.difficulty],
        date: today(),
      }))
    )
    .select('*');

  if (insErr) throw new Error(insErr.message);
  res.json((created || []).map(serializeMission));
});

/**
 * @route   POST /api/missions
 * @desc    Cria uma nova missão personalizada
 * @access  Privado
 */
export const createMission = asyncHandler(async (req, res) => {
  const { title, description, category, type, difficulty, rewards } = req.body;

  if (!title) {
    res.status(400);
    throw new Error('Título da missão é obrigatório');
  }

  const diff = difficulty || 'easy';
  const { data: mission, error } = await supabase
    .from('missions')
    .insert({
      user_id: req.user.id,
      title,
      description: description || '',
      category: category || 'progress',
      type: type || 'daily',
      difficulty: diff,
      rewards: rewards || REWARD_TABLE[diff] || REWARD_TABLE.easy,
      date: today(),
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  res.status(201).json(serializeMission(mission));
});

/**
 * @route   POST /api/missions/:id/complete
 * @desc    Conclui uma missão, aplica recompensas, atualiza streak e guilda
 * @access  Privado
 */
export const completeMission = asyncHandler(async (req, res) => {
  // Transição de status atômica: só "vence" a primeira requisição.
  const { data: mission } = await supabase
    .from('missions')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .eq('status', 'pending')
    .select('*')
    .single();

  if (!mission) {
    const { data: exists } = await supabase
      .from('missions')
      .select('id')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();
    res.status(exists ? 400 : 404);
    throw new Error(exists ? 'Missão já concluída' : 'Missão não encontrada');
  }

  const rewards = mission.rewards || {};

  // Aplica XP + bônus de HP/Mana
  const { stats, prevLevel, newLevel, leveledUp } = applyXpToStats(
    req.user.stats,
    rewards.xp || 0,
    { hp: rewards.hp || 0, mana: rewards.mana || 0 }
  );

  // Streak (uma conclusão por dia mantém a sequência)
  const streak = updateStreak(req.user.streak);

  const { data: updatedUser, error: uErr } = await supabase
    .from('users')
    .update({
      stats,
      coins: (req.user.coins || 0) + (rewards.coins || 0),
      streak: {
        current: streak.current,
        longest: streak.longest,
        lastActiveDate: streak.lastActiveDate,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.user.id)
    .select('coins, streak')
    .single();

  if (uErr) throw new Error(uErr.message);

  // Contribui XP para a guilda, se houver
  if (req.user.guild_id && rewards.xp) {
    await supabase.rpc('add_guild_xp', {
      p_guild: req.user.guild_id,
      p_user: req.user.id,
      p_xp: rewards.xp,
    });
  }

  // Eventos da jornada + push de level up e marcos de streak
  if (newLevel > prevLevel) {
    await supabase.from('journey_events').insert({
      user_id: req.user.id,
      type: 'level_up',
      title: `Nível ${newLevel} alcançado!`,
      icon: '🆙',
      meta: { from: prevLevel, to: newLevel },
    });

    if (req.user.push_token) {
      sendPush(req.user.push_token, {
        title: '🆙 LEVEL UP!',
        body: `Parabéns, ${req.user.display_name || req.user.username}! Você alcançou o nível ${newLevel}!`,
        data: { screen: 'Jornada' },
      });
    }
  }

  if (streak.changed && streak.current > 0 && streak.current % 7 === 0) {
    await supabase.from('journey_events').insert({
      user_id: req.user.id,
      type: 'streak',
      title: `Sequência de ${streak.current} dias!`,
      icon: '🔥',
      meta: { streak: streak.current },
    });

    if (req.user.push_token) {
      sendPush(req.user.push_token, {
        title: '🔥 Sequência incrível!',
        body: `${streak.current} dias seguidos, ${req.user.display_name || req.user.username}! Continue assim!`,
        data: { screen: 'Início' },
      });
    }
  }

  // Avalia conquistas (missões concluídas, nível, streak, moedas...).
  // Atualiza req.user.stats com o XP bônus, se houver.
  req.user.stats = stats;
  req.user.coins = updatedUser.coins;
  req.user.streak = updatedUser.streak;
  const unlocked = await evaluateAchievements(req.user);

  res.json({
    mission: serializeMission(mission),
    stats: req.user.stats,
    coins: updatedUser.coins,
    streak: updatedUser.streak,
    leveledUp,
    unlockedAchievements: unlocked,
  });
});

/**
 * @route   DELETE /api/missions/:id
 * @desc    Remove uma missão
 * @access  Privado
 */
export const deleteMission = asyncHandler(async (req, res) => {
  const { data: deleted } = await supabase
    .from('missions')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id')
    .single();

  if (!deleted) {
    res.status(404);
    throw new Error('Missão não encontrada');
  }
  res.json({ message: 'Missão removida', id: req.params.id });
});
