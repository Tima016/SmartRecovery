import { Module } from '@nestjs/common';
import { EvidenceController } from './evidence.controller';
import { EvidenceListController } from './evidence-list.controller';
import { EvidenceService } from './evidence.service';
import { CustodyModule } from '../custody/custody.module';

@Module({
    imports: [CustodyModule],
    controllers: [EvidenceController, EvidenceListController],
    providers: [EvidenceService],
    exports: [EvidenceService],
})
export class EvidenceModule { }
