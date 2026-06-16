import { Expo } from 'expo-server-sdk';

const expo = new Expo();

/**
 * Envia uma notificação push para um ou mais tokens.
 *
 * @param {string|string[]} tokens  - ExpoPushToken(s)
 * @param {object} payload          - { title, body, data }
 */
export async function sendPush(tokens, { title, body, data = {} }) {
  const list = (Array.isArray(tokens) ? tokens : [tokens]).filter(
    (t) => t && Expo.isExpoPushToken(t)
  );

  if (list.length === 0) return;

  const messages = list.map((to) => ({
    to,
    sound: 'default',
    title,
    body,
    data,
  }));

  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);

      // Log de erros por ticket (sem derrubar a requisição original)
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'error') {
          console.error(`[Push] Erro no envio para ${chunk[i].to}:`, ticket.message);
        }
      });
    } catch (err) {
      console.error('[Push] Falha no chunk:', err.message);
    }
  }
}

/**
 * Dispara a mesma mensagem para uma lista de Expo Push Tokens.
 * A seleção de quais usuários notificar é feita por quem chama
 * (ver os crons em server.js), mantendo este util desacoplado do banco.
 *
 * @param {string[]} tokens
 * @param {object} payload - { title, body, data }
 */
export async function broadcastPush(tokens, payload) {
  await sendPush(tokens || [], payload);
}
