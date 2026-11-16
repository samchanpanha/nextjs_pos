/**
 * Resizes and compresses a user-selected image File into a JPEG data URL
 * guaranteed to fit comfortably under Firestore's 65,000-character limit.
 */
export async function compressImageFileToDataUrl(
  file: File,
  maxBytesLength = 48000,
  targetSize = 240
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (PNG, JPG, WebP).');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to decode image.'));
    el.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas image processing is unavailable in this browser.');
  }

  // Cover-crop centered square
  const srcMin = Math.min(img.width, img.height);
  const sx = Math.max(0, Math.floor((img.width - srcMin) / 2));
  const sy = Math.max(0, Math.floor((img.height - srcMin) / 2));

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetSize, targetSize);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, srcMin, srcMin, 0, 0, targetSize, targetSize);

  let quality = 0.8;
  let output = canvas.toDataURL('image/jpeg', quality);
  while (output.length > maxBytesLength && quality > 0.4) {
    quality -= 0.1;
    output = canvas.toDataURL('image/jpeg', quality);
  }

  if (output.length > maxBytesLength) {
    canvas.width = 180;
    canvas.height = 180;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 180, 180);
    ctx.drawImage(img, sx, sy, srcMin, srcMin, 0, 0, 180, 180);
    output = canvas.toDataURL('image/jpeg', 0.65);
  }

  return output;
}
