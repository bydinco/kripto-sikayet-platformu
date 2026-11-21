import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NoticeType } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateNoticeDto {
  @ApiProperty({ enum: NoticeType })
  @IsEnum(NoticeType)
  type!: NoticeType;

  @ApiProperty()
  @IsString()
  submitterName!: string;

  @ApiProperty()
  @IsEmail()
  submitterEmail!: string;

  @ApiProperty()
  @IsString()
  claim!: string;

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
  entityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalBasis?: string;
}
