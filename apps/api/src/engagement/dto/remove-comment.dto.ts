import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// Shared by both delete paths on DELETE /reports/:reportId/comments/:id:
// the comment's own author removing it (reason not required, ignored if
// sent) and a MODERATOR/ADMIN hiding someone else's comment (reason
// mandatory — enforced in CommentsService, not here, since whether it's
// required depends on who is calling).
export class RemoveCommentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
