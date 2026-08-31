import { Module } from '@nestjs/common';
import { AtsController } from './ats.controller.js';

@Module({
  controllers: [AtsController],
})
export class AtsModule {}
