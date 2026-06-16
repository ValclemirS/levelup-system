import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase.js';
import { generateToken } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { publicUser } from '../utils/serializers.js';
import { initialStats, initialStreak } from '../utils/gamification.js';

/**
 * @route   POST /api/auth/register
 * @desc    Cria um novo usuário e retorna token
 * @access  Público
 */
export const register = asyncHandler(async (req, res) => {
  const { username, email, password, displayName } = req.body;

  if (!username || !email || !password) {
    res.status(400);
    throw new Error('username, email e password são obrigatórios');
  }
  if (password.length < 6) {
    res.status(400);
    throw new Error('A senha deve ter ao menos 6 caracteres');
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Verifica duplicidade de e-mail ou username
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .or(`email.eq.${normalizedEmail},username.eq.${username}`)
    .limit(1);

  if (existing && existing.length > 0) {
    res.status(409);
    throw new Error('Usuário ou e-mail já cadastrado');
  }

  const hashed = await bcrypt.hash(password, 10);

  const { data: user, error } = await supabase
    .from('users')
    .insert({
      username: username.trim(),
      email: normalizedEmail,
      password: hashed,
      display_name: displayName || username.trim(),
      stats: initialStats(1),
      streak: initialStreak(),
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  res.status(201).json({
    token: generateToken(user.id),
    user: publicUser(user),
  });
});

/**
 * @route   POST /api/auth/login
 * @desc    Autentica usuário e retorna token
 * @access  Público
 */
export const login = asyncHandler(async (req, res) => {
  const { identifier, email, username, password } = req.body;
  const loginId = identifier || email || username;

  if (!loginId || !password) {
    res.status(400);
    throw new Error('Informe e-mail/usuário e senha');
  }

  const { data: users } = await supabase
    .from('users')
    .select('*')
    .or(`email.eq.${loginId.toLowerCase()},username.eq.${loginId}`)
    .limit(1);

  const user = users && users[0];

  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401);
    throw new Error('Credenciais inválidas');
  }

  res.json({
    token: generateToken(user.id),
    user: publicUser(user),
  });
});

/**
 * @route   GET /api/auth/me
 * @desc    Retorna o usuário autenticado
 * @access  Privado
 */
export const getMe = asyncHandler(async (req, res) => {
  // req.user já é a linha completa carregada pelo middleware protect.
  let guild;
  if (req.user.guild_id) {
    const { data: g } = await supabase
      .from('guilds')
      .select('id, name, emblem, total_xp')
      .eq('id', req.user.guild_id)
      .single();
    if (g) guild = { id: g.id, name: g.name, emblem: g.emblem, totalXp: g.total_xp };
  }
  res.json(publicUser(req.user, guild));
});
