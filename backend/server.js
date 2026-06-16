import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import cron from 'node-cron';
import { supabase } from './src/config/supabase.js';
import apiRoutes from './src/routes/index.js';
import { notFound, errorHandler } from './src/middleware/errorHandler.js';
import { broadcastPush } from './src/utils/pushNotifications.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const isVercel = !!process.env.VERCEL;

// ---- Validação de variáveis de ambiente obrigatórias ----
// Falha cedo e com mensagem clara, evitando rodar com segredo inseguro.
const INSECURE_SECRET = 'troque_este_segredo_por_uma_string_longa_e_aleatoria';
const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET'];
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
  const { data: users } = await supabase
    .from('users')
    .select('push_token')
    .not('push_token', 'is', null);

  const tokens = (users || []).map((u) => u.push_token);
  await broadcastPush(tokens, {
    title: '⚔️ Suas missões aguardam!',
    body: 'Bom dia, Herói! Complete suas missões de hoje e mantenha seu streak.',
    data: { screen: 'Início' },
  });
}

async function sendStreakAlerts() {
  console.log('[Cron] Enviando alertas de streak...');

  const today = new Date().toISOString().slice(0, 10);

  // Usuários que já completaram alguma missão hoje (não precisam de alerta)
  const { data: active } = await supabase
    .from('missions')
    .select('user_id')
    .eq('date', today)
    .eq('status', 'completed');
  const activeIds = new Set((active || []).map((m) => m.user_id));

  // Candidatos: têm push_token; filtra streak > 0 e inatividade em JS
  const { data: users } = await supabase
    .from('users')
    .select('id, push_token, streak')
    .not('push_token', 'is', null);

  const tokens = (users || [])
    .filter((u) => (u.streak?.current ?? 0) > 0 && !activeIds.has(u.id))
    .map((u) => u.push_token);

  await broadcastPush(tokens, {
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
