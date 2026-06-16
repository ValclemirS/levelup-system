-- ============================================================
-- M6 — Conquistas (catálogo + desbloqueios por usuário)
-- Rode no SQL Editor do Supabase após schema.sql.
-- ============================================================

-- Catálogo de conquistas (definições). criteria define a condição.
create table if not exists achievements (
  key          text primary key,
  name         text not null,
  description  text default '',
  icon         text default '🏆',
  category     text not null default 'geral',
  criteria     jsonb not null default '{}'::jsonb, -- ex.: {"type":"level","value":5}
  xp_reward    integer not null default 0,
  sort_order   integer not null default 0
);

-- Conquistas desbloqueadas por usuário
create table if not exists user_achievements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  achievement_key text not null references achievements(key) on delete cascade,
  unlocked_at     timestamptz not null default now(),
  unique (user_id, achievement_key)
);
create index if not exists idx_user_achievements_user on user_achievements(user_id);

-- ---- Seed do catálogo (idempotente) ----
insert into achievements (key, name, description, icon, category, criteria, xp_reward, sort_order) values
  ('first_mission', 'Primeiro Passo', 'Conclua sua primeira missão.', '✅', 'missoes', '{"type":"missions_completed","value":1}', 50, 1),
  ('missions_10',   'Dedicado',       'Conclua 10 missões.',          '📋', 'missoes', '{"type":"missions_completed","value":10}', 100, 2),
  ('missions_50',   'Imparável',      'Conclua 50 missões.',          '🔥', 'missoes', '{"type":"missions_completed","value":50}', 300, 3),
  ('level_5',       'Aventureiro',    'Alcance o nível 5.',           '⭐', 'nivel',   '{"type":"level","value":5}', 100, 10),
  ('level_10',      'Guerreiro',      'Alcance o nível 10.',          '🌟', 'nivel',   '{"type":"level","value":10}', 250, 11),
  ('level_20',      'Herói',          'Alcance o nível 20.',          '👑', 'nivel',   '{"type":"level","value":20}', 500, 12),
  ('streak_7',      'Semana de Fogo', 'Mantenha uma sequência de 7 dias.', '🔥', 'streak', '{"type":"streak","value":7}', 150, 20),
  ('streak_30',     'Disciplina',     'Mantenha uma sequência de 30 dias.', '💪', 'streak', '{"type":"streak","value":30}', 600, 21),
  ('rich_500',      'Poupador',       'Acumule 500 moedas.',          '💰', 'economia', '{"type":"coins","value":500}', 100, 30),
  ('meditation_first','Mente Calma',  'Registre sua primeira meditação.', '🧘', 'bem-estar', '{"type":"meditation_sessions","value":1}', 50, 40),
  ('guild_member',  'Em Equipe',      'Entre em uma guilda.',         '🛡️', 'social', '{"type":"in_guild","value":1}', 50, 50)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  category = excluded.category,
  criteria = excluded.criteria,
  xp_reward = excluded.xp_reward,
  sort_order = excluded.sort_order;
