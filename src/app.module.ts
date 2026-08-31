import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { SharedModule } from './modules/shared/shared.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AtsModule } from './modules/ats/ats.module.js';
import { HrmsModule } from './modules/hrms/hrms.module.js';
import { CrmModule } from './modules/crm/crm.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SharedModule,
    AuthModule,
    AtsModule,
    HrmsModule,
    CrmModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
