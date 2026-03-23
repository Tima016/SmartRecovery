import { Module } from '@nestjs/common';
import { RecoveryService } from './recovery.service';
import { RecoveryController } from './recovery.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { MinioModule } from '../../common/minio/minio.module';

@Module({
    imports: [PrismaModule, AuditModule, MinioModule],
    controllers: [RecoveryController],
    providers: [RecoveryService],
    exports: [RecoveryService],
})
export class RecoveryModule { }
