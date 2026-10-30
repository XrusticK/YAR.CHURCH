// Новости собирает scripts/update-news.mjs (npm run news) в news.json
import raw from './news.json';

export type Block = { type: 'p'; text: string } | { type: 'quote'; text: string; cite: string };
export type Post = {
  id: number;
  date: string;
  title: string;
  excerpt: string;
  blocks: Block[];
  tags: string[];
  photos: string[];
  photosSource: 'vk' | 'tg';
  album: string;
  source: string;
};

export const NEWS = raw as Post[];

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export function formatDate(iso: string) {
  const d = new Date(new Date(iso).getTime() + 3 * 3600 * 1000); // по Москве
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Хештеги канала → подписи рубрик на карточках
const TAGS: Record<string, string> = {
  молодежноеслужение: 'Молодёжь',
  женскоеслужение: 'Женский клуб',
  золотоевремя: 'Золотое время',
  следопыты: 'Следопыт',
  искатели: 'Искатели приключений',
  служениездоровья: 'Здоровье',
};
export const tagLabel = (t: string) => TAGS[t] || '';
