import { supabase } from '../config/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Monta o objeto completo de uma guilda (com membros e ranking interno),
 * no formato esperado pelo app.
 */
async function buildGuildDetail(guildId) {
  const { data: guild } = await supabase
    .from('guilds')
    .select('*')
    .eq('id', guildId)
    .single();
  if (!guild) return null;

  const { data: members } = await supabase
    .from('guild_members')
    .select('role, contributed_xp, joined_at, user:users(id, username, display_name, stats)')
    .eq('guild_id', guildId)
    .order('contributed_xp', { ascending: false });

  const memberList = (members || []).map((m, i) => ({
    rank: i + 1,
    role: m.role,
    contributedXp: m.contributed_xp,
    joinedAt: m.joined_at,
    user: m.user
      ? {
          id: m.user.id,
          username: m.user.username,
          displayName: m.user.display_name,
          stats: { level: m.user.stats?.level ?? 1 },
        }
      : null,
  }));

  return {
    id: guild.id,
    name: guild.name,
    description: guild.description,
    emblem: guild.emblem,
    totalXp: guild.total_xp,
    leader: guild.leader_id,
    maxMembers: guild.max_members,
    memberCount: memberList.length,
    members: memberList,
  };
}

/**
 * @route   POST /api/guilds
 * @desc    Cria uma guilda (criador vira líder e primeiro membro)
 * @access  Privado
 */
export const createGuild = asyncHandler(async (req, res) => {
  const { name, description, emblem, isPublic } = req.body;

  if (!name) {
    res.status(400);
    throw new Error('Nome da guilda é obrigatório');
  }
  if (req.user.guild_id) {
    res.status(400);
    throw new Error('Você já pertence a uma guilda. Saia antes de criar outra.');
  }

  const { data: guild, error } = await supabase
    .from('guilds')
    .insert({
      name,
      description: description || '',
      emblem: emblem || '🛡️',
      is_public: isPublic !== undefined ? isPublic : true,
      leader_id: req.user.id,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  await supabase
    .from('guild_members')
    .insert({ guild_id: guild.id, user_id: req.user.id, role: 'leader' });

  await supabase.from('users').update({ guild_id: guild.id }).eq('id', req.user.id);

  res.status(201).json(await buildGuildDetail(guild.id));
});

/**
 * @route   GET /api/guilds
 * @desc    Lista guildas públicas (busca opcional)
 * @access  Privado
 */
export const listGuilds = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  let query = supabase
    .from('guilds')
    .select('id, name, description, emblem, total_xp, max_members, guild_members(count)')
    .eq('is_public', true)
    .order('total_xp', { ascending: false })
    .limit(limit);

  if (req.query.search) query = query.ilike('name', `%${req.query.search}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  res.json(
    (data || []).map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      emblem: g.emblem,
      totalXp: g.total_xp,
      maxMembers: g.max_members,
      memberCount: g.guild_members?.[0]?.count ?? 0,
    }))
  );
});

/**
 * @route   GET /api/guilds/leaderboard
 * @desc    Ranking de guildas por XP total
 * @access  Privado
 */
export const getGuildLeaderboard = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  const { data, error } = await supabase
    .from('guilds')
    .select('id, name, emblem, total_xp, guild_members(count)')
    .order('total_xp', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  res.json(
    (data || []).map((g, i) => ({
      rank: i + 1,
      id: g.id,
      name: g.name,
      emblem: g.emblem,
      totalXp: g.total_xp,
      memberCount: g.guild_members?.[0]?.count ?? 0,
    }))
  );
});

/**
 * @route   GET /api/guilds/:id
 * @desc    Detalhes de uma guilda + ranking interno de membros
 * @access  Privado
 */
export const getGuild = asyncHandler(async (req, res) => {
  const detail = await buildGuildDetail(req.params.id);
  if (!detail) {
    res.status(404);
    throw new Error('Guilda não encontrada');
  }
  res.json(detail);
});

/**
 * @route   POST /api/guilds/:id/join
 * @desc    Entra em uma guilda
 * @access  Privado
 */
export const joinGuild = asyncHandler(async (req, res) => {
  if (req.user.guild_id) {
    res.status(400);
    throw new Error('Você já pertence a uma guilda');
  }

  const { data: guild } = await supabase
    .from('guilds')
    .select('id, max_members, guild_members(count)')
    .eq('id', req.params.id)
    .single();

  if (!guild) {
    res.status(404);
    throw new Error('Guilda não encontrada');
  }

  const count = guild.guild_members?.[0]?.count ?? 0;
  if (count >= guild.max_members) {
    res.status(400);
    throw new Error('Guilda lotada');
  }

  const { error } = await supabase
    .from('guild_members')
    .insert({ guild_id: guild.id, user_id: req.user.id, role: 'member' });

  if (error) {
    // Violação de unicidade => já é membro
    res.status(error.code === '23505' ? 400 : 500);
    throw new Error(error.code === '23505' ? 'Você já é membro desta guilda' : error.message);
  }

  await supabase.from('users').update({ guild_id: guild.id }).eq('id', req.user.id);

  res.json({ message: 'Você entrou na guilda', guildId: guild.id, guild: await buildGuildDetail(guild.id) });
});

/**
 * @route   POST /api/guilds/:id/leave
 * @desc    Sai de uma guilda (transfere liderança se necessário; dissolve se vazia)
 * @access  Privado
 */
export const leaveGuild = asyncHandler(async (req, res) => {
  const { data: guild } = await supabase
    .from('guilds')
    .select('id, leader_id')
    .eq('id', req.params.id)
    .single();

  if (!guild) {
    res.status(404);
    throw new Error('Guilda não encontrada');
  }

  const { data: membership } = await supabase
    .from('guild_members')
    .select('id')
    .eq('guild_id', guild.id)
    .eq('user_id', req.user.id)
    .single();

  if (!membership) {
    res.status(400);
    throw new Error('Você não é membro desta guilda');
  }

  // Remove o membro
  await supabase.from('guild_members').delete().eq('id', membership.id);
  await supabase.from('users').update({ guild_id: null }).eq('id', req.user.id);

  // Membros restantes
  const { data: remaining } = await supabase
    .from('guild_members')
    .select('id, user_id, joined_at')
    .eq('guild_id', guild.id)
    .order('joined_at', { ascending: true });

  if (!remaining || remaining.length === 0) {
    // Última pessoa: dissolve a guilda
    await supabase.from('guilds').delete().eq('id', guild.id);
  } else if (guild.leader_id === req.user.id) {
    // Transfere liderança ao membro mais antigo
    const next = remaining[0];
    await supabase.from('guilds').update({ leader_id: next.user_id }).eq('id', guild.id);
    await supabase.from('guild_members').update({ role: 'leader' }).eq('id', next.id);
  }

  res.json({ message: 'Você saiu da guilda' });
});
