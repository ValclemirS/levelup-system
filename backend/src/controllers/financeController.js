import { supabase } from '../config/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { applyXpToStats, XP_REWARDS } from '../utils/gamification.js';
import { evaluateAchievements } from '../utils/achievements.js';

const today = () => new Date().toISOString().slice(0, 10);
const TYPES = ['income', 'fixed', 'variable', 'debt', 'investment'];

const serializeTx = (r) => ({
  id: r.id,
  type: r.type,
  category: r.category,
  description: r.description,
  amount: Number(r.amount),
  date: r.date,
});

/** Agrega uma lista de transações por tipo. */
function aggregate(rows) {
  const sum = { income: 0, fixed: 0, variable: 0, debt: 0, investment: 0 };
  const byCategory = {};
  for (const r of rows) {
    const amt = Number(r.amount) || 0;
    if (sum[r.type] !== undefined) sum[r.type] += amt;
    if (r.type !== 'income') {
      byCategory[r.category || 'Geral'] = (byCategory[r.category || 'Geral'] || 0) + amt;
    }
  }
  const expenses = sum.fixed + sum.variable + sum.debt;
  const balance = sum.income - expenses - sum.investment; // caixa disponível
  const savings = sum.income - expenses;                  // economia (antes de investir)
  return { ...sum, expenses, balance, savings, byCategory };
}

/**
 * @route   GET /api/finance/transactions?month=YYYY-MM
 * @access  Privado
 */
export const listTransactions = asyncHandler(async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : today().slice(0, 7);
  const { data, error } = await supabase
    .from('finance_transactions')
    .select('*')
    .eq('user_id', req.user.id)
    .gte('date', `${month}-01`)
    .lte('date', `${month}-31`)
    .order('date', { ascending: false });
  if (error) throw new Error(error.message);
  res.json((data || []).map(serializeTx));
});

/**
 * @route   POST /api/finance/transactions
 * @access  Privado
 */
export const addTransaction = asyncHandler(async (req, res) => {
  const { type, category, description, amount, date } = req.body;
  if (!TYPES.includes(type)) {
    res.status(400);
    throw new Error('Tipo inválido');
  }
  if (!(Number(amount) > 0)) {
    res.status(400);
    throw new Error('Valor deve ser maior que zero');
  }
  const { data, error } = await supabase
    .from('finance_transactions')
    .insert({
      user_id: req.user.id,
      type,
      category: category || 'Geral',
      description: description || '',
      amount: Number(amount),
      date: date || today(),
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  res.status(201).json(serializeTx(data));
});

/**
 * @route   DELETE /api/finance/transactions/:id
 * @access  Privado
 */
export const deleteTransaction = asyncHandler(async (req, res) => {
  const { data } = await supabase
    .from('finance_transactions')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id')
    .single();
  if (!data) {
    res.status(404);
    throw new Error('Transação não encontrada');
  }
  res.json({ message: 'Transação removida', id: req.params.id });
});

/**
 * @route   GET /api/finance/summary?month=YYYY-MM
 * @desc    Dashboard do mês + checagem da meta (concede +300 XP 1x/mês).
 * @access  Privado
 */
export const getSummary = asyncHandler(async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : today().slice(0, 7);

  const { data: rows, error } = await supabase
    .from('finance_transactions')
    .select('type, category, amount')
    .eq('user_id', req.user.id)
    .gte('date', `${month}-01`)
    .lte('date', `${month}-31`);
  if (error) throw new Error(error.message);

  const agg = aggregate(rows || []);

  // Meta de economia mensal
  const { data: goal } = await supabase
    .from('finance_goals')
    .select('*')
    .eq('user_id', req.user.id)
    .maybeSingle();

  const target = goal ? Number(goal.monthly_target) : 0;
  const reached = target > 0 && agg.savings >= target;
  let rewarded = false;
  let xpGained = 0;
  let unlocked = [];

  // Recompensa só no mês corrente e uma única vez por mês.
  if (reached && month === today().slice(0, 7) && goal?.last_rewarded_month !== month) {
    xpGained = XP_REWARDS.finance;
    const { stats } = applyXpToStats(req.user.stats, xpGained);
    await supabase
      .from('users')
      .update({ stats, updated_at: new Date().toISOString() })
      .eq('id', req.user.id);
    req.user.stats = stats;

    await supabase
      .from('finance_goals')
      .update({ last_rewarded_month: month })
      .eq('user_id', req.user.id);

    await supabase.from('journey_events').insert({
      user_id: req.user.id,
      type: 'milestone',
      title: 'Meta financeira atingida!',
      description: `Você economizou sua meta do mês.`,
      icon: '💰',
      meta: { month, target },
    });
    unlocked = await evaluateAchievements(req.user);
    rewarded = true;
  }

  res.json({
    month,
    income: agg.income,
    fixed: agg.fixed,
    variable: agg.variable,
    debt: agg.debt,
    investment: agg.investment,
    expenses: agg.expenses,
    balance: agg.balance,
    savings: agg.savings,
    byCategory: agg.byCategory,
    goal: { target, reached, rewarded },
    xpGained,
    unlockedAchievements: unlocked,
  });
});

/**
 * @route   GET /api/finance/evolution
 * @desc    Receitas/despesas/economia dos últimos 6 meses.
 * @access  Privado
 */
export const getEvolution = asyncHandler(async (req, res) => {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const start = `${months[0]}-01`;

  const { data: rows, error } = await supabase
    .from('finance_transactions')
    .select('type, amount, date')
    .eq('user_id', req.user.id)
    .gte('date', start);
  if (error) throw new Error(error.message);

  const result = months.map((m) => {
    const monthRows = (rows || []).filter((r) => r.date.slice(0, 7) === m);
    const a = aggregate(monthRows);
    return { month: m, income: a.income, expenses: a.expenses, savings: a.savings, investment: a.investment };
  });
  res.json(result);
});

/**
 * @route   PUT /api/finance/goal
 * @desc    Define a meta de economia mensal.
 * @access  Privado
 */
export const setGoal = asyncHandler(async (req, res) => {
  const target = Math.max(Number(req.body.monthlyTarget) || 0, 0);
  const { data, error } = await supabase
    .from('finance_goals')
    .upsert({ user_id: req.user.id, monthly_target: target, updated_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  res.json({ monthlyTarget: Number(data.monthly_target) });
});
