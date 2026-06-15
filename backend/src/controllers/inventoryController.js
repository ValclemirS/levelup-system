import ShopItem from '../models/ShopItem.js';
import InventoryItem from '../models/InventoryItem.js';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { applyXpToUser, clampStat } from '../utils/gamification.js';

/**
 * @route   GET /api/shop
 * @desc    Lista itens disponíveis na loja
 * @access  Privado
 */
export const listShop = asyncHandler(async (req, res) => {
  const items = await ShopItem.find({ isActive: true }).sort({ price: 1 });
  res.json(items);
});

/**
 * @route   POST /api/shop/:id/buy
 * @desc    Compra um item da loja (debita moedas, adiciona ao inventário)
 * @access  Privado
 */
export const buyItem = asyncHandler(async (req, res) => {
  const item = await ShopItem.findById(req.params.id);
  if (!item || !item.isActive) {
    res.status(404);
    throw new Error('Item não encontrado');
  }

  // Débito atômico: só desconta se o saldo for suficiente.
  // Evita race condition em compras simultâneas (saldo negativo).
  const user = await User.findOneAndUpdate(
    { _id: req.user._id, coins: { $gte: item.price } },
    { $inc: { coins: -item.price } },
    { new: true }
  );

  if (!user) {
    res.status(400);
    throw new Error('Moedas insuficientes');
  }

  const inv = await InventoryItem.findOneAndUpdate(
    { user: user._id, item: item._id },
    { $inc: { quantity: 1 }, $setOnInsert: { acquiredAt: new Date() } },
    { new: true, upsert: true }
  ).populate('item');

  res.status(201).json({ inventoryItem: inv, coins: user.coins });
});

/**
 * @route   GET /api/inventory
 * @desc    Lista o inventário do usuário
 * @access  Privado
 */
export const getInventory = asyncHandler(async (req, res) => {
  const items = await InventoryItem.find({ user: req.user._id, quantity: { $gt: 0 } })
    .populate('item')
    .sort({ acquiredAt: -1 });
  res.json(items);
});

/**
 * @route   POST /api/inventory/:id/use
 * @desc    Usa um item consumível e aplica seu efeito
 * @access  Privado
 */
export const useItem = asyncHandler(async (req, res) => {
  // Reivindica uma unidade de forma atômica antes de aplicar o efeito.
  // Garante que o efeito seja aplicado no máximo uma vez por unidade,
  // mesmo sob requisições simultâneas.
  const inv = await InventoryItem.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id, quantity: { $gt: 0 } },
    { $inc: { quantity: -1 } },
    { new: true }
  ).populate('item');

  if (!inv) {
    res.status(404);
    throw new Error('Item indisponível no inventário');
  }

  const user = await User.findById(req.user._id);
  const effect = inv.item.effect || {};

  // Aplica XP (com level up) e bônus de HP/Mana do efeito do item.
  if (effect.xp) {
    applyXpToUser(user, effect.xp, { hp: effect.hp || 0, mana: effect.mana || 0 });
  } else {
    // Sem XP: apenas ajusta HP/Mana respeitando os limites atuais.
    if (effect.hp) user.stats.hp = clampStat(user.stats.hp + effect.hp, user.stats.maxHp);
    if (effect.mana) user.stats.mana = clampStat(user.stats.mana + effect.mana, user.stats.maxMana);
  }

  await user.save();

  // A unidade já foi decrementada atomicamente acima.
  // Remove o documento se zerou para manter o inventário limpo.
  if (inv.quantity <= 0) {
    await inv.deleteOne();
  }

  res.json({
    message: `${inv.item.name} utilizado`,
    stats: user.stats,
    remaining: Math.max(0, inv.quantity),
  });
});
