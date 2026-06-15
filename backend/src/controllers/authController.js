import User from '../models/User.js';
import { generateToken } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

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

  const exists = await User.findOne({ $or: [{ email }, { username }] });
  if (exists) {
    res.status(409);
    throw new Error('Usuário ou e-mail já cadastrado');
  }

  const user = await User.create({ username, email, password, displayName });

  res.status(201).json({
    token: generateToken(user._id),
    user: user.toPublic(),
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

  // precisa do +password porque o campo tem select:false
  const user = await User.findOne({
    $or: [{ email: loginId.toLowerCase() }, { username: loginId }],
  }).select('+password');

  if (!user || !(await user.matchPassword(password))) {
    res.status(401);
    throw new Error('Credenciais inválidas');
  }

  res.json({
    token: generateToken(user._id),
    user: user.toPublic(),
  });
});

/**
 * @route   GET /api/auth/me
 * @desc    Retorna o usuário autenticado
 * @access  Privado
 */
export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('guild', 'name emblem totalXp');
  res.json(user.toPublic());
});
