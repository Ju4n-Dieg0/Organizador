/**
 * Puerta de salida abstracta hacia Telegram.
 * NotificationsService depende de esta interfaz, nunca de Telegraf.
 */
export interface TelegramSendOptions {
  /** Filas de botones inline (callback data, p. ej. `req:approve:<id>`). */
  inlineKeyboard?: { text: string; callbackData: string }[][];
}

export interface TelegramSender {
  sendMessage(
    chatId: string,
    html: string,
    options?: TelegramSendOptions,
  ): Promise<void>;
}
