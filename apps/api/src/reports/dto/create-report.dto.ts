import { ApiProperty } from '@nestjs/swagger';
import { ReportCategory } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class CreateReportDto {
  @ApiProperty()
  @IsString()
  entityId!: string;

  @ApiProperty()
  @IsString()
  authorId!: string;

  @ApiProperty({ enum: ReportCategory })
  @IsEnum(ReportCategory)
  category!: ReportCategory;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsString()
  body!: string;
}
