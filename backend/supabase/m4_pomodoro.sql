-- ============================================================
-- M4 — Modo Bunker (Pomodoro)
-- Rode no SQL Editor do Supabase após schema.sql.
-- ============================================================

create table if not exists pomodoro_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  focus_minutes integer not null default 0,   -- total de minutos focados na sessão
  break_minutes integer not null default 0,
  cycles        integer not null default 0,   -- ciclos de foco completados
  date          text not null,                -- YYYY-MM-DD
  created_at    timestamptz not null default now()
);
create index if not exists idx_pomodoro_user_date on pomodoro_sessions(user_id, date);
