import { supabase } from '../config/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { applyXpToStats, clampStat } from '../utils/gamification.js';
import { serializeShopItem, serializeInventory } from '../utils/serializers.js';

/**
 * @route   GET /api/shop
 * @desc    Lista itens disponíveis na loja
 * @access  Privado
 */
export const listShop = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('shop_items')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true });

  if (error) throw new Error(error.message);
  res.json((data || []).map(serializeShopItem));
});

/**
 * @route   POST /api/shop/:id/buy
 * @desc    Compra um item (débito de moedas + crédito no inventário) — atômico via RPC
 * @access  Privado
 */
export const buyItem = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.rpc('purchase_item', {
    p_user: req.user.id,
    p_item: req.params.id,
  });

  if (error) {
    if (/INSUFFICIENT_COINS/.test(error.message)) {
      res.status(400);
      throw new Error('Moedas insuficientes');
    }
    if (/ITEM_NOT_FOUND/.test(error.message)) {
      res.status(404);
      throw new Error('Item não encontrado');
    }
    throw new Error(error.message);
  }

  // data = { coins, inventory: <linha inventory_items> }
  const invRow = data.inventory;
  const { data: itemRow } = await supabase
    .from('shop_items')
    .select('*')
    .eq('id', invRow.item_id)
    .single();

  res.status(201).json({
    inventoryItem: serializeInventory(invRow, itemRow),
    coins: data.coins,
  });
});

/**
 * @route   GET /api/inventory
 * @desc    Lista o inventário do usuário
 * @access  Privado
 */
export const getInventory = asyncHandler(async (req, res) => {
  // Join com shop_items via select aninhado do Supabase
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*, item:shop_items(*)')
    .eq('user_id', req.user.id)
    .gt('quantity', 0)
    .order('acquired_at', { ascending: false });

  if (error) throw new Error(error.message);
  res.json((data || []).map((row) => serializeInventory(row, row.item)));
});

/**
 * @route   POST /api/inventory/:id/use
 * @desc    Usa um item consumível e aplica seu efeito
 * @access  Privado
 */
export const useItem = asyncHandler(async (req, res) => {
  // Reivindica 1 unidade de forma atômica (RPC) e recebe o item.
  const { data, error } = await supabase.rpc('consume_inventory_unit', {
    p_inv: req.params.id,
    p_user: req.user.id,
  });

  if (error) throw new Error(error.message);
  if (!data) {
    res.status(404);
    throw new Error('Item indisponível no inventário');
  }

  const effect = (data.item && data.item.effect) || {};
  let stats = req.user.stats;

  if (effect.xp) {
    ({ stats } = applyXpToStats(req.user.stats, effect.xp, {
      hp: effect.hp || 0,
      mana: effect.mana || 0,
    }));
  } else {
    stats = { ...req.user.stats };
    if (effect.hp) stats.hp = clampStat(stats.hp + effect.hp, stats.maxHp);
    if (effect.mana) stats.mana = clampStat(stats.mana + effect.mana, stats.maxMana);
  }

  const { error: uErr } = await supabase
    .from('users')
    .update({ stats, updated_at: new Date().toISOString() })
    .eq('id', req.user.id);
  if (uErr) throw new Error(uErr.message);

  // Remove a linha do inventário se zerou
  if (data.quantity <= 0) {
    await supabase.from('inventory_items').delete().eq('id', req.params.id);
  }

  res.json({
    message: `${data.item.name} utilizado`,
    stats,
    remaining: Math.max(0, data.quantity),
  });
});
