import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { StageTransitionService } from './pipelines/stage-transition.service.js';

@Module({
  imports: [PrismaModule],
  providers: [StageTransitionService],
  exports: [PrismaModule, StageTransitionService],
})
export class SharedModule {}
