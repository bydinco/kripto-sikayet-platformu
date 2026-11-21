import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateResponseDto {
  @ApiProperty()
  @IsString()
  body!: string;

  @ApiPropertyOptional({ description: 'Marks the report as contested by the brand.' })
  @IsOptional()
  @IsBoolean()
  isDispute?: boolean;
}
