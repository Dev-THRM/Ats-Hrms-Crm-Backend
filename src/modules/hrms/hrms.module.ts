import { Module } from '@nestjs/common';
import { HrmsController } from './hrms.controller.js';

@Module({
  controllers: [HrmsController],
})
export class HrmsModule {}
