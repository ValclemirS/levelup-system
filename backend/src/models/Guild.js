import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['leader', 'officer', 'member'], default: 'member' },
    contributedXp: { type: Number, default: 0 }, // XP que o membro trouxe à guilda
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const guildSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Nome da guilda é obrigatório'],
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 40,
    },
    description: { type: String, default: '', maxlength: 200 },
    emblem: { type: String, default: '🛡️' },

    leader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [memberSchema],

    totalXp: { type: Number, default: 0 }, // soma usada no ranking de guildas
    maxMembers: { type: Number, default: 50 },

    isPublic: { type: Boolean, default: true },
  },
  { timestamps: true }
);

guildSchema.index({ totalXp: -1 });

// Helper para saber se um usuário já é membro
guildSchema.methods.hasMember = function (userId) {
  return this.members.some((m) => m.user.toString() === userId.toString());
};

export default mongoose.model('Guild', guildSchema);
