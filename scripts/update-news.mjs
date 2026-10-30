// Обновляет новости сайта.
//   Текст — из публичной страницы Telegram-канала (t.me/s/yachurch).
//   Фото — из альбома ВКонтакте, ссылка на который есть в посте (нужен сервисный ключ VK_TOKEN в .env).
//   Новостью считается только пост со ссылкой на альбом ВК.
//
//   npm run news            — обновить новости
//   node scripts/update-news.mjs --soft   — то же, но при ошибке сети не падать (так вызывается из npm run build)
//
// Результат: src/data/news.json и фотографии в public/img/news/<id>/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { savePhoto, thumbPath } from './images.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'src/data/news.json');
const IMG = join(ROOT, 'public/img/news');

const CHANNEL = 'yachurch';
const PAGES = 6;            // ~20 постов на страницу канала
const MAX_PHOTOS = 40;
const SOFT = process.argv.includes('--soft');

try { process.loadEnvFile(join(ROOT, '.env')); } catch { /* .env необязателен */ }
const VK_TOKEN = (process.env.VK_TOKEN || '').trim();

const ALBUM_RE = /album(-?\d+)_(\d+)/;
const VERSE_RE = /^(.+?)[\s.]*((?:[1-3]\s?)?[А-ЯЁ][а-яё]{1,6}\.?\s?\d{1,3}:\d{1,3}(?:[-–]\d{1,3})?)\.?$/;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Запрос с повторами: соединение с ВК бывает нестабильным
async function get(url, binary = false, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 80)}`);
      return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(1500 * i);
    }
  }
}

const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

function toText(fragment) {
  return decode(fragment
    .replace(/<i class="emoji"[^>]*><b>(.*?)<\/b><\/i>/g, '$1')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g, (_, href, label) => (label.startsWith('http') ? href : label))
    .replace(/<[^>]+>/g, ''))
    .replace(/ /g, ' ')
    .trim();
}

// ---------- Telegram ----------

async function tgMessages() {
  const out = new Map();
  let before = null;
  for (let page = 0; page < PAGES; page++) {
    const html = await get(`https://t.me/s/${CHANNEL}${before ? `?before=${before}` : ''}`);
    const chunks = html.split(/(?=<div class="tgme_widget_message_wrap)/).slice(1);
    const ids = [];
    for (const ch of chunks) {
      const id = +(ch.match(new RegExp(`data-post="${CHANNEL}/(\\d+)"`)) || [])[1];
      if (!id) continue;
      ids.push(id);
      out.set(id, {
        id,
        date: (ch.match(/<time datetime="([^"]+)"/) || [])[1] || '',
        text: toText((ch.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || ''),
        tgPhotos: [...ch.matchAll(/tgme_widget_message_photo_wrap[^"]*"[^>]*background-image:url\('([^']+)'\)/g)].map((m) => m[1]),
      });
    }
    if (!ids.length) break;
    before = Math.min(...ids);
    await sleep(800);
  }
  return [...out.values()].sort((a, b) => b.id - a.id);
}

// ---------- ВКонтакте ----------

// Сервисный ключ не даёт читать альбомы (photos.get), но даёт читать стену группы.
// Посты в ВК и Telegram одинаковые, а к посту в ВК прикреплены фото события — берём их оттуда.
const norm = (s) => s.toLowerCase().replace(/[^a-zа-яё0-9]/g, '').slice(0, 60);

async function vkWall() {
  if (!VK_TOKEN) return [];
  const posts = [];
  for (const offset of [0, 100]) {
    const q = new URLSearchParams({ domain: CHANNEL, count: 100, offset, access_token: VK_TOKEN, v: '5.199' });
    const data = JSON.parse(await get(`https://api.vk.com/method/wall.get?${q}`));
    if (data.error) {
      console.warn(`  ВК: ${data.error.error_msg}`);
      break;
    }
    posts.push(...data.response.items);
    if (data.response.items.length < 100) break;
  }
  return posts.map((p) => ({
    key: norm(p.text || ''),
    photos: (p.attachments || []).filter((a) => a.type === 'photo').map(({ photo }) => {
      const sizes = photo.sizes.filter((s) => s.width <= 1600);
      return (sizes.length ? sizes : photo.sizes).reduce((a, b) => (b.width > a.width ? b : a)).url;
    }),
  })).filter((p) => p.key.length >= 20);
}

function vkPhotosFor(text, wall) {
  const key = norm(text);
  const hit = wall.find((p) => p.key.slice(0, 40) === key.slice(0, 40));
  return hit ? hit.photos : [];
}

// ---------- Разбор текста ----------

const isCaps = (s) => {
  const letters = [...s].filter((c) => c.toLowerCase() !== c.toUpperCase());
  return letters.length >= 6 && letters.filter((c) => c === c.toUpperCase()).length / letters.length > 0.8;
};
const sentenceCase = (s) => { const t = s.trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };

// Текст поста → заголовок, абзацы и цитаты
function structure(text) {
  const tags = [...text.matchAll(/#([\p{L}\d_]+)/gu)].map((m) => m[1]);
  let paras = text.replace(/\s*#[\p{L}\d_]+/gu, '')
    .split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    .filter((p) => !ALBUM_RE.test(p)); // абзац со ссылкой на альбом заменит кнопка

  let title = '';
  if (paras.length) {
    const first = paras[0];
    const caps = first.match(/^([^a-zа-яё]{6,}?)\s*[-–—]\s*([\s\S]+)$/);
    if (caps && isCaps(caps[1])) {
      title = sentenceCase(caps[1]).replace(/[.!]+$/, '');
      paras[0] = `${title} — ${caps[2]}`;
    } else if (first.length <= 90 && !first.includes('\n') && paras.length > 1) {
      title = first.replace(/\.$/, '');
      paras = paras.slice(1);
    } else {
      const sentence = first.split(/(?<=[.!?])\s/)[0];
      title = sentence.length <= 90 ? sentence : `${sentence.slice(0, 87).replace(/\s+\S*$/, '')}…`;
    }
    if (isCaps(title)) title = sentenceCase(title);
  }

  const blocks = paras.map((p) => {
    const v = p.replace(/\n/g, ' ').match(VERSE_RE);
    return v && isCaps(v[1]) ? { type: 'quote', text: sentenceCase(v[1]), cite: v[2] } : { type: 'p', text: p };
  });
  return { title, blocks, tags };
}

function excerpt(blocks, n = 170) {
  const p = blocks.find((b) => b.type === 'p');
  if (!p) return '';
  const t = p.text.replace(/\n/g, ' ');
  return t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, '')}…`;
}

async function download(urls, id) {
  const dir = join(IMG, String(id));
  mkdirSync(dir, { recursive: true });
  const paths = [];
  for (const [i, url] of urls.slice(0, MAX_PHOTOS).entries()) {
    const name = `${String(i + 1).padStart(2, '0')}.jpg`;
    const file = join(dir, name);
    if (!existsSync(file)) {
      // сразу сжимаем: полное фото до 1600 px и превью 640 px
      try { await savePhoto(await get(url, true), file); } catch (e) { console.warn(`  не скачалось: ${e.message}`); continue; }
    }
    paths.push(`/img/news/${id}/${name}`);
  }
  return paths;
}

async function main() {
  const old = new Map(existsSync(DATA) ? JSON.parse(readFileSync(DATA, 'utf8')).map((p) => [p.id, p]) : []);
  const msgs = await tgMessages();
  const byId = new Map(msgs.map((m) => [m.id, m]));

  // Ссылку на альбом часто публикуют отдельным коротким постом сразу после отчёта — приклеиваем её к отчёту
  for (const m of msgs) {
    if (m.text.length < 200 && ALBUM_RE.test(m.text)) {
      for (let prev = m.id - 1; prev >= m.id - 3; prev--) {
        const p = byId.get(prev);
        if (p && p.text.length >= 200 && !ALBUM_RE.test(p.text)) {
          p.text += `\n\n${m.text.match(ALBUM_RE)[0]}`;
          m.text = '';
          break;
        }
      }
    }
  }

  const wall = await vkWall().catch((e) => { console.warn(`  ВК недоступен: ${e.message}`); return []; });
  const onDisk = (paths) => paths?.length > 0 && paths.every((p) => existsSync(join(ROOT, 'public', p)) && existsSync(join(ROOT, 'public', thumbPath(p))));

  const posts = new Map(old);
  for (const m of msgs) {
    const album = m.text.match(ALBUM_RE);
    if (!album || m.text.length < 200) continue; // новость = пост со ссылкой на альбом ВК
    const { title, blocks, tags } = structure(m.text);
    const prev = old.get(m.id);
    let photos = prev?.photosSource === 'vk' && onDisk(prev.photos) ? prev.photos : [];
    let photosSource = 'vk';
    if (!photos.length) photos = await download(vkPhotosFor(m.text, wall), m.id);
    if (!photos.length) {
      photos = onDisk(prev?.photos) ? prev.photos : await download(m.tgPhotos, m.id);
      photosSource = 'tg';
    }
    posts.set(m.id, {
      id: m.id,
      date: m.date,
      title,
      excerpt: excerpt(blocks),
      blocks,
      tags,
      photos,
      photosSource,
      album: `https://vk.com/album${album[1]}_${album[2]}`,
      source: `https://t.me/${CHANNEL}/${m.id}`,
    });
    console.log(`${m.id}  ${title.slice(0, 48).padEnd(48)}  фото: ${photos.length} (${photosSource})`);
  }

  // старые записи без альбома (из прошлых версий скрипта) не храним
  const result = [...posts.values()].filter((p) => p.album).sort((a, b) => b.date.localeCompare(a.date));
  mkdirSync(dirname(DATA), { recursive: true });
  writeFileSync(DATA, JSON.stringify(result, null, 1));
  console.log(`Готово: ${result.length} новостей${VK_TOKEN ? '' : ' (без VK_TOKEN — фото из Telegram)'}`);
}

main().catch((e) => {
  console.error(`Новости не обновлены: ${e.message}`);
  if (!existsSync(DATA)) writeFileSync(DATA, '[]');
  process.exit(SOFT ? 0 : 1);
});
