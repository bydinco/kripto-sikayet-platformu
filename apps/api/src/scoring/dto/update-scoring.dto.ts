import { PartialType } from '@nestjs/swagger';
import { CreateScoringDto } from './create-scoring.dto.js';

export class UpdateScoringDto extends PartialType(CreateScoringDto) {}
