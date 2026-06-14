import { IsNotEmpty, IsString, IsNumber, IsOptional, IsUUID, IsEnum, IsArray, ValidateNested, Min, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export enum SplitMethod {
  EQUAL = 'equal',
  UNEQUAL = 'unequal',
  PERCENTAGE = 'percentage',
  SHARE = 'share',
}

export class ParticipantDto {
  @IsString({ message: 'Invalid participant user ID format' })
  @IsNotEmpty({ message: 'Participant user ID is required' })
  userId: string;

  @IsNumber({}, { message: 'shareAmount must be a number' })
  @Min(0, { message: 'shareAmount cannot be negative' })
  @IsOptional()
  shareAmount?: number;

  @IsNumber({}, { message: 'shareUnits must be a number' })
  @Min(0, { message: 'shareUnits cannot be negative' })
  @IsOptional()
  shareUnits?: number;
}

export class CreateExpenseDto {
  @IsString()
  @IsNotEmpty({ message: 'Description is required' })
  description: string;

  @IsNumber({}, { message: 'amountOriginal must be a number' })
  @Min(0.01, { message: 'Original amount must be greater than 0' })
  amountOriginal: number;

  @IsString()
  @IsNotEmpty({ message: 'Currency code is required' })
  currencyCode: string;

  @IsNumber({}, { message: 'exchangeRate must be a number' })
  @Min(0.000001, { message: 'Exchange rate must be greater than 0' })
  @IsOptional()
  exchangeRate?: number;

  @IsString({ message: 'Invalid paidBy user ID' })
  @IsNotEmpty({ message: 'Paid by is required' })
  paidBy: string;

  @IsDateString({}, { message: 'Invalid expenseDate date string' })
  @IsNotEmpty({ message: 'Expense date is required' })
  expenseDate: string;

  @IsEnum(SplitMethod, { message: 'Invalid split method' })
  @IsNotEmpty({ message: 'Split method is required' })
  splitMethod: SplitMethod;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantDto)
  @IsNotEmpty({ message: 'Participants are required' })
  participants: ParticipantDto[];
}

export class UpdateExpenseDto {
  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0.01)
  @IsOptional()
  amountOriginal?: number;

  @IsString()
  @IsOptional()
  currencyCode?: string;

  @IsNumber()
  @Min(0.000001)
  @IsOptional()
  exchangeRate?: number;

  @IsString()
  @IsOptional()
  paidBy?: string;

  @IsDateString()
  @IsOptional()
  expenseDate?: string;

  @IsEnum(SplitMethod)
  @IsOptional()
  splitMethod?: SplitMethod;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantDto)
  @IsOptional()
  participants?: ParticipantDto[];
}
