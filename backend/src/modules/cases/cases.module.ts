import { Module } from '@nestjs/common';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { GlobalSearchService } from './global-search.service';
import { AuditModule } from '../audit/audit.module';
import { VisualizationModule } from '../visualization/visualization.module';

@Module({
    imports: [AuditModule, VisualizationModule],
    controllers: [CasesController],
    providers: [CasesService, GlobalSearchService],
    exports: [CasesService],
})
export class CasesModule { }
