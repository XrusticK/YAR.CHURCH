// Сжимает уже скачанные фото новостей, у которых ещё нет превью (-sm.jpg).
// Новые фото сжимает сам scripts/update-news.mjs, так что этот скрипт нужен только для старых.
//   node scripts/optimize-images.mjs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { savePhoto, thumbPath } from './images.mjs';

const NEWS = join(dirname(fileURLToPath(import.meta.url)), '..', 'public/img/news');
let before = 0, after = 0, count = 0;

for (const dir of existsSync(NEWS) ? readdirSync(NEWS) : []) {
  for (const name of readdirSync(join(NEWS, dir))) {
    const file = join(NEWS, dir, name);
    if (!/^\d+\.jpg$/.test(name) || existsSync(thumbPath(file))) continue;
    before += statSync(file).size;
    const { full, thumb } = await savePhoto(readFileSync(file), file);
    after += full;
    count++;
    console.log(`${dir}/${name}  →  ${Math.round(full / 1024)} КБ, превью ${Math.round(thumb / 1024)} КБ`);
  }
}
console.log(count ? `Сжато ${count} фото: ${Math.round(before / 1024)} → ${Math.round(after / 1024)} КБ` : 'Всё уже сжато');
