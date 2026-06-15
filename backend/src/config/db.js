import mongoose from 'mongoose';

/**
 * Conecta a aplicação ao MongoDB usando Mongoose.
 * A URI vem da variável de ambiente MONGODB_URI.
 *
 * Em ambiente serverless (Vercel), a conexão é cacheada em escopo de módulo
 * para ser reaproveitada entre invocações "quentes" da função.
 */
let cached = null;

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('❌ MONGODB_URI não definida (arquivo .env ou variáveis da Vercel)');
    if (!process.env.VERCEL) process.exit(1);
    throw new Error('MONGODB_URI não definida');
  }

  // Reaproveita conexão existente (importante na Vercel)
  if (cached && mongoose.connection.readyState === 1) {
    return cached;
  }

  try {
    mongoose.set('strictQuery', true);

    cached = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log(`✅ MongoDB conectado: ${cached.connection.host}/${cached.connection.name}`);

    mongoose.connection.on('error', (err) => {
      console.error('Erro de conexão MongoDB:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB desconectado');
    });

    return cached;
  } catch (err) {
    cached = null;
    console.error('❌ Falha ao conectar no MongoDB:', err.message);
    if (!process.env.VERCEL) process.exit(1);
    throw err;
  }
};

export default connectDB;
