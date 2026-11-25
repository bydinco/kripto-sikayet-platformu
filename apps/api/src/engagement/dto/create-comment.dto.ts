import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { COMMENT_BODY_MAX_LENGTH, COMMENT_BODY_MIN_LENGTH } from '../engagement.constants.js';

export class CreateCommentDto {
  @ApiProperty({ minLength: COMMENT_BODY_MIN_LENGTH, maxLength: COMMENT_BODY_MAX_LENGTH })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(COMMENT_BODY_MIN_LENGTH, COMMENT_BODY_MAX_LENGTH)
  body!: string;
}
