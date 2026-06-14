import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum ResolutionAction {
  CREATE_IMPORT_MEMBERSHIP = 'CREATE_IMPORT_MEMBERSHIP',
  IGNORE_PARTICIPANT = 'IGNORE_PARTICIPANT',
}

export class AnomalyResolution {
  @IsString()
  @IsNotEmpty()
  anomalyId: string;

  @IsEnum(ResolutionAction)
  action: ResolutionAction;
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
