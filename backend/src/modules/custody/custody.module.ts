import { Module } from '@nestjs/common';
import { CustodyController } from './custody.controller';
import { CustodyService } from './custody.service';
import { AuditModule } from '../audit/audit.module';
import { RedlockModule } from '../../common/redlock/redlock.module';

@Module({
    imports: [AuditModule, RedlockModule],
    controllers: [CustodyController],
    providers: [CustodyService],
    exports: [CustodyService],
})
export class CustodyModule { }

