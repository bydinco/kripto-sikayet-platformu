import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModerationAction } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

// Maps to ModerationLog: records a moderator's decision on a report or post.
export class CreateModerationDto {
  @ApiProperty()
  @IsString()
  moderatorId!: string;

  @ApiProperty({ enum: ModerationAction })
  @IsEnum(ModerationAction)
  action!: ModerationAction;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reportId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
