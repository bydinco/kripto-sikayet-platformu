import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LinkKind } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateEntityLinkDto {
  @ApiProperty({ enum: LinkKind })
  @IsEnum(LinkKind)
  kind!: LinkKind;

  @ApiProperty({ description: 'Must be an http(s) URL — no javascript:, data: or other schemes.' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  handle?: string;
}
