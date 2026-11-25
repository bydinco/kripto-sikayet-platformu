import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCommentDto } from './create-comment.dto.js';

async function validateBody(body: unknown) {
  const dto = plainToInstance(CreateCommentDto, { body });
  return validate(dto);
}

describe('CreateCommentDto', () => {
  it('rejects a body shorter than 2 characters after trimming', async () => {
    const errors = await validateBody('  a  ');
    expect(errors).not.toHaveLength(0);
  });

  it('rejects a body longer than 1000 characters', async () => {
    const errors = await validateBody('a'.repeat(1001));
    expect(errors).not.toHaveLength(0);
  });

  it('accepts a body within range and trims surrounding whitespace', async () => {
    const dto = plainToInstance(CreateCommentDto, { body: '  hello there  ' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.body).toBe('hello there');
  });

  it('accepts a body at exactly the minimum length', async () => {
    const errors = await validateBody('ok');
    expect(errors).toHaveLength(0);
  });

  it('accepts a body at exactly the maximum length', async () => {
    const errors = await validateBody('a'.repeat(1000));
    expect(errors).toHaveLength(0);
  });
});
