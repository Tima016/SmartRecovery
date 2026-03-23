import { Module } from '@nestjs/common';
import { ImagingController } from './imaging.controller';
import { ImagingService } from './imaging.service';
import { AuditModule } from '../audit/audit.module';
import { RedlockModule } from '../../common/redlock/redlock.module';

@Module({
    imports: [AuditModule, RedlockModule],
    controllers: [ImagingController],
    providers: [ImagingService],
    exports: [ImagingService],
})
export class ImagingModule { }

