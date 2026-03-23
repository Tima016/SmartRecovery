import { Module } from '@nestjs/common';
import { CorrelationService } from './correlation.service';
import { CorrelationController } from './correlation.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [CorrelationController],
    providers: [CorrelationService],
    exports: [CorrelationService],
})
export class CorrelationModule { }
