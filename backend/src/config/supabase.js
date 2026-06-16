import 'dotenv/config'; // garante que o .env seja lido antes de tudo (ESM hoist)
import { createClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase (service role) para uso exclusivo no backend.
 *
 * A SERVICE_ROLE_KEY ignora as policies de RLS — por isso NUNCA deve ir ao
 * cliente/app. Toda autorização é feita aqui no backend via JWT próprio.
 *
 * Variáveis necessárias:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
  if (!process.env.VERCEL) process.exit(1);
}

export const supabase = createClient(url || '', serviceKey || '', {
  auth: { persistSession: false, autoRefreshToken: false },
});

export default supabase;
