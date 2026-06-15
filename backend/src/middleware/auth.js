import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Gera um token JWT para um usuário.
 */
export const generateToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });

/**
 * Middleware que protege rotas: exige um Bearer token válido
 * no header Authorization e injeta req.user.
 */
export const protect = async (req, res, next) => {
  let token;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Não autorizado: token ausente' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'Não autorizado: usuário não encontrado' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Não autorizado: token inválido ou expirado' });
  }
};

export default protect;
