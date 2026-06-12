import { Module } from '@nestjs/common';
import { BotInfoService } from './bot-info.service';

@Module({
  providers: [BotInfoService],
  exports: [BotInfoService],
})
export class TelegramInfoModule {}
