import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content: string;
}

export class UpdateMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content: string;
}
