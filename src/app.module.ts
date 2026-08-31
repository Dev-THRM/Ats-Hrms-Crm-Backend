import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { SharedModule } from './modules/shared/shared.module.js';
import { AtsModule } from './modules/ats/ats.module.js';
import { HrmsModule } from './modules/hrms/hrms.module.js';
import { CrmModule } from './modules/crm/crm.module.js';

@Module({
  imports: [SharedModule, AtsModule, HrmsModule, CrmModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
