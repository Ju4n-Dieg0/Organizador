/**
 * Puerta de salida abstracta hacia Telegram.
 * NotificationsService depende de esta interfaz, nunca de Telegraf.
 */
export interface TelegramSender {
  sendMessage(chatId: string, html: string): Promise<void>;
}
