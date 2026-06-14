import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto, UpdateExpenseDto } from './dto/expense.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GroupMemberGuard } from '../../common/guards/group-member.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('groups/:groupId/expenses')
@UseGuards(JwtAuthGuard, GroupMemberGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  async createExpense(
    @Param('groupId') groupId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expensesService.createExpense(groupId, user.id, dto);
  }

  @Get()
  async getExpenses(
    @Param('groupId') groupId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('member') member?: string,
    @Query('flags') flagsString?: string,
    @Query('month') month?: string,
  ) {
    const flags = flagsString ? flagsString.split(',') : undefined;
    return this.expensesService.getExpenses(groupId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      member,
      flags,
      month,
    });
  }

  @Get(':id')
  async getExpenseById(
    @Param('id') id: string,
  ) {
    return this.expensesService.getExpenseById(id);
  }

  @Patch(':id')
  async updateExpense(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.updateExpense(id, user.id, dto);
  }

  @Delete(':id')
  async deleteExpense(
    @Param('id') id: string,
  ) {
    return this.expensesService.deleteExpense(id);
  }
}
