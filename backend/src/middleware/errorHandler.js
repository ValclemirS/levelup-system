/**
 * Middleware para rotas não encontradas (404).
 */
export const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Rota não encontrada: ${req.originalUrl}`));
};

/**
 * Tratador de erros central. Padroniza a resposta de erro da API.
 */
export const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  let message = err.message || 'Erro interno do servidor';

  // Violação de unicidade no Postgres (ex.: e-mail/username/guilda já existe)
  if (err.code === '23505') {
    statusCode = 409;
    message = 'Valor já em uso (registro duplicado)';
  }

  // Mensagens lançadas pelas funções RPC do Supabase
  if (/INSUFFICIENT_COINS/.test(message)) {
    statusCode = 400;
    message = 'Moedas insuficientes';
  } else if (/ITEM_NOT_FOUND/.test(message)) {
    statusCode = 404;
    message = 'Item não encontrado';
  }

  res.status(statusCode).json({
    message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

export default errorHandler;
