import Guild from '../models/Guild.js';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';

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

  const user = await User.findById(req.user._id);
  if (user.guild) {
    res.status(400);
    throw new Error('Você já pertence a uma guilda. Saia antes de criar outra.');
  }

  const guild = await Guild.create({
    name,
    description,
    emblem: emblem || '🛡️',
    isPublic: isPublic !== undefined ? isPublic : true,
    leader: user._id,
    members: [{ user: user._id, role: 'leader' }],
  });

  user.guild = guild._id;
  await user.save();

  res.status(201).json(guild);
});

/**
 * @route   GET /api/guilds
 * @desc    Lista guildas públicas (busca opcional)
 * @access  Privado
 * @query   ?search=texto&limit=20
 */
export const listGuilds = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const filter = { isPublic: true };
  if (req.query.search) {
    filter.name = { $regex: req.query.search, $options: 'i' };
  }

  const guilds = await Guild.find(filter)
    .sort({ totalXp: -1 })
    .limit(limit)
    .select('name description emblem totalXp members maxMembers');

  const result = guilds.map((g) => ({
    id: g._id,
    name: g.name,
    description: g.description,
    emblem: g.emblem,
    totalXp: g.totalXp,
    memberCount: g.members.length,
    maxMembers: g.maxMembers,
  }));

  res.json(result);
});

/**
 * @route   GET /api/guilds/leaderboard
 * @desc    Ranking de guildas por XP total
 * @access  Privado
 */
export const getGuildLeaderboard = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const guilds = await Guild.find()
    .sort({ totalXp: -1 })
    .limit(limit)
    .select('name emblem totalXp members');

  res.json(
    guilds.map((g, i) => ({
      rank: i + 1,
      id: g._id,
      name: g.name,
      emblem: g.emblem,
      totalXp: g.totalXp,
      memberCount: g.members.length,
    }))
  );
});

/**
 * @route   GET /api/guilds/:id
 * @desc    Detalhes de uma guilda + ranking interno de membros
 * @access  Privado
 */
export const getGuild = asyncHandler(async (req, res) => {
  const guild = await Guild.findById(req.params.id).populate(
    'members.user',
    'username displayName avatar stats.level'
  );

  if (!guild) {
    res.status(404);
    throw new Error('Guilda não encontrada');
  }

  const members = [...guild.members]
    .sort((a, b) => b.contributedXp - a.contributedXp)
    .map((m, i) => ({
      rank: i + 1,
      user: m.user,
      role: m.role,
      contributedXp: m.contributedXp,
      joinedAt: m.joinedAt,
    }));

  res.json({
    id: guild._id,
    name: guild.name,
    description: guild.description,
    emblem: guild.emblem,
    totalXp: guild.totalXp,
    leader: guild.leader,
    maxMembers: guild.maxMembers,
    members,
  });
});

/**
 * @route   POST /api/guilds/:id/join
 * @desc    Entra em uma guilda
 * @access  Privado
 */
export const joinGuild = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user.guild) {
    res.status(400);
    throw new Error('Você já pertence a uma guilda');
  }

  const guild = await Guild.findById(req.params.id);
  if (!guild) {
    res.status(404);
    throw new Error('Guilda não encontrada');
  }
  if (guild.members.length >= guild.maxMembers) {
    res.status(400);
    throw new Error('Guilda lotada');
  }
  if (guild.hasMember(user._id)) {
    res.status(400);
    throw new Error('Você já é membro desta guilda');
  }

  guild.members.push({ user: user._id, role: 'member' });
  await guild.save();

  user.guild = guild._id;
  await user.save();

  res.json({ message: 'Você entrou na guilda', guildId: guild._id });
});

/**
 * @route   POST /api/guilds/:id/leave
 * @desc    Sai de uma guilda (se for líder e houver outros, transfere liderança)
 * @access  Privado
 */
export const leaveGuild = asyncHandler(async (req, res) => {
  const guild = await Guild.findById(req.params.id);
  if (!guild) {
    res.status(404);
    throw new Error('Guilda não encontrada');
  }

  const userId = req.user._id.toString();
  if (!guild.hasMember(userId)) {
    res.status(400);
    throw new Error('Você não é membro desta guilda');
  }

  guild.members = guild.members.filter((m) => m.user.toString() !== userId);

  if (guild.members.length === 0) {
    // Última pessoa saindo: dissolve a guilda
    await guild.deleteOne();
  } else {
    // Transfere liderança se necessário
    if (guild.leader.toString() === userId) {
      guild.leader = guild.members[0].user;
      guild.members[0].role = 'leader';
    }
    await guild.save();
  }

  await User.findByIdAndUpdate(req.user._id, { guild: null });

  res.json({ message: 'Você saiu da guilda' });
});
