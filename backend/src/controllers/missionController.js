import Mission from '../models/Mission.js';
import User from '../models/User.js';
import Guild from '../models/Guild.js';
import JourneyEvent from '../models/JourneyEvent.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { applyXpToUser, updateStreak } from '../utils/gamification.js';
import { sendPush } from '../utils/pushNotifications.js';

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
 * @query   ?date=YYYY-MM-DD&type=daily&status=pending
 */
export const getMissions = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id };
  if (req.query.date) filter.date = req.query.date;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.status) filter.status = req.query.status;

  const missions = await Mission.find(filter).sort({ createdAt: -1 });
  res.json(missions);
});

/**
 * @route   GET /api/missions/today
 * @desc    Missões diárias de hoje (gera padrões se ainda não existirem)
 * @access  Privado
 */
export const getTodayMissions = asyncHandler(async (req, res) => {
  let missions = await Mission.find({
    user: req.user._id,
    type: 'daily',
    date: today(),
  });

  if (missions.length === 0) {
    const defaults = [
      { title: 'Beber 2L de água', category: 'health', difficulty: 'easy' },
      { title: 'Meditar 10 minutos', category: 'focus', difficulty: 'easy' },
      { title: 'Estudar/trabalhar foco profundo', category: 'progress', difficulty: 'medium' },
      { title: 'Exercício físico', category: 'health', difficulty: 'medium' },
    ];

    missions = await Mission.insertMany(
      defaults.map((d) => ({
        user: req.user._id,
        title: d.title,
        category: d.category,
        type: 'daily',
        difficulty: d.difficulty,
        rewards: REWARD_TABLE[d.difficulty],
        date: today(),
      }))
    );
  }

  res.json(missions);
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
  const mission = await Mission.create({
    user: req.user._id,
    title,
    description,
    category: category || 'progress',
    type: type || 'daily',
    difficulty: diff,
    rewards: rewards || REWARD_TABLE[diff] || REWARD_TABLE.easy,
  });

  res.status(201).json(mission);
});

/**
 * @route   POST /api/missions/:id/complete
 * @desc    Conclui uma missão, aplica recompensas, atualiza streak e guilda
 * @access  Privado
 */
export const completeMission = asyncHandler(async (req, res) => {
  // Transição de status atômica: só "vence" a primeira requisição.
  // Evita race condition que aplicaria XP/moedas em dobro.
  const mission = await Mission.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id, status: 'pending' },
    { status: 'completed', completedAt: new Date() },
    { new: true }
  );

  if (!mission) {
    // Ou não existe, ou já estava concluída (corrida perdida).
    const exists = await Mission.exists({ _id: req.params.id, user: req.user._id });
    res.status(exists ? 400 : 404);
    throw new Error(exists ? 'Missão já concluída' : 'Missão não encontrada');
  }

  const user = await User.findById(req.user._id);

  // Aplica XP (com level up em cadeia) + bônus de HP/Mana da recompensa
  const { prevLevel, newLevel, leveledUp } = applyXpToUser(
    user,
    mission.rewards.xp || 0,
    { hp: mission.rewards.hp || 0, mana: mission.rewards.mana || 0 }
  );

  // Moedas
  user.coins += mission.rewards.coins || 0;

  // Streak (uma conclusão por dia já mantém a sequência)
  const streak = updateStreak(user.streak.toObject ? user.streak.toObject() : user.streak);
  user.streak.current = streak.current;
  user.streak.longest = streak.longest;
  user.streak.lastActiveDate = streak.lastActiveDate;

  await user.save();

  // Contribui XP para a guilda, se houver
  if (user.guild && mission.rewards.xp) {
    await Guild.updateOne(
      { _id: user.guild, 'members.user': user._id },
      {
        $inc: {
          totalXp: mission.rewards.xp,
          'members.$.contributedXp': mission.rewards.xp,
        },
      }
    );
  }

  // Eventos da jornada + push de level up e marcos de streak
  if (newLevel > prevLevel) {
    await JourneyEvent.create({
      user: user._id,
      type: 'level_up',
      title: `Nível ${newLevel} alcançado!`,
      icon: '🆙',
      meta: { from: prevLevel, to: newLevel },
    });

    if (user.pushToken) {
      sendPush(user.pushToken, {
        title: '🆙 LEVEL UP!',
        body: `Parabéns, ${user.displayName || user.username}! Você alcançou o nível ${newLevel}!`,
        data: { screen: 'Jornada' },
      });
    }
  }

  if (streak.changed && streak.current > 0 && streak.current % 7 === 0) {
    await JourneyEvent.create({
      user: user._id,
      type: 'streak',
      title: `Sequência de ${streak.current} dias!`,
      icon: '🔥',
      meta: { streak: streak.current },
    });

    if (user.pushToken) {
      sendPush(user.pushToken, {
        title: '🔥 Sequência incrível!',
        body: `${streak.current} dias seguidos, ${user.displayName || user.username}! Continue assim!`,
        data: { screen: 'Início' },
      });
    }
  }

  res.json({
    mission,
    stats: user.stats,
    coins: user.coins,
    streak: user.streak,
    leveledUp,
  });
});

/**
 * @route   DELETE /api/missions/:id
 * @desc    Remove uma missão
 * @access  Privado
 */
export const deleteMission = asyncHandler(async (req, res) => {
  const mission = await Mission.findOneAndDelete({
    _id: req.params.id,
    user: req.user._id,
  });
  if (!mission) {
    res.status(404);
    throw new Error('Missão não encontrada');
  }
  res.json({ message: 'Missão removida', id: req.params.id });
});
