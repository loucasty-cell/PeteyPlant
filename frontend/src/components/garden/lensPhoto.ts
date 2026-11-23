export const photoFormats = ['image/jpeg', 'image/png', 'image/webp'];
const maxFileBytes = 8 * 1024 * 1024;
const maxSourcePixels = 24_000_000;
const minSourceSide = 160;
const maxOutputSide = 2048;

export async function encodeLensPhoto(source: CanvasImageSource, width: number, height: number) {
  if (width < minSourceSide || height < minSourceSide) throw new Error('This photo is too small. Try a larger or closer photo.');
  if (width * height > maxSourcePixels) throw new Error('This image is too large. Try a smaller photo.');
  const scale = Math.min(1, maxOutputSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  if (Math.min(canvas.width, canvas.height) < minSourceSide) throw new Error('This photo is unusually narrow. Try a less cropped photo.');
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Your browser couldn’t prepare the photo.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  try {
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((photo) => {
      if (photo && photo.size <= maxFileBytes) resolve(photo);
      else reject(new Error('This photo couldn’t be prepared. Try a smaller image.'));
    }, 'image/jpeg', 0.92));
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function prepareLensUpload(file: File) {
  if (!file.size) throw new Error('This file is empty. Choose another photo.');
  if (file.type && !photoFormats.includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP photo.');
  if (file.size > maxFileBytes) throw new Error('Choose a photo smaller than 8 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => { throw new Error('This image couldn’t be opened. Choose another photo.'); });
    return await encodeLensPhoto(image, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}
