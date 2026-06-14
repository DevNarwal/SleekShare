import { Controller, Get, Post, Query, Param, UseGuards, ForbiddenException } from '@nestjs/common';
import { BalancesService } from './balances.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GroupMemberGuard } from '../../common/guards/group-member.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('groups/:groupId/balances')
@UseGuards(JwtAuthGuard, GroupMemberGuard)
export class BalancesController {
  constructor(
    private readonly balancesService: BalancesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('raw')
  async getRawBalances(
    @Param('groupId') groupId: string,
  ) {
    return this.balancesService.calculateRawBalances(groupId);
  }

  @Get('summary')
  async getBalancesSummary(
    @Param('groupId') groupId: string,
  ) {
    return this.balancesService.getBalancesSummary(groupId);
  }

  @Get('simplified')
  async getSimplifiedBalances(
    @Param('groupId') groupId: string,
  ) {
    return this.balancesService.simplifyDebts(groupId);
  }

  @Get('explain')
  async explainBalance(
    @Param('groupId') groupId: string,
    @Query('userId') userId: string,
    @Query('targetUserId') targetUserId: string,
  ) {
    return this.balancesService.explainBalance(groupId, userId, targetUserId);
  }

  // Admin-only rebuild ledger endpoint
  @Post('rebuild-ledger')
  async rebuildLedger(
    @Param('groupId') groupId: string,
    @CurrentUser() user: any,
  ) {
    // Verify user is an active group admin
    const membership = await this.prisma.membership.findFirst({
      where: {
        groupId,
        userId: user.id,
        leftAt: null,
      },
    });

    if (!membership || membership.role !== 'admin') {
      throw new ForbiddenException('Only group administrators can trigger ledger rebuilds');
    }

    return this.balancesService.rebuildLedger(groupId);
  }
}
