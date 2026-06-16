-- ============================================================
-- M3 — Desafios
-- Rode no SQL Editor do Supabase após schema.sql.
-- ============================================================

-- Catálogo de desafios predefinidos (templates).
create table if not exists challenge_templates (
  key          text primary key,
  name         text not null,
  description  text default '',
  icon         text default '🔥',
  difficulty   text not null default 'medium', -- easy | medium | hard
  goal_days    integer not null default 30,
  sort_order   integer not null default 0
);

-- Desafios do usuário (instâncias). Dados denormalizados do template.
create table if not exists user_challenges (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  name           text not null,
  description    text default '',
  icon           text default '🔥',
  difficulty     text not null default 'medium',
  goal_days      integer not null default 30,
  xp_reward      integer not null default 200,
  progress       integer not null default 0,  -- dias concluídos
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_check     text,                         -- YYYY-MM-DD
  status         text not null default 'active', -- active | completed | abandoned
  medal          text,                          -- bronze | silver | gold
  start_date     text not null,
  completed_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists idx_user_challenges_user on user_challenges(user_id, status);

-- Check-ins diários por desafio (idempotente por dia).
create table if not exists challenge_logs (
  id                 uuid primary key default gen_random_uuid(),
  user_challenge_id  uuid not null references user_challenges(id) on delete cascade,
  user_id            uuid not null references users(id) on delete cascade,
  date               text not null,
  created_at         timestamptz not null default now(),
  unique (user_challenge_id, date)
);
create index if not exists idx_challenge_logs_uc on challenge_logs(user_challenge_id);

-- ---- Seed dos templates (idempotente) ----
insert into challenge_templates (key, name, description, icon, difficulty, goal_days, sort_order) values
  ('wake_5am',     'Acordar às 5h',      'Acorde às 5h da manhã todos os dias.',        '🌅', 'hard',   30, 1),
  ('read_30',      'Ler 30 páginas',     'Leia ao menos 30 páginas por dia.',           '📚', 'easy',   30, 2),
  ('gym_30',       'Academia 30 dias',   'Treine por 30 dias seguidos.',                '💪', 'hard',   30, 3),
  ('no_soda',      'Sem refrigerante',   'Fique sem refrigerante.',                     '🥤', 'medium', 21, 4),
  ('meditate',     'Meditação diária',   'Medite todos os dias.',                       '🧘', 'easy',   21, 5),
  ('nofap',        'NoFap',              'Desafio de autocontrole.',                    '🛡️', 'hard',   30, 6),
  ('cold_shower',  'Banho gelado',       'Tome banho gelado todas as manhãs.',          '🚿', 'medium', 14, 7),
  ('water_3l',     'Beber 3L de água',   'Hidrate-se com 3 litros por dia.',            '💧', 'easy',   21, 8)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  difficulty = excluded.difficulty,
  goal_days = excluded.goal_days,
  sort_order = excluded.sort_order;
