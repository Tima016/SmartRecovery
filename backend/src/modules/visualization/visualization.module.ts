import { Module } from '@nestjs/common';
import { HeatmapService } from './heatmap.service';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    providers: [HeatmapService],
    exports: [HeatmapService],
})
export class VisualizationModule { }
