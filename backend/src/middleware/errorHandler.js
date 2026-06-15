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

  // Erro de validação do Mongoose
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map((e) => e.message).join('; ');
  }

  // Chave duplicada (ex.: e-mail ou username já existe)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'campo';
    message = `Valor já em uso para o campo: ${field}`;
  }

  // ID do Mongo inválido
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Identificador inválido: ${err.value}`;
  }

  res.status(statusCode).json({
    message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

export default errorHandler;
