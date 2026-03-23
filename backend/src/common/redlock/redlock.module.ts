import { Module, Global } from '@nestjs/common';
import { RedlockService } from './redlock.service';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
    imports: [RedisModule],
    providers: [RedlockService],
    exports: [RedlockService],
})
export class RedlockModule { }
