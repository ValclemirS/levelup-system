import mongoose from 'mongoose';

const sleepSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    bedtime: { type: Date, required: true },
    wakeTime: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 0 },
    quality: { type: Number, min: 1, max: 5, default: 3 }, // 1 a 5 estrelas
    hpGained: { type: Number, default: 0 },
    date: {
      type: String, // YYYY-MM-DD (dia em que acordou)
      default: () => new Date().toISOString().slice(0, 10),
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model('SleepRecord', sleepSchema);
