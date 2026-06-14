import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { SettlementsService } from './settlements.service';
import { CreateSettlementDto, UpdateSettlementDto } from './dto/settlement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GroupMemberGuard } from '../../common/guards/group-member.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('groups/:groupId/settlements')
@UseGuards(JwtAuthGuard, GroupMemberGuard)
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Post()
  async createSettlement(
    @Param('groupId') groupId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateSettlementDto,
  ) {
    return this.settlementsService.createSettlement(groupId, user.id, dto);
  }

  @Get()
  async getSettlements(
    @Param('groupId') groupId: string,
  ) {
    return this.settlementsService.getSettlements(groupId);
  }

  @Get(':id')
  async getSettlementById(
    @Param('id') id: string,
  ) {
    return this.settlementsService.getSettlementById(id);
  }

  @Patch(':id')
  async updateSettlement(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateSettlementDto,
  ) {
    return this.settlementsService.updateSettlement(id, user.id, dto);
  }

  @Delete(':id')
  async deleteSettlement(
    @Param('id') id: string,
  ) {
    return this.settlementsService.deleteSettlement(id);
  }
}
