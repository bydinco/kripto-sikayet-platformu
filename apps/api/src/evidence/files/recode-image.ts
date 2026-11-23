import sharp from 'sharp';
import type { AllowedEvidenceMimeType } from './evidence-file.constants.js';

// Fully decodes and re-encodes the pixel data: strips EXIF/GPS/ICC/XMP
// metadata (sharp omits it by default unless .withMetadata() is called)
// and discards anything appended after the image data (polyglot payloads),
// since only the decoded pixels ever survive into the output buffer.
// .rotate() applies the EXIF orientation before it's stripped, so the
// recoded image still displays right-side up.
export async function recodeImage(buffer: Buffer, mimeType: AllowedEvidenceMimeType): Promise<Buffer> {
  const pipeline = sharp(buffer, { failOn: 'error' }).rotate();
  switch (mimeType) {
    case 'image/png':
      return pipeline.png().toBuffer();
    case 'image/jpeg':
      return pipeline.jpeg().toBuffer();
    case 'image/webp':
      return pipeline.webp().toBuffer();
  }
}
