// Сжатие фотографий для сайта.
// Из одного файла делает два: полный (до 1600 px, для просмотра на весь экран)
// и превью `-sm` (640 px, для карточек и галереи). Формат — JPEG (mozjpeg, прогрессивный).
import sharp from 'sharp';

export const FULL = { width: 1600, quality: 76 };
export const THUMB = { width: 640, quality: 72 };

const jpeg = (img, { width, quality }) => img.clone()
  .rotate() // учесть поворот из EXIF
  .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
  .jpeg({ quality, mozjpeg: true, progressive: true });

// Путь превью для полного фото: /img/news/1/01.jpg → /img/news/1/01-sm.jpg
export const thumbPath = (p) => p.replace(/\.jpe?g$/i, '-sm.jpg');

// input — Buffer или путь к файлу; file — путь полного .jpg
export async function savePhoto(input, file) {
  const img = sharp(input, { failOn: 'none' });
  const full = await jpeg(img, FULL).toBuffer();
  const thumb = await jpeg(img, THUMB).toBuffer();
  const { writeFileSync } = await import('node:fs');
  writeFileSync(file, full);
  writeFileSync(thumbPath(file), thumb);
  return { full: full.length, thumb: thumb.length };
}
