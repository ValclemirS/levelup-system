import { supabase } from '../config/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { cumulativeXpForLevel } from '../utils/gamification.js';
import { sendPush } from '../utils/pushNotifications.js';

/** XP total acumulado de um usuário (nível + progresso no nível). */
const totalXpOf = (stats) =>
  cumulativeXpForLevel(stats?.level ?? 1) + (stats?.xp ?? 0);

async function pushTo(userId, payload) {
  const { data } = await supabase.from('users').select('push_token').eq('id', userId).single();
  if (data?.push_token) sendPush(data.push_token, payload);
}

const serialize = (d, meId) => ({
  id: d.id,
  stake: d.stake,
  goalXp: d.goal_xp,
  status: d.status,
  isChallenger: d.challenger_id === meId,
  challenger: d.challenger ? { id: d.challenger.id, username: d.challenger.username, displayName: d.challenger.display_name } : null,
  opponent: d.opponent ? { id: d.opponent.id, username: d.opponent.username, displayName: d.opponent.display_name } : null,
  challengerGain: d.challenger_gain ?? 0,
  opponentGain: d.opponent_gain ?? 0,
  winnerId: d.winner_id,
  createdAt: d.created_at,
});

const SELECT = '*, challenger:users!duels_challenger_id_fkey(id, username, display_name), opponent:users!duels_opponent_id_fkey(id, username, display_name)';

/**
 * @route   POST /api/duels
 * @desc    Desafia um usuário para um duelo (escrow da aposta do desafiante).
 * @access  Privado
 */
export const createDuel = asyncHandler(async (req, res) => {
  const { opponentUsername, stake, goalXp } = req.body;
  const bet = Math.max(Number(stake) || 0, 0);
  const goal = Math.max(Number(goalXp) || 100, 1);

  if (!opponentUsername) {
    res.status(400);
    throw new Error('Informe o oponente');
  }

  const { data: opp } = await supabase
    .from('users')
    .select('id, username')
    .eq('username', opponentUsername)
    .maybeSingle();
  if (!opp) {
    res.status(404);
    throw new Error('Oponente não encontrado');
  }
  if (opp.id === req.user.id) {
    res.status(400);
    throw new Error('Você não pode duelar consigo mesmo');
  }

  // Escrow da aposta do desafiante
  if (bet > 0) {
    const { data: coins } = await supabase.rpc('spend_coins', { p_user: req.user.id, p_amount: bet });
    if (coins === null) {
      res.status(400);
      throw new Error('Moedas insuficientes para a aposta');
    }
  }

  const { data: duel, error } = await supabase
    .from('duels')
    .insert({ challenger_id: req.user.id, opponent_id: opp.id, stake: bet, goal_xp: goal })
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);

  pushTo(opp.id, {
    title: '⚔️ Você foi desafiado!',
    body: `${req.user.display_name || req.user.username} te desafiou para um duelo (aposta ${bet} moedas).`,
    data: { screen: 'Guildas' },
  });

  res.status(201).json(serialize(duel, req.user.id));
});

/**
 * @route   GET /api/duels
 * @desc    Lista meus duelos (enviados e recebidos).
 * @access  Privado
 */
export const listDuels = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('duels')
    .select(SELECT)
    .or(`challenger_id.eq.${req.user.id},opponent_id.eq.${req.user.id}`)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  res.json((data || []).map((d) => serialize(d, req.user.id)));
});

/**
 * @route   POST /api/duels/:id/accept
 * @desc    Oponente aceita (escrow da aposta + snapshot de XP). Status active.
 * @access  Privado
 */
export const acceptDuel = asyncHandler(async (req, res) => {
  const { data: duel } = await supabase.from('duels').select('*').eq('id', req.params.id).single();
  if (!duel || duel.opponent_id !== req.user.id) {
    res.status(404);
    throw new Error('Duelo não encontrado');
  }
  if (duel.status !== 'pending') {
    res.status(400);
    throw new Error('Duelo não está pendente');
  }

  if (duel.stake > 0) {
    const { data: coins } = await supabase.rpc('spend_coins', { p_user: req.user.id, p_amount: duel.stake });
    if (coins === null) {
      res.status(400);
      throw new Error('Moedas insuficientes para aceitar');
    }
  }

  // Snapshot do XP total dos dois lados
  const { data: ch } = await supabase.from('users').select('stats').eq('id', duel.challenger_id).single();
  const { data: op } = await supabase.from('users').select('stats').eq('id', duel.opponent_id).single();

  const { data: updated } = await supabase
    .from('duels')
    .update({
      status: 'active',
      challenger_start: totalXpOf(ch?.stats),
      opponent_start: totalXpOf(op?.stats),
    })
    .eq('id', duel.id)
    .select(SELECT)
    .single();

  pushTo(duel.challenger_id, {
    title: '⚔️ Duelo aceito!',
    body: 'Seu duelo começou. Ganhe XP para vencer!',
    data: { screen: 'Guildas' },
  });

  res.json(serialize(updated, req.user.id));
});

