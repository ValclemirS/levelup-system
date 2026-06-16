-- ============================================================
-- Guilda avançada (Fatia 1) — Chat + Desafios coletivos
-- Rode no SQL Editor do Supabase após schema.sql.
-- ============================================================

-- Mural / chat da guilda
create table if not exists guild_messages (
  id          uuid primary key default gen_random_uuid(),
  guild_id    uuid not null references guilds(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  text        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_guild_messages_guild on guild_messages(guild_id, created_at desc);

-- Desafios coletivos da guilda (meta de XP cumprida pelos membros)
create table if not exists guild_challenges (
  id            uuid primary key default gen_random_uuid(),
  guild_id      uuid not null references guilds(id) on delete cascade,
  title         text not null,
  description   text default '',
  goal_xp       integer not null default 1000,
  progress_xp   integer not null default 0,
  reward_coins  integer not null default 50,
  reward_xp     integer not null default 100,
  status        text not null default 'active',  -- active | completed
  created_by    uuid references users(id) on delete set null,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_guild_challenges_guild on guild_challenges(guild_id, status);
