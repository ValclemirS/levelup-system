// Ponto de entrada serverless da Vercel.
// Reexporta o app Express definido em server.js. A Vercel detecta arquivos
// em /api automaticamente como funções; o rewrite em vercel.json encaminha
// todas as rotas para cá, preservando o caminho original em req.url.
import app from '../server.js';

export default app;
