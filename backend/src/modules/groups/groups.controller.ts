import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import * as express from 'express';
import { GroupsService } from './groups.service';
import { CreateGroupDto, UpdateGroupDto, AddMemberDto } from './dto/group.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GroupMemberGuard } from '../../common/guards/group-member.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  async createGroup(
    @CurrentUser() user: any,
    @Body() dto: CreateGroupDto,
  ) {
    return this.groupsService.createGroup(user.id, dto);
  }

  @Get()
  async getUserGroups(
    @CurrentUser() user: any,
  ) {
    return this.groupsService.getUserGroups(user.id);
  }

  @Get(':id')
  @UseGuards(GroupMemberGuard)
  async getGroupById(
    @Param('id') id: string,
  ) {
    return this.groupsService.getGroupById(id);
  }

  @Patch(':id')
  @UseGuards(GroupMemberGuard)
  async updateGroup(
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupsService.updateGroup(id, dto);
  }

  @Get(':id/members')
  @UseGuards(GroupMemberGuard)
  async listMembers(
    @Param('id') id: string,
  ) {
    return this.groupsService.listMembers(id);
  }

  @Post(':id/members')
  @UseGuards(GroupMemberGuard)
  async addMember(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: AddMemberDto,
  ) {
    return this.groupsService.addMember(id, user.id, dto);
  }

  @Delete(':id/members/:userId')
  @UseGuards(GroupMemberGuard)
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body('leftAt') leftAt?: string,
  ) {
    return this.groupsService.removeMember(id, userId, leftAt);
  }

  // Retrieve my membership info (does not use GroupMemberGuard, so past members can also retrieve their info)
  @Get(':id/me')
  async getMyMembership(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.groupsService.getMyMembership(id, user.id);
  }
}
