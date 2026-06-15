import mongoose from 'mongoose';

/**
 * Item disponível na Loja de recompensas.
 * O inventário do usuário referencia estes itens.
 */
const shopItemSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // identificador estável
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    icon: { type: String, default: '🎁' },

    type: {
      type: String,
      enum: ['consumable', 'boost', 'cosmetic', 'reward'],
      default: 'reward',
    },
    rarity: {
      type: String,
      enum: ['common', 'rare', 'epic', 'legendary'],
      default: 'common',
    },

    price: { type: Number, required: true, min: 0 }, // custo em moedas

    // Efeito aplicado ao usar/comprar (opcional)
    effect: {
      hp: { type: Number, default: 0 },
      mana: { type: Number, default: 0 },
      xp: { type: Number, default: 0 },
      xpMultiplier: { type: Number, default: 1 },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('ShopItem', shopItemSchema);
