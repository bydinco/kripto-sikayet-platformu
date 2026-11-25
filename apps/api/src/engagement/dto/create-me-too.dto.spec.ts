import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMeTooDto } from './create-me-too.dto.js';

describe('CreateMeTooDto', () => {
  it('accepts a missing body', async () => {
    const dto = plainToInstance(CreateMeTooDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts an empty string body', async () => {
    const dto = plainToInstance(CreateMeTooDto, { body: '' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a body longer than 500 characters', async () => {
    const dto = plainToInstance(CreateMeTooDto, { body: 'a'.repeat(501) });
    const errors = await validate(dto);
    expect(errors).not.toHaveLength(0);
  });

  it('accepts a body at exactly 500 characters and trims it', async () => {
    const dto = plainToInstance(CreateMeTooDto, { body: `  ${'a'.repeat(500)}  ` });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.body).toBe('a'.repeat(500));
  });
});
