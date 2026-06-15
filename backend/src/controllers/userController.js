import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { applyXpToUser, clampStat } from '../utils/gamification.js';
import JourneyEvent from '../models/JourneyEvent.js';
import { Expo } from 'expo-server-sdk';

/**
 * @route   GET /api/users/me
 * @desc    Perfil completo do usuário logado
 * @access  Privado
 */
export const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('guild', 'name emblem totalXp');
  res.json(user.toPublic());
});

/**
 * @route   PUT /api/users/me
 * @desc    Atualiza dados do perfil (nome, avatar, título)
 * @access  Privado
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const { displayName, avatar, title } = req.body;
  const user = await User.findById(req.user._id);

  if (displayName !== undefined) user.displayName = displayName;
  if (avatar !== undefined) user.avatar = avatar;
  if (title !== undefined) user.title = title;

  await user.save();
  res.json(user.toPublic());
});

/**
 * @route   POST /api/users/me/xp
 * @desc    Concede XP avulso (uso administrativo/eventos) e processa level up
 * @access  Privado
 * @body    { amount }
 */
export const grantXp = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount) || 0;
  const user = await User.findById(req.user._id);

  const { prevLevel, newLevel, leveledUp } = applyXpToUser(user, amount);

  await user.save();

  if (newLevel > prevLevel) {
    await JourneyEvent.create({
      user: user._id,
      type: 'level_up',
      title: `Subiu para o nível ${newLevel}!`,
      description: `Você alcançou o nível ${newLevel}.`,
      icon: '🆙',
      meta: { from: prevLevel, to: newLevel },
    });
  }

  res.json({ stats: user.stats, leveledUp });
});

/**
 * @route   POST /api/users/me/vitals
 * @desc    Ajusta HP/Mana diretamente (ex.: dano por hábito ruim, descanso)
 * @access  Privado
 * @body    { hp, mana }  (deltas, podem ser negativos)
 */
export const adjustVitals = asyncHandler(async (req, res) => {
  const { hp = 0, mana = 0 } = req.body;
  const user = await User.findById(req.user._id);

  user.stats.hp = clampStat(user.stats.hp + Number(hp), user.stats.maxHp);
  user.stats.mana = clampStat(user.stats.mana + Number(mana), user.stats.maxMana);

  await user.save();
  res.json({ stats: user.stats });
});

/**
 * @route   GET /api/users/leaderboard
 * @desc    Ranking global de jogadores por nível e XP
 * @access  Privado
 * @query   ?limit=20
 */
export const getLeaderboard = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  const players = await User.find()
    .sort({ 'stats.level': -1, 'stats.xp': -1 })
    .limit(limit)
    .select('username displayName avatar title stats.level stats.xp guild')
    .populate('guild', 'name emblem');

  const ranked = players.map((p, i) => ({
    rank: i + 1,
    id: p._id,
    username: p.username,
    displayName: p.displayName,
    avatar: p.avatar,
    title: p.title,
    level: p.stats.level,
    xp: p.stats.xp,
    guild: p.guild,
  }));

  res.json(ranked);
});

/**
 * @route   PUT /api/users/me/push-token
 * @desc    Salva ou atualiza o Expo Push Token do dispositivo
 * @access  Privado
 * @body    { token }
 */
export const savePushToken = asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token || !Expo.isExpoPushToken(token)) {
    res.status(400);
    throw new Error('Token de push inválido');
  }

  await User.findByIdAndUpdate(req.user._id, { pushToken: token });
  res.json({ ok: true });
});

/**
 * @route   GET /api/users/me/journey
 * @desc    Timeline da jornada do herói
 * @access  Privado
 */
export const getJourney = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const events = await JourneyEvent.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(limit);
  res.json(events);
});
