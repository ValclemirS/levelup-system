-- ============================================================
-- M2 — Academia
-- Rode no SQL Editor do Supabase após schema.sql.
-- ============================================================

-- Banco de exercícios (default = user_id null; custom = user_id do criador)
create table if not exists exercises (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references users(id) on delete cascade,
  name          text not null,
  muscle_group  text not null default 'Geral',
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_exercises_user on exercises(user_id);
-- Evita duplicar exercícios default ao rodar o seed novamente.
create unique index if not exists uniq_exercises_default_name
  on exercises(name) where is_default = true;

-- Exercício atribuído a um dia da semana (0=Dom .. 6=Sáb).
create table if not exists workout_exercises (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  day_of_week   integer not null,
  exercise_name text not null,
  muscle_group  text default 'Geral',
  sets          integer not null default 3,
  reps          integer not null default 10,
  load          numeric not null default 0,
  notes         text default '',
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_workout_ex_user_day on workout_exercises(user_id, day_of_week);

-- Registro diário do treino (Feito/Faltou) — um por dia.
create table if not exists workout_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  day_of_week  integer not null,
  date         text not null,            -- YYYY-MM-DD
  status       text not null default 'done', -- 'done' | 'missed'
  created_at   timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists idx_workout_logs_user_date on workout_logs(user_id, date);

-- Histórico de cargas por exercício (para PR e evolução).
create table if not exists exercise_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  exercise_name text not null,
  date          text not null,           -- YYYY-MM-DD
  sets          integer not null default 0,
  reps          integer not null default 0,
  load          numeric not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_exercise_logs_user_ex on exercise_logs(user_id, exercise_name, date);

-- ---- Seed do banco de exercícios (default, idempotente por nome) ----
insert into exercises (name, muscle_group, is_default) values
  ('Supino reto', 'Peito', true),
  ('Supino inclinado', 'Peito', true),
  ('Crucifixo', 'Peito', true),
  ('Agachamento', 'Pernas', true),
  ('Leg press', 'Pernas', true),
  ('Cadeira extensora', 'Pernas', true),
  ('Stiff', 'Posterior', true),
  ('Panturrilha', 'Pernas', true),
  ('Levantamento terra', 'Costas', true),
  ('Puxada frontal', 'Costas', true),
  ('Remada curvada', 'Costas', true),
  ('Desenvolvimento', 'Ombro', true),
  ('Elevação lateral', 'Ombro', true),
  ('Rosca direta', 'Bíceps', true),
  ('Rosca martelo', 'Bíceps', true),
  ('Tríceps testa', 'Tríceps', true),
  ('Tríceps corda', 'Tríceps', true),
  ('Abdominal', 'Core', true),
  ('Prancha', 'Core', true)
on conflict (name) where (is_default = true) do nothing;
