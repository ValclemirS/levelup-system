/**
 * Serializadores: convertem linhas do Postgres (snake_case) para o contrato
 * de API consumido pelo app Flutter (camelCase, com stats/streak aninhados).
 * Mantém a resposta idêntica à do backend Mongoose anterior.
 */
import { rankForLevel, cumulativeXpForLevel } from './gamification.js';

/** Usuário "público" (sem senha). `guild` pode ser id (string) ou objeto. */
export const publicUser = (row, guild = undefined) => {
  if (!row) return null;
  const stats = row.stats || {};
  const level = stats.level ?? 1;
  const { rank } = rankForLevel(level);
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    avatar: row.avatar,
    title: row.title,
    rank, // título de patente derivado do nível (M6)
    stats,
    streak: row.streak || {},
    coins: row.coins,
    guild: guild !== undefined ? guild : row.guild_id,
    pushToken: row.push_token,
    achievements: row.achievements || [],
    // XP total acumulado até o nível atual + progresso (útil para a UI de perfil)
    totalXp: cumulativeXpForLevel(level) + (stats.xp ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const serializeMission = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  category: row.category,
  type: row.type,
  difficulty: row.difficulty,
  rewards: row.rewards || {},
  status: row.status,
  completedAt: row.completed_at,
  date: row.date,
  createdAt: row.created_at,
});

export const serializeShopItem = (row) => ({
  id: row.id,
  key: row.key,
  name: row.name,
  description: row.description,
  icon: row.icon,
  type: row.type,
  rarity: row.rarity,
  price: row.price,
  effect: row.effect || {},
  isActive: row.is_active,
});

/** Item de inventário com o ShopItem aninhado em `item`. */
export const serializeInventory = (row, itemRow) => ({
  id: row.id,
  quantity: row.quantity,
  acquiredAt: row.acquired_at,
  item: itemRow ? serializeShopItem(itemRow) : null,
});

export const serializeJourney = (row) => ({
  id: row.id,
  type: row.type,
  title: row.title,
  description: row.description,
  icon: row.icon,
  meta: row.meta || {},
  createdAt: row.created_at,
});

export const serializeMeditation = (row) => ({
  id: row.id,
  technique: row.technique,
  durationSeconds: row.duration_seconds,
  cycles: row.cycles,
  manaGained: row.mana_gained,
  xpGained: row.xp_gained,
  completedAt: row.completed_at,
});

export const serializeHabit = (row, { doneToday } = {}) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  icon: row.icon,
  color: row.color,
  frequency: row.frequency,
  targetPerWeek: row.target_per_week,
  xpReward: row.xp_reward,
  currentStreak: row.current_streak,
  longestStreak: row.longest_streak,
  lastCompleted: row.last_completed,
  archived: row.archived,
  createdAt: row.created_at,
  ...(doneToday !== undefined ? { doneToday } : {}),
});

export const serializeChallenge = (row, { doneToday } = {}) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  icon: row.icon,
  difficulty: row.difficulty,
  goalDays: row.goal_days,
  xpReward: row.xp_reward,
  progress: row.progress,
  currentStreak: row.current_streak,
  longestStreak: row.longest_streak,
  status: row.status,
  medal: row.medal,
  startDate: row.start_date,
  completedAt: row.completed_at,
  ...(doneToday !== undefined ? { doneToday } : {}),
});

export const serializeChallengeTemplate = (row) => ({
  key: row.key,
  name: row.name,
  description: row.description,
  icon: row.icon,
  difficulty: row.difficulty,
  goalDays: row.goal_days,
});

export const serializeExercise = (row) => ({
  id: row.id,
  name: row.name,
  muscleGroup: row.muscle_group,
  isDefault: row.is_default,
});

export const serializeWorkoutExercise = (row) => ({
  id: row.id,
  dayOfWeek: row.day_of_week,
  exerciseName: row.exercise_name,
  muscleGroup: row.muscle_group,
  sets: row.sets,
  reps: row.reps,
  load: Number(row.load),
  notes: row.notes,
  sortOrder: row.sort_order,
});

export const serializeWorkoutLog = (row) => ({
  id: row.id,
  dayOfWeek: row.day_of_week,
  date: row.date,
  status: row.status,
});

export const serializeSleep = (row) => ({
  id: row.id,
  bedtime: row.bedtime,
  wakeTime: row.wake_time,
  durationMinutes: row.duration_minutes,
  quality: row.quality,
  hpGained: row.hp_gained,
  date: row.date,
});
