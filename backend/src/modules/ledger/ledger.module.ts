import { Module } from '@nestjs/common';
import { LedgerSyncService } from './ledger-sync.service';

@Module({
  providers: [LedgerSyncService],
  exports: [LedgerSyncService],
})
export class LedgerModule {}
