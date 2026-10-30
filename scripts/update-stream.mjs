// Берёт последнее видео (или идущую трансляцию) с канала Rutube и записывает в src/data/stream.json.
// На сайте его показывают блоки «Богослужение из дома» на главной и на странице /online.
//
//   node scripts/update-stream.mjs          — обновить
//   node scripts/update-stream.mjs --soft   — при ошибке сети не падать (так вызывается при сборке)
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'src/data/stream.json');
const CHANNEL_ID = 38731742; // rutube.ru/channel/38731742
const SOFT = process.argv.includes('--soft');

async function get(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

async function main() {
  const data = await get(`https://rutube.ru/api/video/person/${CHANNEL_ID}/?page=1`);
  const videos = (data.results || []).filter((v) => !v.is_hidden && !v.is_deleted);
  if (!videos.length) throw new Error('на канале нет видео');
  // идущая трансляция важнее записи; иначе — самое свежее видео
  const latest = videos.find((v) => v.is_livestream && v.is_on_air)
    || videos.sort((a, b) => (b.created_ts || '').localeCompare(a.created_ts || ''))[0];
  const stream = {
    id: latest.id,
    title: latest.title,
    date: latest.created_ts,
    isLive: Boolean(latest.is_livestream && latest.is_on_air),
    embed: `https://rutube.ru/play/embed/${latest.id}`,
    url: `https://rutube.ru/video/${latest.id}/`,
    thumbnail: latest.thumbnail_url || '',
  };
  writeFileSync(DATA, JSON.stringify(stream, null, 1));
  console.log(`Трансляция: ${stream.title}${stream.isLive ? ' (в эфире)' : ''}`);
}

main().catch((e) => {
  console.error(`Трансляция не обновлена: ${e.message}`);
  if (!existsSync(DATA)) {
    writeFileSync(DATA, JSON.stringify({ id: '', title: 'Субботнее богослужение', date: '', isLive: false, embed: '', url: `https://rutube.ru/channel/${CHANNEL_ID}/`, thumbnail: '' }, null, 1));
  }
  process.exit(SOFT ? 0 : 1);
});
