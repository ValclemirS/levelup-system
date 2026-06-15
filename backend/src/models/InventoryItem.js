import mongoose from 'mongoose';

/**
 * Item que um usuário possui (resultado de uma compra na loja).
 */
const inventoryItemSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'ShopItem', required: true },
    quantity: { type: Number, default: 1, min: 0 },
    acquiredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Um documento por par usuário+item (quantidade controla o resto)
inventoryItemSchema.index({ user: 1, item: 1 }, { unique: true });

export default mongoose.model('InventoryItem', inventoryItemSchema);