/** Recusar (oponente) ou cancelar (desafiante) um duelo pendente: refund. */
async function closePending(req, res, asStatus, requiredField) {
  const { data: duel } = await supabase.from('duels').select('*').eq('id', req.params.id).single();
  if (!duel || duel[requiredField] !== req.user.id) {
    res.status(404);
    throw new Error('Duelo não encontrado');
  }
  if (duel.status !== 'pending') {
    res.status(400);
    throw new Error('Duelo não está pendente');
  }
  // Refund da aposta do desafiante (sempre travada na criação)
  if (duel.stake > 0) {
    await supabase.rpc('adjust_coins', { p_user: duel.challenger_id, p_delta: duel.stake });
  }
  await supabase.from('duels').update({ status: asStatus }).eq('id', duel.id);
  res.json({ status: asStatus, id: duel.id });
}

export const declineDuel = asyncHandler((req, res) => closePending(req, res, 'declined', 'opponent_id'));
export const cancelDuel = asyncHandler((req, res) => closePending(req, res, 'cancelled', 'challenger_id'));

/**
 * @route   POST /api/duels/:id/resolve
 * @desc    Resolve um duelo ativo: compara ganho de XP; paga o pote ao vencedor.
 * @access  Privado
 */
export const resolveDuel = asyncHandler(async (req, res) => {
  const { data: duel } = await supabase.from('duels').select('*').eq('id', req.params.id).single();
  if (!duel || (duel.challenger_id !== req.user.id && duel.opponent_id !== req.user.id)) {
    res.status(404);
    throw new Error('Duelo não encontrado');
  }
  if (duel.status !== 'active') {
    res.status(400);
    throw new Error('Duelo não está ativo');
  }

  const { data: ch } = await supabase.from('users').select('stats').eq('id', duel.challenger_id).single();
  const { data: op } = await supabase.from('users').select('stats').eq('id', duel.opponent_id).single();

  const chGain = totalXpOf(ch?.stats) - (duel.challenger_start ?? 0);
  const opGain = totalXpOf(op?.stats) - (duel.opponent_start ?? 0);
  const reached = Math.max(chGain, opGain) >= duel.goal_xp;

  if (!reached) {
    // Ainda ninguém atingiu a meta — atualiza progresso e mantém ativo.
    await supabase.from('duels').update({ challenger_gain: chGain, opponent_gain: opGain }).eq('id', duel.id);
    return res.json({ status: 'active', ready: false, challengerGain: chGain, opponentGain: opGain, goalXp: duel.goal_xp });
  }

  const pot = duel.stake * 2;
  let winnerId = null;
  if (chGain === opGain) {
    // Empate: devolve a aposta a cada um.
    if (duel.stake > 0) {
      await supabase.rpc('adjust_coins', { p_user: duel.challenger_id, p_delta: duel.stake });
      await supabase.rpc('adjust_coins', { p_user: duel.opponent_id, p_delta: duel.stake });
    }
  } else {
    winnerId = chGain > opGain ? duel.challenger_id : duel.opponent_id;
    if (pot > 0) await supabase.rpc('adjust_coins', { p_user: winnerId, p_delta: pot });
    await supabase.from('journey_events').insert({
      user_id: winnerId,
      type: 'milestone',
      title: 'Vitória em duelo!',
      description: `Você venceu um duelo e levou ${pot} moedas.`,
      icon: '⚔️',
      meta: { pot },
    });
    pushTo(winnerId, { title: '🏆 Você venceu o duelo!', body: `Levou ${pot} moedas!`, data: { screen: 'Guildas' } });
  }

  const { data: updated } = await supabase
    .from('duels')
    .update({
      status: 'completed',
      winner_id: winnerId,
      challenger_gain: chGain,
      opponent_gain: opGain,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', duel.id)
    .select(SELECT)
    .single();

  res.json({ ...serialize(updated, req.user.id), ready: true, pot, draw: winnerId === null });
});
