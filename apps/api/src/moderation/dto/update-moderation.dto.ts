import { PartialType } from '@nestjs/swagger';
import { CreateModerationDto } from './create-moderation.dto.js';

export class UpdateModerationDto extends PartialType(CreateModerationDto) {}
