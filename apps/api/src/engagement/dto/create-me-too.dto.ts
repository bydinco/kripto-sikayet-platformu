import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ME_TOO_BODY_MAX_LENGTH } from '../engagement.constants.js';

export class CreateMeTooDto {
  @ApiPropertyOptional({ maxLength: ME_TOO_BODY_MAX_LENGTH, description: 'Optional, may be empty.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(ME_TOO_BODY_MAX_LENGTH)
  body?: string;
}
