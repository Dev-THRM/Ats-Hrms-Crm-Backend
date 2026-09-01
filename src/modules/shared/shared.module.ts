import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { StageTransitionService } from './pipelines/stage-transition.service.js';
import { StorageModule } from './storage/storage.module.js';

@Module({
  imports: [PrismaModule, StorageModule],
  providers: [StageTransitionService],
  exports: [PrismaModule, StageTransitionService, StorageModule],
})
export class SharedModule {}
