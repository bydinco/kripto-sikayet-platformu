import { PartialType } from '@nestjs/swagger';
import { CreateEntityDto } from './create-entity.dto.js';

export class UpdateEntityDto extends PartialType(CreateEntityDto) {}
