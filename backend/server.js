import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import cron from 'node-cron';
import { connectDB } from './src/config/db.js';
import apiRoutes from './src/routes/index.js';
import { notFound, errorHandler } from './src/middleware/errorHandler.js';
import { broadcastPush } from './src/utils/pushNotifications.js';
import User from './src/models/User.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const isVercel = !!process.env.VERCEL;

// ---- Validação de variáveis de ambiente obrigatórias ----
// Falha cedo e com mensagem clara, evitando rodar com segredo inseguro.
const INSECURE_SECRET = 'troque_este_segredo_por_uma_string_longa_e_aleatoria';
const requiredEnv = ['MONGODB_URI', 'JWT_SECRET'];
const missing = requiredEnv.filter((k) => !process.env[k]);

if (missing.length) {
  console.error(`❌ Variáveis de ambiente ausentes: ${missing.join(', ')}`);
  if (!isVercel) process.exit(1);
}
if (
  process.env.JWT_SECRET &&
  (process.env.JWT_SECRET === INSECURE_SECRET || process.env.JWT_SECRET.length < 32)
) {
  const msg =
    '⚠️  JWT_SECRET fraco ou padrão. Gere um forte: ' +
    'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"';
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ ' + msg);
    if (!isVercel) process.exit(1);
  } else {
    console.warn(msg);
  }
}

// Conecta ao MongoDB
connectDB();

// ---- Middlewares globais ----
// Atrás do proxy da Vercel, o IP real chega via X-Forwarded-For
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS configurável por ambiente
const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // permite requests sem origin (apps mobile/Capacitor, curl)
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
    },
    credentials: true,
  })
);

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Limite de requisições (proteção básica contra abuso)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Muitas requisições, tente novamente mais tarde.' },
});
app.use('/api', limiter);

// Limite agressivo nas rotas de autenticação (anti brute-force).
// Aplicado antes do roteador da API, cobrindo login e registro.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10, // 10 tentativas por IP por janela
  standardHeaders: true,
  legacyHeaders: false,
  // Não conta requisições bem-sucedidas (ex.: login válido).
  skipSuccessfulRequests: true,
  message: { message: 'Muitas tentativas de autenticação. Tente novamente mais tarde.' },
});
app.use(['/api/auth/login', '/api/auth/register'], authLimiter);

// Healthcheck
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ---- Rotinas agendadas ----
async function sendMorningReminders() {
  console.log('[Cron] Enviando lembretes matinais...');
  await broadcastPush(User, {}, {
    title: '⚔️ Suas missões aguardam!',
    body: 'Bom dia, Herói! Complete suas missões de hoje e mantenha seu streak.',
    data: { screen: 'Início' },
  });
}

async function sendStreakAlerts() {
  console.log('[Cron] Enviando alertas de streak...');

  // Busca usuários que ainda não completaram nenhuma missão hoje
  const today = new Date().toISOString().slice(0, 10);
  const Mission = (await import('./src/models/Mission.js')).default;

  const activeToday = await Mission.distinct('user', {
    date: today,
    status: 'completed',
  });

  // Dispara só para quem tem streak > 0 e ainda não jogou hoje
  await broadcastPush(User, {
    _id: { $nin: activeToday },
    'streak.current': { $gt: 0 },
  }, {
    title: '🔥 Não perca seu streak!',
    body: 'Ainda dá tempo! Complete uma missão agora e mantenha sua sequência.',
    data: { screen: 'Início' },
  });
}

// Endpoints acionados pelo Vercel Cron (ver vercel.json).
// A Vercel envia "Authorization: Bearer <CRON_SECRET>" automaticamente.
const cronAuth = (req, res, next) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ message: 'Não autorizado' });
  }
  next();
};

app.get('/api/cron/morning', cronAuth, async (req, res) => {
  await sendMorningReminders();
  res.json({ ok: true });
});

app.get('/api/cron/streak', cronAuth, async (req, res) => {
  await sendStreakAlerts();
  res.json({ ok: true });
});

// ---- Rotas da API ----
app.use('/api', apiRoutes);

// ---- Tratamento de erros ----
app.use(notFound);
app.use(errorHandler);

// Na Vercel a função é serverless: sem listen() nem cron em processo.
// Localmente, sobe o servidor e agenda os crons via node-cron.
if (!isVercel) {
  cron.schedule('0 8 * * *', sendMorningReminders, { timezone: 'America/Sao_Paulo' });
  cron.schedule('0 21 * * *', sendStreakAlerts, { timezone: 'America/Sao_Paulo' });

  app.listen(PORT, () => {
    console.log(`🚀 LevelUp System API rodando em http://localhost:${PORT}`);
    console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });
}

export default app;
