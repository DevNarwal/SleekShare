import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum ResolutionAction {
  CREATE_IMPORT_MEMBERSHIP = 'CREATE_IMPORT_MEMBERSHIP',
  IGNORE_PARTICIPANT = 'IGNORE_PARTICIPANT',
  MAP_MEMBER = 'MAP_MEMBER',
  ENTER_EXCHANGE_RATE = 'ENTER_EXCHANGE_RATE',
  REMAP_SPLIT_METHOD = 'REMAP_SPLIT_METHOD',
  AUTO_ADJUST_SPLIT = 'AUTO_ADJUST_SPLIT',
  REJECT_AND_CREATE_SETTLEMENT = 'REJECT_AND_CREATE_SETTLEMENT',
}

export class AnomalyResolution {
  @IsString()
  @IsNotEmpty()
  anomalyId: string;

  @IsEnum(ResolutionAction)
  action: ResolutionAction;

  @IsOptional()
  @IsString()
  mappedUserId?: string;

  @IsOptional()
  @IsNumber()
  rate?: number;

  @IsOptional()
  @IsString()
  fromUserId?: string;

  @IsOptional()
  @IsString()
  toUserId?: string;

  @IsOptional()
  @IsNumber()
  amountInr?: number;

  @IsOptional()
  @IsString()
  date?: string;
}

export class ApproveRowDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnomalyResolution)
  resolutions?: AnomalyResolution[];
}

export class RejectRowDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

