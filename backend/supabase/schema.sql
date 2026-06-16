-- ============================================================
-- LevelUp System — Schema do banco (Supabase / PostgreSQL)
-- Rode este script no SQL Editor do Supabase (uma vez).
-- ============================================================

-- Extensão para gen_random_uuid()
create extension if not exists "pgcrypto";

-- ----------------------- USERS -----------------------
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  email         text not null unique,
  password      text not null,
  display_name  text,
  avatar        text default '',
  title         text default 'Novato',
  -- stats e streak como jsonb preservam a estrutura aninhada da API
  stats         jsonb not null default '{}'::jsonb,
  streak        jsonb not null default '{"current":0,"longest":0,"lastActiveDate":null}'::jsonb,
  coins         integer not null default 0,
  guild_id      uuid,
  push_token    text,
  achievements  jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Índice do ranking global (ordena por nível e XP dentro do jsonb stats)
create index if not exists idx_users_leaderboard
  on users (((stats->>'level')::int) desc, ((stats->>'xp')::int) desc);

-- ----------------------- SHOP ITEMS -----------------------
create table if not exists shop_items (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,
  name         text not null,
  description  text default '',
  icon         text default '🎁',
  type         text not null default 'reward',
  rarity       text not null default 'common',
  price        integer not null default 0,
  effect       jsonb not null default '{}'::jsonb,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ----------------------- INVENTORY -----------------------
create table if not exists inventory_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  item_id      uuid not null references shop_items(id) on delete cascade,
  quantity     integer not null default 1,
  acquired_at  timestamptz not null default now(),
  unique (user_id, item_id)
);
create index if not exists idx_inventory_user on inventory_items(user_id);

-- ----------------------- MISSIONS -----------------------
create table if not exists missions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  title         text not null,
  description   text default '',
  category      text not null default 'progress',
  type          text not null default 'daily',
  difficulty    text not null default 'easy',
  rewards       jsonb not null default '{"xp":10,"coins":5,"hp":0,"mana":0}'::jsonb,
  status        text not null default 'pending',
  completed_at  timestamptz,
  date          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_missions_user_date_status on missions(user_id, date, status);

-- ----------------------- GUILDS -----------------------
create table if not exists guilds (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  description  text default '',
  emblem       text default '🛡️',
  leader_id    uuid not null references users(id) on delete cascade,
  total_xp     integer not null default 0,
  max_members  integer not null default 50,
  is_public    boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists idx_guilds_total_xp on guilds(total_xp desc);

create table if not exists guild_members (
  id              uuid primary key default gen_random_uuid(),
  guild_id        uuid not null references guilds(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  role            text not null default 'member',
  contributed_xp  integer not null default 0,
  joined_at       timestamptz not null default now(),
  unique (guild_id, user_id)
);
create index if not exists idx_guild_members_guild on guild_members(guild_id);

-- FK de users.guild_id -> guilds (após guilds existir)
alter table users
  drop constraint if exists fk_users_guild;
alter table users
  add constraint fk_users_guild
  foreign key (guild_id) references guilds(id) on delete set null;

-- ----------------------- JOURNEY EVENTS -----------------------
create table if not exists journey_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  type         text not null default 'milestone',
  title        text not null,
  description  text default '',
  icon         text default '⭐',
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_journey_user_created on journey_events(user_id, created_at desc);

-- ----------------------- MEDITATION -----------------------
create table if not exists meditation_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  technique         text not null default 'box-breathing',
  duration_seconds  integer not null default 0,
  cycles            integer not null default 0,
  mana_gained       integer not null default 0,
  xp_gained         integer not null default 0,
  completed_at      timestamptz not null default now()
);
create index if not exists idx_meditation_user on meditation_sessions(user_id);

-- ----------------------- SLEEP -----------------------
create table if not exists sleep_records (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  bedtime           timestamptz not null,
  wake_time         timestamptz not null,
  duration_minutes  integer not null default 0,
  quality           integer not null default 3,
  hp_gained         integer not null default 0,
  date              text not null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_sleep_user on sleep_records(user_id);
