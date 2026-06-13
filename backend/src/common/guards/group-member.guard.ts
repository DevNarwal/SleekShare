import { Injectable, CanActivate, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../modules/prisma/prisma.service';

@Injectable()
export class GroupMemberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      return false;
    }

    const groupId = this.extractGroupId(request);
    if (!groupId) {
      return true;
    }

    // Check if group exists
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // Check active membership
    const now = new Date();
    const membership = await this.prisma.membership.findFirst({
      where: {
        groupId,
        userId: user.id,
        joinedAt: { lte: now },
        OR: [
          { leftAt: null },
          { leftAt: { gte: now } },
        ],
      },
    });

    if (!membership) {
      throw new ForbiddenException('You are not an active member of this group');
    }

    return true;
  }

  private extractGroupId(request: any): string | undefined {
    return request.params.groupId ?? request.params.id;
  }
}
