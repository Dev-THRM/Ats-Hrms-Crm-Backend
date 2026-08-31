import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  exports: [PrismaModule],
})
export class SharedModule {}
