import { ApiPropertyOptional } from '@nestjs/swagger';
import { NoticeStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

// Deliberately NOT PartialType(CreateNoticeDto): a notice's own content
// (type, submitter, claim, subject) is set once by whoever filed it and is
// never edited afterwards. The only thing a moderator/admin PATCHes in is
// their decision; `decidedAt`/`handlerId` are computed server-side in
// NoticesService, never accepted from the client.
export class UpdateNoticeDto {
  @ApiPropertyOptional({ enum: NoticeStatus })
  @IsOptional()
  @IsEnum(NoticeStatus)
  status?: NoticeStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  decision?: string;
}
