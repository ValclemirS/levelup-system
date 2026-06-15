import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { maxHpForLevel, maxManaForLevel, xpForLevel } from '../utils/gamification.js';

const statsSchema = new mongoose.Schema(
  {
    level: { type: Number, default: 1, min: 1 },
    xp: { type: Number, default: 0, min: 0 },
    xpToNextLevel: { type: Number, default: () => xpForLevel(1) },
    hp: { type: Number, default: 100, min: 0 },
    maxHp: { type: Number, default: 100 },
    mana: { type: Number, default: 50, min: 0 },
    maxMana: { type: Number, default: 50 },
  },
  { _id: false }
);

const streakSchema = new mongoose.Schema(
  {
    current: { type: Number, default: 0 },
    longest: { type: Number, default: 0 },
    lastActiveDate: { type: Date, default: null },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Nome de usuário é obrigatório'],
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    email: {
      type: String,
      required: [true, 'E-mail é obrigatório'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'E-mail inválido'],
    },
    password: {
      type: String,
      required: [true, 'Senha é obrigatória'],
      minlength: 6,
      select: false, // nunca retorna a senha por padrão
    },
    displayName: { type: String, trim: true },
    avatar: { type: String, default: '' },
    title: { type: String, default: 'Novato' }, // título do "herói"

    stats: { type: statsSchema, default: () => ({}) },
    streak: { type: streakSchema, default: () => ({}) },

    coins: { type: Number, default: 0, min: 0 }, // moeda da loja

    guild: { type: mongoose.Schema.Types.ObjectId, ref: 'Guild', default: null },

    pushToken: { type: String, default: null }, // Expo Push Token

    achievements: [
      {
        key: String,
        name: String,
        unlockedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Índice composto para o ranking global (getLeaderboard ordena por estes campos).
// Evita COLLSCAN + sort em memória conforme a base de usuários cresce.
userSchema.index({ 'stats.level': -1, 'stats.xp': -1 });

// Hash da senha antes de salvar
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Garante stats coerentes na criação
userSchema.pre('save', function (next) {
  if (this.isNew) {
    this.stats.maxHp = maxHpForLevel(this.stats.level);
    this.stats.maxMana = maxManaForLevel(this.stats.level);
    this.stats.hp = this.stats.maxHp;
    this.stats.mana = this.stats.maxMana;
    this.stats.xpToNextLevel = xpForLevel(this.stats.level);
    if (!this.displayName) this.displayName = this.username;
  }
  next();
});

// Compara senha em texto puro com o hash
userSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

// Versão segura para enviar ao cliente
userSchema.methods.toPublic = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

export default mongoose.model('User', userSchema);
