import mongoose from 'mongoose';

const meditationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    technique: {
      type: String,
      enum: ['box-breathing', '4-7-8', 'free'],
      default: 'box-breathing', // respiração 4-4-4-4
    },
    durationSeconds: { type: Number, required: true, min: 0 },
    cycles: { type: Number, default: 0 }, // ciclos de respiração completados
    manaGained: { type: Number, default: 0 },
    xpGained: { type: Number, default: 0 },
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model('MeditationSession', meditationSchema);
