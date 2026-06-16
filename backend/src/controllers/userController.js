import { supabase } from '../config/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { applyXpToStats, clampStat } from '../utils/gamification.js';
import { publicUser, serializeJourney } from '../utils/serializers.js';
import { Expo } from 'expo-server-sdk';

/**
 * @route   GET /api/users/me
 * @desc    Perfil completo do usuário logado
 * @access  Privado
 */
export const getProfile = asyncHandler(async (req, res) => {
  let guild;
  if (req.user.guild_id) {
    const { data: g } = await supabase
      .from('guilds')
      .select('id, name, emblem, total_xp')
      .eq('id', req.user.guild_id)
      .single();
    if (g) guild = { id: g.id, name: g.name, emblem: g.emblem, totalXp: g.total_xp };
  }
  res.json(publicUser(req.user, guild));
});

/**
 * @route   PUT /api/users/me
 * @desc    Atualiza dados do perfil (nome, avatar, título)
 * @access  Privado
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const { displayName, avatar, title } = req.body;

  const patch = { updated_at: new Date().toISOString() };
  if (displayName !== undefined) patch.display_name = displayName;
  if (avatar !== undefined) patch.avatar = avatar;
  if (title !== undefined) patch.title = title;

  const { data: user, error } = await supabase
    .from('users')
    .update(patch)
    .eq('id', req.user.id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  res.json(publicUser(user));
});

/**
 * @route   POST /api/users/me/xp
 * @desc    Concede XP avulso e processa level up
 * @access  Privado
 */
export const grantXp = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount) || 0;

  const { stats, prevLevel, newLevel, leveledUp } = applyXpToStats(req.user.stats, amount);

  const { error } = await supabase
    .from('users')
    .update({ stats, updated_at: new Date().toISOString() })
    .eq('id', req.user.id);
  if (error) throw new Error(error.message);

  if (newLevel > prevLevel) {
    await supabase.from('journey_events').insert({
      user_id: req.user.id,
      type: 'level_up',
      title: `Subiu para o nível ${newLevel}!`,
      description: `Você alcançou o nível ${newLevel}.`,
      icon: '🆙',
      meta: { from: prevLevel, to: newLevel },
    });
  }

  res.json({ stats, leveledUp });
});

/**
 * @route   POST /api/users/me/vitals
 * @desc    Ajusta HP/Mana diretamente (deltas, podem ser negativos)
 * @access  Privado
 */
export const adjustVitals = asyncHandler(async (req, res) => {
  const { hp = 0, mana = 0 } = req.body;
  const stats = { ...req.user.stats };

  stats.hp = clampStat(stats.hp + Number(hp), stats.maxHp);
  stats.mana = clampStat(stats.mana + Number(mana), stats.maxMana);

  const { error } = await supabase
    .from('users')
    .update({ stats, updated_at: new Date().toISOString() })
    .eq('id', req.user.id);
  if (error) throw new Error(error.message);

  res.json({ stats });
});

/**
 * @route   GET /api/users/leaderboard
 * @desc    Ranking global de jogadores por nível e XP
 * @access  Privado
 */
export const getLeaderboard = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  // RPC garante ordenação numérica por nível/XP (jsonb ordenaria como texto).
  const { data: players, error } = await supabase.rpc('get_leaderboard', { p_limit: limit });

  if (error) throw new Error(error.message);

  const ranked = (players || []).map((p, i) => ({
    rank: i + 1,
    id: p.id,
    username: p.username,
    displayName: p.display_name,
    avatar: p.avatar,
    title: p.title,
    level: p.stats?.level ?? 1,
    xp: p.stats?.xp ?? 0,
    guild: p.guild_id,
  }));

  res.json(ranked);
});

/**
 * @route   PUT /api/users/me/push-token
 * @desc    Salva ou atualiza o Expo Push Token do dispositivo
 * @access  Privado
 */
export const savePushToken = asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token || !Expo.isExpoPushToken(token)) {
    res.status(400);
    throw new Error('Token de push inválido');
  }

  const { error } = await supabase
    .from('users')
    .update({ push_token: token, updated_at: new Date().toISOString() })
    .eq('id', req.user.id);
  if (error) throw new Error(error.message);

  res.json({ ok: true });
});

/**
 * @route   GET /api/users/me/journey
 * @desc    Timeline da jornada do herói
 * @access  Privado
 */
export const getJourney = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const { data: events, error } = await supabase
    .from('journey_events')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  res.json((events || []).map(serializeJourney));
});
