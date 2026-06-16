# Deploy do Backend na Vercel (com Supabase)

API serverless (Express + Supabase/PostgreSQL). O `server.js` exporta o app;
a função serverless fica em `api/index.js` e o `vercel.json` encaminha todas as
rotas para ela. Os crons viram endpoints acionados pelo Vercel Cron.

## 1. Supabase
1. Crie um projeto em https://supabase.com
2. **SQL Editor** → rode, nesta ordem:
   - `supabase/schema.sql` (tabelas e índices)
   - `supabase/functions.sql` (funções RPC: compras atômicas, leaderboard, etc.)
3. **Project Settings → API** → copie:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (secreta!) → `SUPABASE_SERVICE_ROLE_KEY`

> O backend usa a `service_role` (ignora RLS). Ela **nunca** vai ao app —
> toda autorização é feita aqui via JWT próprio.

## 2. Variáveis de ambiente (painel da Vercel)
**Project → Settings → Environment Variables**:

| Variável | Valor |
|---|---|
| `SUPABASE_URL` | Project URL do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | `30d` |
| `NODE_ENV` | `production` |
| `CRON_SECRET` | string aleatória (a Vercel a envia aos endpoints de cron) |
| `CORS_ORIGIN` | origens do front web, se houver |

## 3. Deploy
Dentro de `backend/`:
```
npm i -g vercel
vercel --prod
```
Ou via GitHub, com **Root Directory = `backend`**.

## 4. Pós-deploy
1. `https://SEU-PROJETO.vercel.app/health` → `{"status":"ok"}`.
2. Popule a loja (uma vez), localmente apontando para o Supabase:
   ```
   npm run seed
   ```
3. Atualize a URL no app Flutter (`mobile_flutter/lib/core/api_client.dart`)
   para `https://SEU-PROJETO.vercel.app/api`.

## Notas
- **Cron (Hobby):** 1x/dia por job, sem precisão de minuto. Horários em UTC no
  `vercel.json` (11:00/00:00 = 08:00/21:00 de Brasília).
- **Atomicidade:** compras, uso de itens e XP de guilda usam funções RPC do
  Postgres (`functions.sql`) — sem race conditions.
