import sharp from 'sharp';
import { recodeImage } from './recode-image.js';

async function jpegWithGpsExif(): Promise<Buffer> {
  return sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 255, g: 0, b: 0 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'TestCam' },
      IFD3: { GPSLatitude: '41/1,0/1,0/1', GPSLatitudeRef: 'N' },
    })
    .toBuffer();
}

describe('recodeImage', () => {
  it('strips EXIF/GPS metadata from a JPEG', async () => {
    const original = await jpegWithGpsExif();
    const originalMeta = await sharp(original).metadata();
    expect(originalMeta.exif).toBeDefined();

    const recoded = await recodeImage(original, 'image/jpeg');
    const recodedMeta = await sharp(recoded).metadata();
    expect(recodedMeta.exif).toBeUndefined();
    expect(recodedMeta.format).toBe('jpeg');
  });

  it('re-encodes to the requested format for png/webp too', async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'blue' } }).png().toBuffer();
    const recodedPng = await recodeImage(png, 'image/png');
    expect((await sharp(recodedPng).metadata()).format).toBe('png');

    const webp = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'blue' } }).webp().toBuffer();
    const recodedWebp = await recodeImage(webp, 'image/webp');
    expect((await sharp(recodedWebp).metadata()).format).toBe('webp');
  });
});
