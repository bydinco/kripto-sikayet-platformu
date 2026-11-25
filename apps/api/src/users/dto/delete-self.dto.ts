import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DeleteSelfDto {
  @ApiProperty({ description: 'Current password, required to confirm self-deletion.' })
  @IsString()
  password!: string;
}
