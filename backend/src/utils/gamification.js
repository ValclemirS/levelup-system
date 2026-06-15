/**
 * Regras de gamificação do LevelUp System.
 * Centraliza cálculo de XP, level up, vida/mana máximas e streak.
 */

// XP necessário para alcançar um determinado nível (curva crescente estilo RPG)
export const xpForLevel = (level) => Math.floor(100 * Math.pow(level, 1.5));

// Vida e mana máximas escalam com o nível
export const maxHpForLevel = (level) => 100 + (level - 1) * 10;
export const maxManaForLevel = (level) => 50 + (level - 1) * 5;

/**
 * Aplica ganho de XP a um conjunto de stats e processa level ups em cadeia.
 * Retorna os stats atualizados + quantos níveis subiu.
 *
 * @param {object} stats - { level, xp, xpToNextLevel, hp, maxHp, mana, maxMana }
 * @param {number} amount - XP a adicionar
 */
export const applyXp = (stats, amount) => {
  let { level, xp } = stats;
  xp += Math.max(0, amount);
  let leveledUp = 0;

  let needed = xpForLevel(level);
  while (xp >= needed) {
    xp -= needed;
    level += 1;
    leveledUp += 1;
    needed = xpForLevel(level);
  }

  const maxHp = maxHpForLevel(level);
  const maxMana = maxManaForLevel(level);

  return {
    level,
    xp,
    xpToNextLevel: needed,
    maxHp,
    maxMana,
    // ao subir de nível, restaura HP e Mana cheios
    hp: leveledUp > 0 ? maxHp : Math.min(stats.hp, maxHp),
    mana: leveledUp > 0 ? maxMana : Math.min(stats.mana, maxMana),
    leveledUp,
  };
};

/**
 * Ajusta um stat (hp ou mana) respeitando os limites [0, max].
 */
export const clampStat = (value, max) => Math.max(0, Math.min(value, max));

/**
 * Aplica XP a um documento de usuário (mutando user.stats) e processa level ups.
 * Centraliza a lógica antes duplicada em vários controllers.
 *
 * @param {object} user   - documento Mongoose do usuário
 * @param {number} amount - XP a adicionar
 * @param {object} [bonus] - ganhos extras opcionais: { hp, mana }
 * @returns {{ prevLevel:number, newLevel:number, leveledUp:number }}
 */
export const applyXpToUser = (user, amount, bonus = {}) => {
  const prevLevel = user.stats.level;
  const updated = applyXp(user.stats.toObject(), amount);

  user.stats.level = updated.level;
  user.stats.xp = updated.xp;
  user.stats.xpToNextLevel = updated.xpToNextLevel;
  user.stats.maxHp = updated.maxHp;
  user.stats.maxMana = updated.maxMana;
  user.stats.hp = clampStat(updated.hp + (bonus.hp || 0), updated.maxHp);
  user.stats.mana = clampStat(updated.mana + (bonus.mana || 0), updated.maxMana);

  return { prevLevel, newLevel: updated.level, leveledUp: updated.leveledUp };
};

/**
 * Calcula o novo streak comparando a última data ativa com hoje.
 * Retorna { current, longest, lastActiveDate, changed }.
 *
 * - Mesmo dia: nada muda.
 * - Dia seguinte: streak +1.
 * - Gap maior: streak reinicia em 1.
 */
export const updateStreak = (streak = {}, now = new Date()) => {
  const current = streak.current || 0;
  const longest = streak.longest || 0;
  const last = streak.lastActiveDate ? new Date(streak.lastActiveDate) : null;

  const toDayKey = (d) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const todayKey = toDayKey(now);

  if (!last) {
    return { current: 1, longest: Math.max(1, longest), lastActiveDate: now, changed: true };
  }

  const lastKey = toDayKey(last);
  const oneDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((todayKey - lastKey) / oneDay);

  if (diffDays === 0) {
    return { current, longest, lastActiveDate: last, changed: false };
  }

  if (diffDays === 1) {
    const newCurrent = current + 1;
    return {
      current: newCurrent,
      longest: Math.max(longest, newCurrent),
      lastActiveDate: now,
      changed: true,
    };
  }

  // Quebrou a sequência
  return { current: 1, longest: Math.max(longest, 1), lastActiveDate: now, changed: true };
};

export default {
  xpForLevel,
  maxHpForLevel,
  maxManaForLevel,
  applyXp,
  applyXpToUser,
  clampStat,
  updateStreak,
};
