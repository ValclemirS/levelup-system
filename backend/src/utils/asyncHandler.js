/**
 * Envolve um controller async e encaminha qualquer erro
 * para o middleware de erro central, evitando try/catch repetido.
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export default asyncHandler;
