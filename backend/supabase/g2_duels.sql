-- ============================================================
-- Guilda avançada (Fatia 2) — Apostas / Duelos 1v1
-- Rode no SQL Editor do Supabase após schema.sql + functions.sql.
-- ============================================================

create table if not exists duels (
  id              uuid primary key default gen_random_uuid(),
  challenger_id   uuid not null references users(id) on delete cascade,
  opponent_id     uuid not null references users(id) on delete cascade,
  stake           integer not null default 0,     -- moedas apostadas por cada lado
  goal_xp         integer not null default 100,   -- XP-alvo do duelo
  status          text not null default 'pending', -- pending|active|completed|declined|cancelled
  winner_id       uuid references users(id) on delete set null,
  challenger_start integer,                        -- snapshot de XP total ao iniciar
  opponent_start   integer,
  challenger_gain  integer default 0,
  opponent_gain    integer default 0,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create index if not exists idx_duels_challenger on duels(challenger_id, status);
create index if not exists idx_duels_opponent on duels(opponent_id, status);

-- Débito atômico de moedas (escrow). Retorna novo saldo ou NULL se insuficiente.
create or replace function spend_coins(p_user uuid, p_amount integer)
returns integer
language plpgsql
as $$
declare v_coins integer;
begin
  update users set coins = coins - p_amount, updated_at = now()
   where id = p_user and coins >= p_amount
   returning coins into v_coins;
  return v_coins; -- NULL se nenhuma linha atualizada
end;
$$;
