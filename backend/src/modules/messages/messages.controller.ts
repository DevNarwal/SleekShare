import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MessagesService } from './messages.service';
import { CreateMessageDto, UpdateMessageDto } from './dto/message.dto';

@UseGuards(JwtAuthGuard)
@Controller('expenses/:expenseId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  // Retrieve comments list
  @Get()
  async getMessages(
    @Param('expenseId') expenseId: string,
    @CurrentUser() user: any,
  ) {
    return this.messagesService.getMessages(expenseId, user.id);
  }

  // Create a comment
  @Post()
  async createMessage(
    @Param('expenseId') expenseId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messagesService.createMessage(expenseId, user.id, dto);
  }

  // Edit a comment
  @Patch(':id')
  async updateMessage(
    @Param('expenseId') expenseId: string,
    @Param('id') messageId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.messagesService.updateMessage(expenseId, messageId, user.id, dto);
  }

  // Delete a comment
  @Delete(':id')
  async deleteMessage(
    @Param('expenseId') expenseId: string,
    @Param('id') messageId: string,
    @CurrentUser() user: any,
  ) {
    return this.messagesService.deleteMessage(expenseId, messageId, user.id);
  }
}
