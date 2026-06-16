-- ============================================================
-- LevelUp System — Funções RPC (operações atômicas)
-- Rode no SQL Editor do Supabase APÓS schema.sql.
-- ============================================================

-- Compra atômica: debita moedas (se houver saldo) e credita o item.
-- Retorna { coins, inventory } ou lança exceção se saldo insuficiente.
create or replace function purchase_item(p_user uuid, p_item uuid)
returns jsonb
language plpgsql
as $$
declare
  v_price   integer;
  v_active  boolean;
  v_coins   integer;
  v_inv     jsonb;
begin
  select price, is_active into v_price, v_active from shop_items where id = p_item;
  if v_price is null or not v_active then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  -- Débito condicional atômico
  update users set coins = coins - v_price, updated_at = now()
   where id = p_user and coins >= v_price
   returning coins into v_coins;

  if v_coins is null then
    raise exception 'INSUFFICIENT_COINS';
  end if;

  -- Crédito do item (upsert com incremento)
  insert into inventory_items (user_id, item_id, quantity)
       values (p_user, p_item, 1)
  on conflict (user_id, item_id)
  do update set quantity = inventory_items.quantity + 1
  returning to_jsonb(inventory_items.*) into v_inv;

  return jsonb_build_object('coins', v_coins, 'inventory', v_inv);
end;
$$;

-- Reivindica atomicamente 1 unidade de um item do inventário.
-- Retorna a linha do inventário (após decremento) + dados do item, ou null.
create or replace function consume_inventory_unit(p_inv uuid, p_user uuid)
returns jsonb
language plpgsql
as $$
declare
  v_row     inventory_items;
  v_item    shop_items;
begin
  update inventory_items set quantity = quantity - 1
   where id = p_inv and user_id = p_user and quantity > 0
   returning * into v_row;

  if v_row.id is null then
    return null;
  end if;

  select * into v_item from shop_items where id = v_row.item_id;

  return jsonb_build_object(
    'id', v_row.id,
    'quantity', v_row.quantity,
    'item', to_jsonb(v_item.*)
  );
end;
$$;

-- Incrementa moedas (delta pode ser negativo). Retorna novo saldo.
create or replace function adjust_coins(p_user uuid, p_delta integer)
returns integer
language plpgsql
as $$
declare v_coins integer;
begin
  update users set coins = greatest(0, coins + p_delta), updated_at = now()
   where id = p_user
   returning coins into v_coins;
  return v_coins;
end;
$$;

-- Ranking global ordenado numericamente por nível e XP (usa o índice).
create or replace function get_leaderboard(p_limit integer)
returns setof users
language sql
stable
as $$
  select *
    from users
   order by (stats->>'level')::int desc, (stats->>'xp')::int desc
   limit p_limit;
$$;

-- Soma XP à guilda e ao membro de forma atômica.
create or replace function add_guild_xp(p_guild uuid, p_user uuid, p_xp integer)
returns void
language plpgsql
as $$
begin
  update guilds set total_xp = total_xp + p_xp where id = p_guild;
  update guild_members set contributed_xp = contributed_xp + p_xp
   where guild_id = p_guild and user_id = p_user;
end;
$$;
