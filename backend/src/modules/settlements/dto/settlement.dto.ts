import { IsNotEmpty, IsString, IsNumber, IsOptional, IsUUID, Min, IsDateString } from 'class-validator';

export class CreateSettlementDto {
  @IsUUID('4', { message: 'Invalid sender User ID' })
  @IsNotEmpty({ message: 'Sender User ID (fromUserId) is required' })
  fromUserId: string;

  @IsUUID('4', { message: 'Invalid receiver User ID' })
  @IsNotEmpty({ message: 'Receiver User ID (toUserId) is required' })
  toUserId: string;

  @IsNumber({}, { message: 'amountInr must be a number' })
  @Min(0.01, { message: 'Settlement amount must be greater than 0' })
  amountInr: number;

  @IsDateString({}, { message: 'Invalid settlementDate ISO date string' })
  @IsNotEmpty({ message: 'Settlement date is required' })
  settlementDate: string;

  @IsString()
  @IsOptional()
  note?: string;
}

export class UpdateSettlementDto {
  @IsUUID('4')
  @IsOptional()
  fromUserId?: string;

  @IsUUID('4')
  @IsOptional()
  toUserId?: string;

  @IsNumber()
  @Min(0.01)
  @IsOptional()
  amountInr?: number;

  @IsDateString()
  @IsOptional()
  settlementDate?: string;

  @IsString()
  @IsOptional()
  note?: string;
}
