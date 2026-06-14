import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto, UpdateGroupDto, AddMemberDto } from './dto/group.dto';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  // Create group and assign creator as ADMIN
  async createGroup(creatorId: string, dto: CreateGroupDto) {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          name: dto.name,
          icon: dto.icon,
          createdBy: creatorId,
        },
      });

      // Add creator as ADMIN membership
      await tx.membership.create({
        data: {
          groupId: group.id,
          userId: creatorId,
          role: 'admin', // Stored as lowercase, returned as uppercase
          joinedAt: new Date(),
        },
      });

      return group;
    });
  }

  // Get all groups user belongs to
  async getUserGroups(userId: string) {
    const now = new Date();

    // Find groups where the user has an active membership
    const memberships = await this.prisma.membership.findMany({
      where: {
        userId,
        joinedAt: { lte: now },
        OR: [
          { leftAt: null },
          { leftAt: { gte: now } },
        ],
      },
      include: {
        group: {
          include: {
            memberships: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    displayName: true,
                    avatarInitials: true,
                    avatarColor: true,
                  },
                },
              },
            },
            expenses: {
              where: { isDeleted: false },
              select: { amountBaseInr: true },
            },
          },
        },
      },
    });

    return memberships.map((m) => {
      const g = m.group;
      
      // Calculate group volume (sum of expenses only)
      const volume = g.expenses.reduce((sum, exp) => sum + Number(exp.amountBaseInr), 0);
      
      // Filter active memberships for memberCount and active members list
      const activeMemberships = g.memberships.filter(
        (mem) => mem.joinedAt <= now && (mem.leftAt === null || mem.leftAt >= now)
      );

      const members = g.memberships.map((mem) => {
        const isActive = mem.joinedAt <= now && (mem.leftAt === null || mem.leftAt >= now);
        return {
          user: mem.user,
          role: mem.role.toUpperCase(),
          joinedAt: mem.joinedAt,
          leftAt: mem.leftAt,
          status: isActive ? 'ACTIVE' : 'LEFT',
        };
      });

      return {
        id: g.id,
        name: g.name,
        icon: g.icon,
        memberCount: activeMemberships.length,
        volume,
        members,
        createdAt: g.createdAt,
      };
    });
  }

  // Get group details by ID
  async getGroupById(groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                displayName: true,
                avatarInitials: true,
                avatarColor: true,
              },
            },
          },
        },
        expenses: {
          where: { isDeleted: false },
          select: { amountBaseInr: true },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const now = new Date();
    const volume = group.expenses.reduce((sum, exp) => sum + Number(exp.amountBaseInr), 0);
    const activeMemberships = group.memberships.filter(
      (m) => m.joinedAt <= now && (m.leftAt === null || m.leftAt >= now)
    );

    const members = group.memberships.map((m) => {
      const isActive = m.joinedAt <= now && (m.leftAt === null || m.leftAt >= now);
      return {
        user: m.user,
        role: m.role.toUpperCase(),
        joinedAt: m.joinedAt,
        leftAt: m.leftAt,
        status: isActive ? 'ACTIVE' : 'LEFT',
      };
    });

    return {
      id: group.id,
      name: group.name,
      icon: group.icon,
      memberCount: activeMemberships.length,
      volume,
      members,
      createdAt: group.createdAt,
    };
  }

  // Update group details
  async updateGroup(groupId: string, dto: UpdateGroupDto) {
    return this.prisma.group.update({
      where: { id: groupId },
      data: dto,
    });
  }

  // Add a member to a group (Timeline-aware validation)
  async addMember(groupId: string, addedByUserId: string, dto: AddMemberDto) {
    // Verify user to add exists
    const targetUser = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!targetUser) {
      throw new NotFoundException('User to add not found');
    }

    const newJoinedAt = dto.joinedAt ? new Date(dto.joinedAt) : new Date();

    // Check existing memberships to prevent overlaps
    const existing = await this.prisma.membership.findMany({
      where: { groupId, userId: dto.userId },
    });

    for (const m of existing) {
      if (m.leftAt === null) {
        throw new BadRequestException('User is already an active member of this group');
      }
      if (newJoinedAt <= m.leftAt || newJoinedAt <= m.joinedAt) {
        throw new BadRequestException('New membership timeline overlaps with an existing membership period');
      }
    }

    const membership = await this.prisma.membership.create({
      data: {
        groupId,
        userId: dto.userId,
        role: 'member',
        joinedAt: newJoinedAt,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarInitials: true,
            avatarColor: true,
          },
        },
      },
    });

    const result = {
      id: membership.id,
      groupId: membership.groupId,
      userId: membership.userId,
      role: membership.role.toUpperCase(),
      joinedAt: membership.joinedAt,
      leftAt: membership.leftAt,
      status: 'ACTIVE',
      user: membership.user,
    };

    this.eventsGateway.emitToRoom(`group:${groupId}`, 'member.joined', { groupId, membership: result });

    return result;
  }

  // Remove member from group (sets leftAt timestamp)
  async removeMember(groupId: string, userId: string, leftAtInput?: string) {
    const activeMembership = await this.prisma.membership.findFirst({
      where: {
        groupId,
        userId,
        leftAt: null,
      },
    });

    if (!activeMembership) {
      throw new BadRequestException('User is not an active member of this group');
    }

    const leftAt = leftAtInput ? new Date(leftAtInput) : new Date();
    if (leftAt < activeMembership.joinedAt) {
      throw new BadRequestException('Leaving date cannot be before join date');
    }

    const updated = await this.prisma.membership.update({
      where: { id: activeMembership.id },
      data: { leftAt },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    });

    const result = {
      id: updated.id,
      groupId: updated.groupId,
      userId: updated.userId,
      role: updated.role.toUpperCase(),
      joinedAt: updated.joinedAt,
      leftAt: updated.leftAt,
      status: 'LEFT',
      user: updated.user,
    };

    this.eventsGateway.emitToRoom(`group:${groupId}`, 'member.left', { groupId, userId });

    return result;
  }

  // List group members
  async listMembers(groupId: string) {
    const list = await this.prisma.membership.findMany({
      where: { groupId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarInitials: true,
            avatarColor: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const now = new Date();
    return list.map((m) => {
      const isActive = m.joinedAt <= now && (m.leftAt === null || m.leftAt >= now);
      return {
        user: m.user,
        role: m.role.toUpperCase(),
        joinedAt: m.joinedAt,
        leftAt: m.leftAt,
        status: isActive ? 'ACTIVE' : 'LEFT',
      };
    });
  }

  // Get current user's membership details
  async getMyMembership(groupId: string, userId: string) {
    const now = new Date();
    const membership = await this.prisma.membership.findFirst({
      where: {
        groupId,
        userId,
        // Match active, or default to the most recent one
      },
      orderBy: { joinedAt: 'desc' },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    const isActive = membership.joinedAt <= now && (membership.leftAt === null || membership.leftAt >= now);

    return {
      membershipId: membership.id,
      role: membership.role.toUpperCase(),
      joinedAt: membership.joinedAt,
      leftAt: membership.leftAt,
      status: isActive ? 'ACTIVE' : 'LEFT',
    };
  }

  // Get group audit logs
  async getGroupAuditLogs(groupId: string) {
    return this.prisma.auditLog.findMany({
      where: { groupId },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarInitials: true,
            avatarColor: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
