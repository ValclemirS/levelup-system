import { supabase } from '../config/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { evaluateAchievements } from '../utils/achievements.js';

/**
 * @route   GET /api/achievements
 * @desc    Catálogo de conquistas + status de desbloqueio do usuário.
 *          Avalia conquistas pendentes antes de retornar (catch-all).
 * @access  Privado
 */
export const getAchievements = asyncHandler(async (req, res) => {
  // Tenta desbloquear o que já foi atingido.
  await evaluateAchievements(req.user);

  const [{ data: catalog }, { data: owned }] = await Promise.all([
    supabase.from('achievements').select('*').order('sort_order', { ascending: true }),
    supabase.from('user_achievements').select('achievement_key, unlocked_at').eq('user_id', req.user.id),
  ]);

  const unlockedMap = new Map((owned || []).map((o) => [o.achievement_key, o.unlocked_at]));

  const items = (catalog || []).map((a) => ({
    key: a.key,
    name: a.name,
    description: a.description,
    icon: a.icon,
    category: a.category,
    xpReward: a.xp_reward,
    unlocked: unlockedMap.has(a.key),
    unlockedAt: unlockedMap.get(a.key) || null,
  }));

  res.json({
    total: items.length,
    unlocked: items.filter((i) => i.unlocked).length,
    achievements: items,
  });
});
