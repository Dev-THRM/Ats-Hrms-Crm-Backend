import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

export const RESUME_QUEUE = 'resume-processing';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL') || 'redis://localhost:6379';
        const url = new URL(redisUrl);

        return {
          connection: {
            host: url.hostname,
            port: parseInt(url.port || '6379', 10),
            username: url.username ? decodeURIComponent(url.username) : undefined,
            password: url.password ? decodeURIComponent(url.password) : undefined,
            tls: url.protocol === 'rediss:' ? {} : undefined,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
          },
        };
      },
    }),
    BullModule.registerQueue({
      name: RESUME_QUEUE,
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
