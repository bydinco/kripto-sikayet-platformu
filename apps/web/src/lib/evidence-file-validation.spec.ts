import { getFileExtension, isAcceptedImageFile, MAX_FILE_SIZE_BYTES } from './evidence-file-validation';

function file(name: string, type: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('isAcceptedImageFile', () => {
  it('accepts .jpg/.jpeg/.JPG with the normal browser-reported MIME type', () => {
    expect(isAcceptedImageFile(file('photo.jpg', 'image/jpeg'))).toBe(true);
    expect(isAcceptedImageFile(file('photo.jpeg', 'image/jpeg'))).toBe(true);
    expect(isAcceptedImageFile(file('PHOTO.JPG', 'image/jpeg'))).toBe(true);
  });

  it('falls back to the extension when the browser reports an unexpected/empty MIME type for a .jpg', () => {
    // Observed in the wild: some file managers / older Windows MIME
    // registrations report "image/pjpeg", "image/jpg", or "" for a .jpg.
    expect(isAcceptedImageFile(file('camera.jpg', 'image/pjpeg'))).toBe(true);
    expect(isAcceptedImageFile(file('camera.jpg', 'image/jpg'))).toBe(true);
    expect(isAcceptedImageFile(file('camera.jpg', ''))).toBe(true);
    expect(isAcceptedImageFile(file('CAMERA.JPEG', ''))).toBe(true);
  });

  it('accepts png and webp the same way', () => {
    expect(isAcceptedImageFile(file('a.png', 'image/png'))).toBe(true);
    expect(isAcceptedImageFile(file('a.PNG', ''))).toBe(true);
    expect(isAcceptedImageFile(file('a.webp', 'image/webp'))).toBe(true);
    expect(isAcceptedImageFile(file('a.WEBP', ''))).toBe(true);
  });

  it('rejects an unrelated type/extension', () => {
    expect(isAcceptedImageFile(file('doc.pdf', 'application/pdf'))).toBe(false);
    expect(isAcceptedImageFile(file('video.mp4', 'video/mp4'))).toBe(false);
    expect(isAcceptedImageFile(file('noext', ''))).toBe(false);
  });
});

describe('getFileExtension', () => {
  it('lowercases and strips the dot', () => {
    expect(getFileExtension('Photo.JPG')).toBe('jpg');
    expect(getFileExtension('a.b.PNG')).toBe('png');
  });

  it('returns empty string when there is no extension', () => {
    expect(getFileExtension('noext')).toBe('');
  });
});

describe('MAX_FILE_SIZE_BYTES', () => {
  it('is 5MB', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(5 * 1024 * 1024);
  });
});
