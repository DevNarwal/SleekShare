import { Injectable, CanActivate, ExecutionContext, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../modules/prisma/prisma.service';

@Injectable()
export class GroupSlugResolverGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Check if we already resolved the slug in this request
    if (request.__slugResolved) {
      return true;
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const resolveSlug = async (val: string): Promise<string | null> => {
      if (!val || uuidRegex.test(val)) {
        return null;
      }
      const group = await this.prisma.group.findUnique({
        where: { slug: val },
        select: { id: true },
      });
      if (!group) {
        throw new NotFoundException('Group not found');
      }
      return group.id;
    };

    if (request.params.groupId) {
      const resolvedId = await resolveSlug(request.params.groupId);
      if (resolvedId) {
        request.params.groupId = resolvedId;
      }
    }

    if (request.params.id) {
      const resolvedId = await resolveSlug(request.params.id);
      if (resolvedId) {
        request.params.id = resolvedId;
      }
    }

    request.__slugResolved = true;
    return true;
  }
}
