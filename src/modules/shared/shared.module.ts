import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { StageTransitionService } from './pipelines/stage-transition.service.js';
import { StorageModule } from './storage/storage.module.js';
import { QueueModule } from './queue/queue.module.js';

@Module({
  imports: [PrismaModule, StorageModule, QueueModule],
  providers: [StageTransitionService],
  exports: [PrismaModule, StageTransitionService, StorageModule, QueueModule],
})
export class SharedModule {}
