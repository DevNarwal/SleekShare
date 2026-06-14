import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // Authenticate socket on connection
  async handleConnection(client: Socket) {
    let token = client.handshake.query?.token as string;
    
    if (!token && client.handshake.headers?.authorization) {
      const parts = client.handshake.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      console.log('[EventsGateway] Disconnecting socket: No token provided');
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
      client.data = { userId: payload.sub };
      console.log(`[EventsGateway] Socket connected: ${client.id} (user: ${payload.sub})`);
    } catch (err) {
      console.log('[EventsGateway] Disconnecting socket: Invalid JWT token');
      client.disconnect(true);
    }
  }

  // Handle socket disconnects
  handleDisconnect(client: Socket) {
    console.log(`[EventsGateway] Socket disconnected: ${client.id}`);
  }

  // Allow users to subscribe to group events
  @SubscribeMessage('joinGroup')
  async handleJoinGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody('groupId') groupId: string,
  ) {
    if (!groupId) return;

    // Security: verify if the user belongs to the group
    const membership = await this.prisma.membership.findFirst({
      where: { groupId, userId: client.data.userId },
    });

    if (!membership) {
      client.emit('error', { message: 'Unauthorized room access' });
      return;
    }

    client.join(`group:${groupId}`);
    console.log(`[EventsGateway] Client ${client.id} (user: ${client.data.userId}) joined room group:${groupId}`);
    client.emit('joinedRoom', { room: `group:${groupId}` });
  }

  // Leave group room
  @SubscribeMessage('leaveGroup')
  handleLeaveGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody('groupId') groupId: string,
  ) {
    if (!groupId) return;
    client.leave(`group:${groupId}`);
    console.log(`[EventsGateway] Client ${client.id} left room group:${groupId}`);
    client.emit('leftRoom', { room: `group:${groupId}` });
  }

  // Allow users to subscribe to expense comment thread
  @SubscribeMessage('joinExpense')
  async handleJoinExpense(
    @ConnectedSocket() client: Socket,
    @MessageBody('expenseId') expenseId: string,
  ) {
    if (!expenseId) return;

    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
      select: { groupId: true },
    });

    if (!expense) {
      client.emit('error', { message: 'Expense not found' });
      return;
    }

    // Security: verify group membership
    const membership = await this.prisma.membership.findFirst({
      where: { groupId: expense.groupId, userId: client.data.userId },
    });

    if (!membership) {
      client.emit('error', { message: 'Unauthorized room access' });
      return;
    }

    client.join(`expense:${expenseId}`);
    console.log(`[EventsGateway] Client ${client.id} joined room expense:${expenseId}`);
    client.emit('joinedRoom', { room: `expense:${expenseId}` });
  }

  // Leave expense comment thread room
  @SubscribeMessage('leaveExpense')
  handleLeaveExpense(
    @ConnectedSocket() client: Socket,
    @MessageBody('expenseId') expenseId: string,
  ) {
    if (!expenseId) return;
    client.leave(`expense:${expenseId}`);
    console.log(`[EventsGateway] Client ${client.id} left room expense:${expenseId}`);
    client.emit('leftRoom', { room: `expense:${expenseId}` });
  }

  // Handle real-time typing indicators in comment thread
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { expenseId: string; isTyping: boolean },
  ) {
    const { expenseId, isTyping } = data;
    if (!expenseId) return;

    const user = await this.prisma.user.findUnique({
      where: { id: client.data.userId },
      select: { displayName: true },
    });

    // Broadcast to other users in the expense room
    client.to(`expense:${expenseId}`).emit('typing', {
      userId: client.data.userId,
      displayName: user?.displayName || 'Someone',
      isTyping,
    });
  }

  // Direct programmatic broadcast utility
  emitToRoom(room: string, event: string, payload: any) {
    if (this.server) {
      this.server.to(room).emit(event, payload);
    }
  }
}
