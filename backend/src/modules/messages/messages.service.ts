import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { CreateMessageDto, UpdateMessageDto } from './dto/message.dto';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  // Verify group membership of the user for the group containing the expense
  private async verifyGroupMembership(expenseId: string, userId: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId, isDeleted: false },
      select: { groupId: true },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    const membership = await this.prisma.membership.findFirst({
      where: { groupId: expense.groupId, userId },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of the group containing this expense');
    }

    return expense.groupId;
  }

  // Retrieve comments list
  async getMessages(expenseId: string, userId: string) {
    await this.verifyGroupMembership(expenseId, userId);

    return this.prisma.message.findMany({
      where: { expenseId, isDeleted: false },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarInitials: true,
            avatarColor: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Post a new comment
  async createMessage(expenseId: string, authorId: string, dto: CreateMessageDto) {
    await this.verifyGroupMembership(expenseId, authorId);

    const message = await this.prisma.message.create({
      data: {
        expenseId,
        authorId,
        content: dto.content,
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarInitials: true,
            avatarColor: true,
          },
        },
      },
    });

    // Real-time broadcast
    this.eventsGateway.emitToRoom(`expense:${expenseId}`, 'message.created', message);

    return message;
  }

  // Edit a comment
  async updateMessage(expenseId: string, messageId: string, userId: string, dto: UpdateMessageDto) {
    await this.verifyGroupMembership(expenseId, userId);

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, expenseId, isDeleted: false },
    });

    if (!message) {
      throw new NotFoundException('Comment not found');
    }

    if (message.authorId !== userId) {
      throw new ForbiddenException('You are not authorized to edit this comment');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: dto.content },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarInitials: true,
            avatarColor: true,
          },
        },
      },
    });

    // Real-time broadcast
    this.eventsGateway.emitToRoom(`expense:${expenseId}`, 'message.updated', updated);

    return updated;
  }

  // Soft-delete a comment
  async deleteMessage(expenseId: string, messageId: string, userId: string) {
    const groupId = await this.verifyGroupMembership(expenseId, userId);

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, expenseId, isDeleted: false },
    });

    if (!message) {
      throw new NotFoundException('Comment not found');
    }

    // Verify role (admin or author can delete)
    const userMembership = await this.prisma.membership.findFirst({
      where: { groupId, userId },
      select: { role: true },
    });

    const isAdmin = userMembership?.role === 'admin';
    if (message.authorId !== userId && !isAdmin) {
      throw new ForbiddenException('You are not authorized to delete this comment');
    }

    const deleted = await this.prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true },
    });

    // Real-time broadcast
    this.eventsGateway.emitToRoom(`expense:${expenseId}`, 'message.deleted', { messageId });

    return deleted;
  }
}
