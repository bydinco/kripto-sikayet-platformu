import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModerationAction } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

// Maps to ModerationLog: records a moderator's decision on a report or
// post. moderatorId is deliberately NOT a field here — it always comes
// from the caller's own JWT (@CurrentUser()), never from the request
// body, so a MODERATOR can't attribute a log entry to someone else.
export class CreateModerationDto {
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
