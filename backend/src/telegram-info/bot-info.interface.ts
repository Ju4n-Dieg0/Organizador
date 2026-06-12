/**
 * Puerta de entrada abstracta a la información del bot de Telegram.
 * BotInfoService depende de esta interfaz, nunca de Telegraf.
 */
export interface BotInfoProvider {
  getBotUsername(): Promise<string | null>;
}
