import { PartialType } from '@nestjs/swagger';
import { CreateEvidenceDto } from './create-evidence.dto.js';

export class UpdateEvidenceDto extends PartialType(CreateEvidenceDto) {}
