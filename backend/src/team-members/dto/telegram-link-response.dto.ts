export class TelegramLinkResponseDto {
  /** Deep link https://t.me/<bot_username>?start=<token> */
  link: string;
  /** Expiración del token en ISO 8601. */
  expiresAt: string;
}
