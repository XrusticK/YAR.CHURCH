// Путь с учётом базового адреса сайта: на GitHub Pages сайт живёт в подпапке (/YAR.CHURCH/),
// на своём домене — в корне. Внешние ссылки и якоря возвращаются как есть.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export const url = (path: string) => (path.startsWith('/') && !path.startsWith('//') ? BASE + path : path);

// Текущий путь без базового адреса — для подсветки пункта меню
export const stripBase = (pathname: string) => (BASE && pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname) || '/';
