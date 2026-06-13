import { IsNotEmpty, IsString, IsOptional, IsUUID, IsDateString } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty({ message: 'Group name is required' })
  name: string;

  @IsString()
  @IsOptional()
  icon?: string;
}

export class UpdateGroupDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  icon?: string;
}

export class AddMemberDto {
  @IsUUID('4', { message: 'Invalid User ID format' })
  @IsNotEmpty({ message: 'User ID is required' })
  userId: string;

  @IsDateString({}, { message: 'Invalid joinedAt ISO date string' })
  @IsOptional()
  joinedAt?: string;
}
