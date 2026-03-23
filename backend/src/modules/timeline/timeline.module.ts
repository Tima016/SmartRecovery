import { Module } from '@nestjs/common';
import { TimelineController } from './timeline.controller';
import { TimelineService } from './timeline.service';
import { DetectionService } from './detection.service';

@Module({
    controllers: [TimelineController],
    providers: [TimelineService, DetectionService],
    exports: [TimelineService, DetectionService],
})
export class TimelineModule { }
