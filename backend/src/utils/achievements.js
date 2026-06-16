import { supabase } from '../config/supabase.js';
import { applyXpToStats } from './gamification.js';

/**
 * Avalia o catálogo de conquistas para um usuário, desbloqueando as que
 * passaram a ser atendidas. Cria eventos de jornada e concede XP bônus.
 *
 * @param {object} user - linha do usuário (snake_case). Pode ser mutada (stats).
 * @returns {Promise<Array>} conquistas recém-desbloqueadas
 */
export async function evaluateAchievements(user) {
  const { data: catalog } = await supabase.from('achievements').select('*');
  if (!catalog || catalog.length === 0) return [];

  const { data: owned } = await supabase
    .from('user_achievements')
    .select('achievement_key')
    .eq('user_id', user.id);
  const ownedSet = new Set((owned || []).map((o) => o.achievement_key));

  const locked = catalog.filter((a) => !ownedSet.has(a.key));
  if (locked.length === 0) return [];

  // Métricas necessárias (calculadas sob demanda).
  const types = new Set(locked.map((a) => a.criteria?.type));
  const metrics = {
    level: user.stats?.level ?? 1,
    streak: user.streak?.current ?? 0,
    coins: user.coins ?? 0,
    in_guild: user.guild_id ? 1 : 0,
  };

  if (types.has('missions_completed')) {
    const { count } = await supabase
      .from('missions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'completed');
    metrics.missions_completed = count || 0;
  }
  if (types.has('meditation_sessions')) {
    const { count } = await supabase
      .from('meditation_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    metrics.meditation_sessions = count || 0;
  }

  const meets = (c) => {
    const v = metrics[c.type];
    return v !== undefined && v >= (c.value ?? Infinity);
  };

  const toUnlock = locked.filter((a) => meets(a.criteria || {}));
  if (toUnlock.length === 0) return [];

  await supabase.from('user_achievements').insert(
    toUnlock.map((a) => ({ user_id: user.id, achievement_key: a.key }))
  );

  await supabase.from('journey_events').insert(
    toUnlock.map((a) => ({
      user_id: user.id,
      type: 'achievement',
      title: `Conquista: ${a.name}`,
      description: a.description,
      icon: a.icon,
      meta: { key: a.key },
    }))
  );

  // Concede XP bônus das conquistas (sem recursão — novos unlocks por nível
  // ficam para a próxima avaliação).
  const bonus = toUnlock.reduce((s, a) => s + (a.xp_reward || 0), 0);
  if (bonus > 0) {
    const { stats } = applyXpToStats(user.stats, bonus);
    await supabase
      .from('users')
      .update({ stats, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    user.stats = stats;
  }

  return toUnlock.map((a) => ({ key: a.key, name: a.name, icon: a.icon, xp: a.xp_reward }));
}
