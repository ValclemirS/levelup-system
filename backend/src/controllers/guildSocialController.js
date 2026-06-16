import { supabase } from '../config/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { applyXpToStats } from '../utils/gamification.js';
import { sendPush } from '../utils/pushNotifications.js';

/** Garante que req.user é membro da guilda :id. Retorna a role ou lança 403. */
async function requireMember(guildId, userId, res) {
  const { data } = await supabase
    .from('guild_members')
    .select('role')
    .eq('guild_id', guildId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) {
    res.status(403);
    throw new Error('Você não é membro desta guilda');
  }
  return data.role;
}

/** Notifica os demais membros da guilda via push. */
async function notifyGuild(guildId, exceptUserId, payload) {
  const { data: members } = await supabase
    .from('guild_members')
    .select('user:users(id, push_token)')
    .eq('guild_id', guildId);
  const tokens = (members || [])
    .map((m) => m.user)
    .filter((u) => u && u.id !== exceptUserId && u.push_token)
    .map((u) => u.push_token);
  if (tokens.length) sendPush(tokens, payload);
}

// ---------------- CHAT ----------------

/**
 * @route   GET /api/guilds/:id/messages
 * @access  Privado (membro)
 */
export const getMessages = asyncHandler(async (req, res) => {
  await requireMember(req.params.id, req.user.id, res);
  const limit = Math.min(Number(req.query.limit) || 50, 100);

  const { data, error } = await supabase
    .from('guild_messages')
    .select('id, text, created_at, user:users(id, username, display_name)')
    .eq('guild_id', req.params.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  res.json(
    (data || []).reverse().map((m) => ({
      id: m.id,
      text: m.text,
      createdAt: m.created_at,
      user: m.user
        ? { id: m.user.id, username: m.user.username, displayName: m.user.display_name }
        : null,
    }))
  );
});

/**
 * @route   POST /api/guilds/:id/messages
 * @access  Privado (membro)
 */
export const postMessage = asyncHandler(async (req, res) => {
  await requireMember(req.params.id, req.user.id, res);
  const text = (req.body.text || '').trim();
  if (!text) {
    res.status(400);
    throw new Error('Mensagem vazia');
  }
  if (text.length > 500) {
    res.status(400);
    throw new Error('Mensagem muito longa (máx. 500)');
  }

  const { data, error } = await supabase
    .from('guild_messages')
    .insert({ guild_id: req.params.id, user_id: req.user.id, text })
    .select('id, text, created_at')
    .single();
  if (error) throw new Error(error.message);

  res.status(201).json({
    id: data.id,
    text: data.text,
    createdAt: data.created_at,
    user: { id: req.user.id, username: req.user.username, displayName: req.user.display_name },
  });
});

// ---------------- DESAFIOS DE GUILDA ----------------

const serializeGC = (r) => ({
  id: r.id,
  title: r.title,
  description: r.description,
  goalXp: r.goal_xp,
  progressXp: r.progress_xp,
  rewardCoins: r.reward_coins,
  rewardXp: r.reward_xp,
  status: r.status,
  completedAt: r.completed_at,
});

/**
 * @route   GET /api/guilds/:id/challenges
 * @access  Privado (membro)
 */
export const listGuildChallenges = asyncHandler(async (req, res) => {
  await requireMember(req.params.id, req.user.id, res);
  const { data, error } = await supabase
    .from('guild_challenges')
    .select('*')
    .eq('guild_id', req.params.id)
    .order('status', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  res.json((data || []).map(serializeGC));
});

/**
 * @route   POST /api/guilds/:id/challenges
 * @desc    Cria um desafio coletivo (líder ou oficial).
 * @access  Privado (membro)
 */
export const createGuildChallenge = asyncHandler(async (req, res) => {
  const role = await requireMember(req.params.id, req.user.id, res);
  if (role !== 'leader' && role !== 'officer') {
    res.status(403);
    throw new Error('Apenas líder/oficial pode criar desafios');
  }

  const { title, description, goalXp, rewardCoins, rewardXp } = req.body;
  if (!title) {
    res.status(400);
    throw new Error('Título é obrigatório');
  }

  const { data, error } = await supabase
    .from('guild_challenges')
    .insert({
      guild_id: req.params.id,
      title,
      description: description || '',
      goal_xp: Math.max(Number(goalXp) || 1000, 1),
      reward_coins: Math.max(Number(rewardCoins) || 50, 0),
      reward_xp: Math.max(Number(rewardXp) || 100, 0),
      created_by: req.user.id,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  notifyGuild(req.params.id, req.user.id, {
    title: '⚔️ Novo desafio de guilda!',
    body: `${title} — contribua com sua guilda!`,
    data: { screen: 'Guildas' },
  });

  res.status(201).json(serializeGC(data));
});

/**
 * @route   POST /api/guilds/:gid/challenges/:cid/contribute
 * @desc    Contribui XP para o desafio. Ao atingir a meta, distribui recompensa
 *          a todos os membros.
 * @access  Privado (membro)
 */
export const contributeGuildChallenge = asyncHandler(async (req, res) => {
  await requireMember(req.params.gid, req.user.id, res);
  const amount = Math.min(Math.max(Number(req.body.amount) || 50, 1), 1000);

  const { data: gc } = await supabase
    .from('guild_challenges')
    .select('*')
    .eq('id', req.params.cid)
    .eq('guild_id', req.params.gid)
    .single();
  if (!gc) {
    res.status(404);
    throw new Error('Desafio não encontrado');
  }
  if (gc.status !== 'active') {
    res.status(400);
    throw new Error('Desafio não está ativo');
  }

  const newProgress = gc.progress_xp + amount;

  // Soma ao XP da guilda e ao contributedXp do membro
  await supabase.rpc('add_guild_xp', {
    p_guild: req.params.gid,
    p_user: req.user.id,
    p_xp: amount,
  });

  const completed = newProgress >= gc.goal_xp;
  await supabase
    .from('guild_challenges')
    .update({
      progress_xp: newProgress,
      ...(completed ? { status: 'completed', completed_at: new Date().toISOString() } : {}),
    })
    .eq('id', gc.id);

  let rewardGiven = false;
  if (completed) {
    rewardGiven = true;
    // Distribui recompensa a todos os membros
    const { data: members } = await supabase
      .from('guild_members')
      .select('user_id')
      .eq('guild_id', req.params.gid);

    for (const m of members || []) {
      if (gc.reward_coins > 0) {
        await supabase.rpc('adjust_coins', { p_user: m.user_id, p_delta: gc.reward_coins });
      }
      if (gc.reward_xp > 0) {
        const { data: u } = await supabase.from('users').select('stats').eq('id', m.user_id).single();
        if (u) {
          const { stats } = applyXpToStats(u.stats, gc.reward_xp);
          await supabase.from('users').update({ stats }).eq('id', m.user_id);
        }
      }
      await supabase.from('journey_events').insert({
        user_id: m.user_id,
        type: 'guild',
        title: `Desafio de guilda concluído: ${gc.title}`,
        description: `Recompensa: ${gc.reward_coins} moedas + ${gc.reward_xp} XP`,
        icon: '🏆',
        meta: { challenge: gc.title },
      });
    }

    notifyGuild(req.params.gid, null, {
      title: '🏆 Desafio de guilda concluído!',
      body: `${gc.title} — recompensa distribuída a todos!`,
      data: { screen: 'Guildas' },
    });
  }

  res.json({
    progressXp: newProgress,
    goalXp: gc.goal_xp,
    completed,
    rewardGiven,
    reward: completed ? { coins: gc.reward_coins, xp: gc.reward_xp } : null,
  });
});
