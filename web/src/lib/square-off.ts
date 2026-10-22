/** A picture cut square, for an avatar or a server icon. */

const AVATAR_PX = 512;

/** Square, from the middle, no bigger than it needs to be. */
export async function squareOff(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height, AVATAR_PX);
    const crop = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, (bitmap.width - crop) / 2, (bitmap.height - crop) / 2, crop, crop, 0, 0, side, side);
    const type = file.type === 'image/png' || file.type === 'image/gif' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, type, 0.88));
    return blob ? new File([blob], type === 'image/png' ? 'avatar.png' : 'avatar.jpg', { type }) : file;
  } finally {
    bitmap.close();
  }
}
