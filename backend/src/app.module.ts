import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { GroupsModule } from './modules/groups/groups.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { SettlementsModule } from './modules/settlements/settlements.module';
import { BalancesModule } from './modules/balances/balances.module';
import { EventsModule } from './modules/events/events.module';
import { ImportModule } from './modules/import/import.module';
import { MessagesModule } from './modules/messages/messages.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    GroupsModule,
    LedgerModule,
    ExpensesModule,
    SettlementsModule,
    BalancesModule,
    EventsModule,
    ImportModule,
    MessagesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
