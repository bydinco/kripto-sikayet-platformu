import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { EvidenceType } from '@prisma/client';

// `value` means different things per EvidenceType (a free-form TX hash or
// wallet address vs. a link that must be safe to render as <a href>).
// class-validator's @ValidateIf gates ALL validators on a property, so it
// can't express "string normally, but strictly http(s) URL when type is
// LINK" with stacked decorators — hence one small custom validator.
export function IsValidEvidenceValue(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidEvidenceValue',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (value === undefined || value === null) return true; // @IsOptional handles presence
          if (typeof value !== 'string' || value.length === 0) return false;

          const dto = args.object as { type?: EvidenceType };
          if (dto.type !== EvidenceType.LINK) return true;

          try {
            const url = new URL(value);
            return url.protocol === 'http:' || url.protocol === 'https:';
          } catch {
            return false;
          }
        },
        defaultMessage(): string {
          return 'value must be a non-empty string, and an http(s) URL when type is LINK';
        },
      },
    });
  };
}
