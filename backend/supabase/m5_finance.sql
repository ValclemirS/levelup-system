-- ============================================================
-- M5 — Finanças
-- Rode no SQL Editor do Supabase após schema.sql.
-- ============================================================

create table if not exists finance_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  -- income | fixed | variable | debt | investment
  type         text not null,
  category     text default 'Geral',
  description  text default '',
  amount       numeric not null default 0,
  date         text not null,             -- YYYY-MM-DD
  created_at   timestamptz not null default now()
);
create index if not exists idx_finance_tx_user_date on finance_transactions(user_id, date);

-- Meta de economia mensal (uma por usuário).
create table if not exists finance_goals (
  user_id             uuid primary key references users(id) on delete cascade,
  monthly_target      numeric not null default 0,
  last_rewarded_month text,                -- YYYY-MM
  updated_at          timestamptz not null default now()
);
