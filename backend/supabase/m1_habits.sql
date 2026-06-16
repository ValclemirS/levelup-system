-- ============================================================
-- M1 — Rastreador de Hábitos
-- Rode no SQL Editor do Supabase após schema.sql.
-- ============================================================

create table if not exists habits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  title           text not null,
  description     text default '',
  icon            text default '🎯',
  color           text default '#f5c518',
  -- frequência: 'daily' (todo dia) ou 'weekly' (alvo de X dias por semana)
  frequency       text not null default 'daily',
  target_per_week integer not null default 7,
  xp_reward       integer not null default 100,
  -- streak materializado para exibição rápida (fonte de verdade = habit_logs)
  current_streak  integer not null default 0,
  longest_streak  integer not null default 0,
  last_completed  text,            -- YYYY-MM-DD
  archived        boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists idx_habits_user on habits(user_id) where archived = false;

-- Um registro por hábito por dia (idempotente via unique).
create table if not exists habit_logs (
  id          uuid primary key default gen_random_uuid(),
  habit_id    uuid not null references habits(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  date        text not null,       -- YYYY-MM-DD
  created_at  timestamptz not null default now(),
  unique (habit_id, date)
);
create index if not exists idx_habit_logs_habit_date on habit_logs(habit_id, date);
create index if not exists idx_habit_logs_user_date on habit_logs(user_id, date);
