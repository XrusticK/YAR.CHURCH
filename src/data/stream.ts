// Последнее видео / идущая трансляция с Rutube. Обновляет scripts/update-stream.mjs.
import raw from './stream.json';

export type Stream = { id: string; title: string; date: string; isLive: boolean; embed: string; url: string; thumbnail: string };
export const STREAM = raw as Stream;
