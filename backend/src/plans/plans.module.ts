import { Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { PlansMapper } from './plans.mapper';
import { PlansRepository } from './plans.repository';
import { PlansService } from './plans.service';

@Module({
  controllers: [PlansController],
  providers: [PlansService, PlansRepository, PlansMapper],
  exports: [PlansService],
})
export class PlansModule {}
