import { Module } from '@nestjs/common';
import { ArtifactsController } from './artifacts.controller';
import { ArtifactsService } from './artifacts.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { MinioModule } from '../../common/minio/minio.module';

@Module({
    imports: [PrismaModule, AuditModule, MinioModule],
    controllers: [ArtifactsController],
    providers: [ArtifactsService],
    exports: [ArtifactsService],
})
export class ArtifactsModule { }
