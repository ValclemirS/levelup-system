import mongoose from 'mongoose';

/**
 * Evento da "jornada do herói" - usado para montar a timeline do usuário.
 * Gerado automaticamente em level ups, conquistas e marcos.
 */
const journeyEventSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['level_up', 'achievement', 'mission', 'guild', 'milestone', 'streak'],
      default: 'milestone',
    },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    icon: { type: String, default: '⭐' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} }, // dados extras (nível, etc.)
  },
  { timestamps: true }
);

journeyEventSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('JourneyEvent', journeyEventSchema);
