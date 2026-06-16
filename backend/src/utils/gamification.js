/**
 * Regras de gamificação do LevelUp System.
 * Centraliza cálculo de XP, level up, vida/mana máximas e streak.
 */

// ---- Curva de níveis (M6) ----
// XP total acumulado necessário para ESTAR em cada nível.
// Spec: Nível 1=0, 2=1000, 3=2500, 4=5000; acima disso, +2500 por nível.
const CUMULATIVE_XP = [0, 1000, 2500, 5000];
const STEP_BEYOND = 2500;

// XP total acumulado para alcançar um nível.
export const cumulativeXpForLevel = (level) => {
  if (level <= 1) return 0;
  if (level <= CUMULATIVE_XP.length) return CUMULATIVE_XP[level - 1];
  return CUMULATIVE_XP[CUMULATIVE_XP.length - 1] +
    (level - CUMULATIVE_XP.length) * STEP_BEYOND;
};

// XP necessário para avançar DE um nível para o próximo (usado pelo applyXp).
export const xpForLevel = (level) =>
  cumulativeXpForLevel(level + 1) - cumulativeXpForLevel(level);

// ---- Recompensas de XP por módulo (M6) ----
export const XP_REWARDS = {
  habit: 100,      // Hábitos (M1)
  workout: 150,    // Academia (M2)
  challenge: 200,  // Desafios (M3)
  pomodoro: 50,    // Modo Bunker (M4)
  finance: 300,    // Metas financeiras (M5)
};

// ---- Ranks/títulos por nível (M6) ----
const RANKS = [
  { min: 1, rank: 'Bronze', title: 'Novato' },
  { min: 5, rank: 'Prata', title: 'Aventureiro' },
  { min: 10, rank: 'Ouro', title: 'Guerreiro' },
  { min: 20, rank: 'Platina', title: 'Herói' },
  { min: 35, rank: 'Diamante', title: 'Lenda' },
  { min: 50, rank: 'Mestre', title: 'Mítico' },
];

// Retorna { rank, title } correspondente ao nível.
export const rankForLevel = (level) => {
  let current = RANKS[0];
  for (const r of RANKS) {
    if (level >= r.min) current = r;
  }
  return { rank: current.rank, title: current.title };
};

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
 * Stats iniciais de um novo herói (usado na criação do usuário).
 */
export const initialStats = (level = 1) => {
  const maxHp = maxHpForLevel(level);
  const maxMana = maxManaForLevel(level);
  return {
    level,
    xp: 0,
    xpToNextLevel: xpForLevel(level),
    hp: maxHp,
    maxHp,
    mana: maxMana,
    maxMana,
  };
};

/**
 * Streak inicial de um novo usuário.
 */
export const initialStreak = () => ({ current: 0, longest: 0, lastActiveDate: null });

/**
 * Aplica XP a um objeto de stats (puro) e processa level ups em cadeia.
 * Retorna os novos stats e metadados de progressão.
 *
 * @param {object} stats   - { level, xp, xpToNextLevel, hp, maxHp, mana, maxMana }
 * @param {number} amount  - XP a adicionar
 * @param {object} [bonus] - ganhos extras opcionais: { hp, mana }
 * @returns {{ stats:object, prevLevel:number, newLevel:number, leveledUp:number }}
 */
export const applyXpToStats = (stats, amount, bonus = {}) => {
  const prevLevel = stats.level;
  const updated = applyXp(stats, amount);

  const newStats = {
    level: updated.level,
    xp: updated.xp,
    xpToNextLevel: updated.xpToNextLevel,
    maxHp: updated.maxHp,
    maxMana: updated.maxMana,
    hp: clampStat(updated.hp + (bonus.hp || 0), updated.maxHp),
    mana: clampStat(updated.mana + (bonus.mana || 0), updated.maxMana),
  };

  return { stats: newStats, prevLevel, newLevel: updated.level, leveledUp: updated.leveledUp };
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

/**
 * Calcula streak a partir de um conjunto de datas 'YYYY-MM-DD'.
 * - current: dias consecutivos terminando hoje (ou ontem, se hoje ainda não feito).
 * - longest: maior sequência consecutiva do histórico.
 *
 * @param {string[]} dates
 * @param {Date} [now]
 * @returns {{ current:number, longest:number }}
 */
export const computeStreak = (dates, now = new Date()) => {
  if (!dates || dates.length === 0) return { current: 0, longest: 0 };

  const set = new Set(dates);
  const toKey = (d) => d.toISOString().slice(0, 10);
  const dayMs = 24 * 60 * 60 * 1000;

  // current: anda a partir de hoje para trás
  let current = 0;
  const start = new Date(now);
  if (!set.has(toKey(start))) start.setTime(start.getTime() - dayMs); // tolera "ontem"
  let cursor = new Date(start);
  while (set.has(toKey(cursor))) {
    current += 1;
    cursor.setTime(cursor.getTime() - dayMs);
  }

  // longest: varre as datas ordenadas
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const key of sorted) {
    const d = new Date(`${key}T00:00:00Z`);
    if (prev && (d.getTime() - prev.getTime()) === dayMs) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prev = d;
  }

  return { current, longest };
};

export default {
  xpForLevel,
  computeStreak,
  cumulativeXpForLevel,
  rankForLevel,
  XP_REWARDS,
  maxHpForLevel,
  maxManaForLevel,
  applyXp,
  applyXpToStats,
  initialStats,
  initialStreak,
  clampStat,
  updateStreak,
};
