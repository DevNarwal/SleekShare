import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { EventsModule } from '../events/events.module';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';

@Module({
  imports: [PrismaModule, LedgerModule, EventsModule],
  controllers: [ImportController],
  providers: [ImportService],
  exports: [ImportService],
})
export class ImportModule {}
