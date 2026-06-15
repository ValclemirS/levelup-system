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
 * Busca todos os usuários com pushToken e dispara a mesma mensagem.
 * Usado pelo cron de lembretes diários.
 */
export async function broadcastPush(UserModel, filter, payload) {
  const users = await UserModel.find({
    ...filter,
    pushToken: { $ne: null },
  }).select('pushToken');

  const tokens = users.map((u) => u.pushToken);
  await sendPush(tokens, payload);
}
