import { Module } from '@nestjs/common';
import { FileSystemService } from './filesystem.service';
import { FileSystemController } from './filesystem.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { MinioModule } from '../../common/minio/minio.module';

@Module({
    imports: [PrismaModule, MinioModule],
    controllers: [FileSystemController],
    providers: [FileSystemService],
    exports: [FileSystemService],
})
export class FileSystemModule { }
