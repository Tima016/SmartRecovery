import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { MinioModule } from '../minio/minio.module';

@Module({
    imports: [MinioModule],
    controllers: [HealthController],
    providers: [HealthService],
})
export class HealthModule { }
