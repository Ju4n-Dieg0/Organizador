import { Injectable } from '@nestjs/common';
import { BotInfoProvider } from './bot-info.interface';

/**
 * Holder de la información del bot. El módulo de Telegram se registra como
 * proveedor al iniciar (mismo patrón registry que NotificationsService.setSender).
 * Si el bot está desactivado no hay proveedor y getBotUsername() devuelve null.
 */
@Injectable()
export class BotInfoService {
  private provider: BotInfoProvider | null = null;

  setProvider(provider: BotInfoProvider): void {
    this.provider = provider;
  }

  async getBotUsername(): Promise<string | null> {
    if (!this.provider) {
      return null;
    }
    return this.provider.getBotUsername();
  }
}
