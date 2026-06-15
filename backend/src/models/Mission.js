import mongoose from 'mongoose';

const missionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    // Categoria liga a missão a um atributo do personagem
    category: {
      type: String,
      enum: ['health', 'focus', 'progress'], // HP, Mana, XP
      default: 'progress',
    },

    type: {
      type: String,
      enum: ['daily', 'weekly', 'main'],
      default: 'daily',
    },

    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard', 'epic'],
      default: 'easy',
    },

    // Recompensas concedidas ao concluir
    rewards: {
      xp: { type: Number, default: 10 },
      coins: { type: Number, default: 5 },
      hp: { type: Number, default: 0 },
      mana: { type: Number, default: 0 },
    },

    status: {
      type: String,
      enum: ['pending', 'completed'],
      default: 'pending',
    },

    completedAt: { type: Date, default: null },

    // Dia ao qual a missão pertence (para missões diárias)
    date: {
      type: String, // formato YYYY-MM-DD
      default: () => new Date().toISOString().slice(0, 10),
      index: true,
    },
  },
  { timestamps: true }
);

missionSchema.index({ user: 1, date: 1, status: 1 });

export default mongoose.model('Mission', missionSchema);
