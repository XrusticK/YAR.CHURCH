// Поведение страниц: шапка, анимации появления, бесконечный слайдер, лента дат,
// ближайшее богослужение, галерея, копирование реквизитов.
// Сайт переходит между страницами без перезагрузки, поэтому всё запускается на astro:page-load.

type Meeting = { t: string; title: string; note?: string; badge?: string };

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let cleanups: Array<() => void> = [];

// ---------- Время по Москве ----------
const TZ = 3;
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WD_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

// «Московское» время храним в полях UTC — не зависим от часового пояса посетителя
const mskNow = () => new Date(Date.now() + TZ * 3600 * 1000);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const fmtDate = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
const toHours = (t: string) => { const [h, m] = t.split(':'); return +h + +m / 60; };

function setText(sel: string, text: string) {
  document.querySelectorAll<HTMLElement>(sel).forEach((el) => { el.textContent = text; });
}

// Ближайшее богослужение: суббота, 10:00
function nextService() {
  const msk = mskNow();
  const day = msk.getUTCDay();
  const hour = msk.getUTCHours() + msk.getUTCMinutes() / 60;
  let toSat = (6 - day + 7) % 7;
  if (toSat === 0 && hour >= 13) toSat = 7;
  setText('[data-next-service]', `${toSat === 0 ? 'Сегодня' : toSat === 1 ? 'Завтра' : `Суббота, ${fmtDate(addDays(msk, toSat))}`}, 10:00`);
}

// ---------- Шапка ----------
function header() {
  const el = document.querySelector<HTMLElement>('.site-header');
  if (!el) return;
  const onScroll = () => el.classList.toggle('is-scrolled', window.scrollY > 10);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  cleanups.push(() => window.removeEventListener('scroll', onScroll));

  const burger = el.querySelector<HTMLButtonElement>('.burger');
  const nav = el.querySelector<HTMLElement>('.nav');
  if (!burger || !nav) return;
  const set = (open: boolean) => {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  };
  burger.addEventListener('click', () => set(!nav.classList.contains('is-open')));
  cleanups.push(() => set(false));
}

// ---------- Появление при прокрутке ----------
function reveal() {
  const items = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (reduced() || !('IntersectionObserver' in window)) { items.forEach((i) => i.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  items.forEach((i) => io.observe(i));
  cleanups.push(() => io.disconnect());
}

// ---------- Лёгкий параллакс фона в шапках страниц ----------
function parallax() {
  const img = document.querySelector<HTMLElement>('[data-parallax]');
  if (!img || reduced()) return;
  const onScroll = () => {
    const y = Math.min(window.scrollY, 600);
    img.style.translate = `0 ${y * 0.25}px`;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  cleanups.push(() => window.removeEventListener('scroll', onScroll));
}

// ---------- Бесконечный слайдер ----------
function slider() {
  const root = document.querySelector<HTMLElement>('[data-slider]');
  if (!root) return;
  const viewport = root.querySelector<HTMLElement>('.slider__viewport')!;
  const track = root.querySelector<HTMLElement>('.slider__track')!;
  const originals = [...track.children] as HTMLElement[];
  const n = originals.length;
  const CLONES = 2;
  const AUTOPLAY = 6000;

  // По краям — копии слайдов, чтобы после последнего сразу шёл первый
  const before = originals.slice(-CLONES).map((s) => s.cloneNode(true) as HTMLElement);
  const after = originals.slice(0, CLONES).map((s) => s.cloneNode(true) as HTMLElement);
  [...before, ...after].forEach((c) => { c.setAttribute('aria-hidden', 'true'); c.setAttribute('tabindex', '-1'); });
  track.prepend(...before);
  track.append(...after);
  const all = [...track.children] as HTMLElement[];

  const dots = root.querySelector<HTMLElement>('.slider__dots')!;
  dots.innerHTML = originals.map((_, i) => `<button type="button" aria-label="Слайд ${i + 1}"></button>`).join('');
  const dotBtns = [...dots.children] as HTMLElement[];
  root.style.setProperty('--autoplay', `${AUTOPLAY}ms`);

  let index = CLONES; // позиция в расширенном ряду
  let busy = false;

  const step = () => all[1].offsetLeft - all[0].offsetLeft;
  const offset = (i: number) => (viewport.clientWidth - all[0].offsetWidth) / 2 - i * step();
  const place = (animate: boolean, extra = 0) => {
    track.style.transition = animate ? 'transform 1s cubic-bezier(.22,1,.36,1)' : 'none';
    track.style.transform = `translate3d(${offset(index) + extra}px,0,0)`;
  };
  const mark = () => {
    const real = (index - CLONES + n) % n;
    all.forEach((s, i) => s.classList.toggle('is-active', i === index));
    dotBtns.forEach((b, i) => {
      b.removeAttribute('aria-current');
      if (i === real) { void b.offsetWidth; b.setAttribute('aria-current', 'true'); }
    });
  };
  // Конец перехода: transitionend или запасной таймер (в фоновой вкладке transitionend может не прийти)
  let settleTimer = 0;
  const settle = () => {
    clearTimeout(settleTimer);
    if (!busy) return;
    busy = false;
    // Дошли до копии — незаметно перескакиваем на настоящий слайд
    if (index >= CLONES + n || index < CLONES) {
      index = ((index - CLONES) % n + n) % n + CLONES;
      all.forEach((s) => { s.style.transition = 'none'; });
      place(false);
      mark();
      void track.offsetWidth;
      all.forEach((s) => { s.style.transition = ''; });
    }
  };
  const go = (i: number) => {
    if (busy) settle();
    busy = true;
    index = i;
    place(true);
    mark();
    settleTimer = window.setTimeout(settle, 1050);
  };
  track.addEventListener('transitionend', (e) => { if (e.target === track) settle(); });

  let timer = 0;
  const stop = () => { clearInterval(timer); root.classList.add('is-paused'); };
  const start = () => {
    stop();
    if (reduced()) return;
    root.classList.remove('is-paused');
    mark();
    timer = window.setInterval(() => go(index + 1), AUTOPLAY);
  };

  root.querySelectorAll<HTMLElement>('[data-slide]').forEach((b) => b.addEventListener('click', () => { go(index + +b.dataset.slide!); start(); }));
  dotBtns.forEach((b, i) => b.addEventListener('click', () => { go(i + CLONES); start(); }));
  root.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') stop(); });
  root.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') start(); });

  // Перетаскивание мышью и пальцем
  let downX = 0, dx = 0, dragging = false;
  viewport.addEventListener('pointerdown', (e) => {
    if (busy) settle();
    dragging = true; downX = e.clientX; dx = 0;
    stop();
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dx = e.clientX - downX;
    if (Math.abs(dx) > 4) place(false, dx);
  });
  const up = () => {
    if (!dragging) return;
    dragging = false;
    if (Math.abs(dx) > 60) go(index + (dx < 0 ? 1 : -1));
    else if (dx !== 0) place(true);
    start();
  };
  window.addEventListener('pointerup', up);
  track.addEventListener('click', (e) => { if (Math.abs(dx) > 6) { e.preventDefault(); dx = 0; } }, true);
  track.querySelectorAll('img').forEach((img) => img.setAttribute('draggable', 'false'));

  const onResize = () => place(false);
  window.addEventListener('resize', onResize);
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVis);

  place(false);
  mark();
  start();
  cleanups.push(() => {
    stop();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointerup', up);
    document.removeEventListener('visibilitychange', onVis);
  });
}

// ---------- Лента дат ----------
function calendar() {
  document.querySelectorAll<HTMLElement>('[data-calendar]').forEach((cal) => {
    const week: Record<number, Meeting[]> = JSON.parse(cal.dataset.week || '{}');
    const place = cal.dataset.place || '';
    const strip = cal.querySelector<HTMLElement>('.cal__strip')!;
    const list = cal.querySelector<HTMLElement>('.cal__list')!;
    const head = cal.querySelector<HTMLElement>('.cal__head')!;
    const msk = mskNow();
    const hour = msk.getUTCHours() + msk.getUTCMinutes() / 60;
    const DAYS = 28;

    const eventsFor = (i: number) => {
      const ev = week[addDays(msk, i).getUTCDay()] || [];
      return i === 0 ? ev.filter((e) => toHours(e.t) + 1.5 > hour) : ev;
    };

    let first = -1;
    strip.innerHTML = Array.from({ length: DAYS }, (_, i) => {
      const d = addDays(msk, i);
      const wd = d.getUTCDay();
      const has = eventsFor(i).length > 0;
      if (has && first < 0) first = i;
      const month = i === 0 || d.getUTCDate() === 1 ? `<span class="cal__month">${MONTHS_SHORT[d.getUTCMonth()]}</span>` : '';
      return `<button type="button" class="cal__day${wd === 6 ? ' cal__day--sat' : ''}${has ? ' cal__day--has' : ''}" data-i="${i}" aria-pressed="false" aria-label="${fmtDate(d)}, ${WD_FULL[wd]}">${month}<span class="cal__num">${d.getUTCDate()}</span><span class="cal__wd">${WD[wd]}</span><span class="cal__dot"></span></button>`;
    }).join('');

    const select = (i: number) => {
      strip.querySelectorAll<HTMLElement>('.cal__day').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.i! === i)));
      const d = addDays(msk, i);
      head.textContent = `${i === 0 ? 'Сегодня, ' : i === 1 ? 'Завтра, ' : ''}${WD_FULL[d.getUTCDay()]}, ${fmtDate(d)}`;
      const ev = eventsFor(i);
      list.innerHTML = ev.length
        ? ev.map((e, k) => `<div class="cal__event" style="--i:${k}"><span class="cal__time">${e.t}</span><div><div class="cal__title">${e.title}</div><div class="cal__place">${e.note || place}</div></div>${e.badge ? `<span class="cal__badge">${e.badge}</span>` : '<span></span>'}</div>`).join('')
        : '<p class="cal__empty">В этот день общих встреч нет. Ближайшие — во вторник, четверг и субботу.</p>';
    };
    strip.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.cal__day');
      if (b) select(+b.dataset.i!);
    });
    cal.querySelectorAll<HTMLElement>('[data-cal-scroll]').forEach((btn) => {
      btn.addEventListener('click', () => strip.scrollBy({ left: +btn.dataset.calScroll! * strip.clientWidth * 0.8 }));
    });
    select(first < 0 ? 0 : first);
  });
}

// ---------- Галерея с просмотром ----------
function gallery() {
  const g = document.querySelector<HTMLElement>('[data-gallery]');
  const box = document.querySelector<HTMLElement>('[data-lightbox]');
  if (!g || !box) return;
  const items = [...g.querySelectorAll<HTMLButtonElement>('button')];
  const img = box.querySelector('img')!;
  const count = box.querySelector<HTMLElement>('.lightbox__count')!;
  let cur = 0;
  const show = (i: number) => {
    cur = (i + items.length) % items.length;
    img.src = items[cur].dataset.src!;
    count.textContent = `${cur + 1} / ${items.length}`;
  };
  const open = (i: number) => { show(i); box.classList.add('is-open'); document.body.style.overflow = 'hidden'; };
  const close = () => { box.classList.remove('is-open'); document.body.style.overflow = ''; };
  items.forEach((b, i) => b.addEventListener('click', () => open(i)));
  box.querySelector('.lightbox__prev')?.addEventListener('click', () => show(cur - 1));
  box.querySelector('.lightbox__next')?.addEventListener('click', () => show(cur + 1));
  box.querySelector('.lightbox__close')?.addEventListener('click', close);
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  const onKey = (e: KeyboardEvent) => {
    if (!box.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(cur - 1);
    if (e.key === 'ArrowRight') show(cur + 1);
  };
  document.addEventListener('keydown', onKey);
  cleanups.push(() => { document.removeEventListener('keydown', onKey); close(); });
}

// ---------- Копирование реквизитов ----------
function copy() {
  document.querySelectorAll<HTMLButtonElement>('.copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigator.clipboard?.writeText(btn.textContent!.trim()).then(() => {
        btn.classList.add('is-copied');
        setTimeout(() => btn.classList.remove('is-copied'), 1500);
      });
    });
  });
}

document.addEventListener('astro:page-load', () => {
  header();
  reveal();
  parallax();
  slider();
  calendar();
  nextService();
  gallery();
  copy();
});

document.addEventListener('astro:before-swap', () => {
  cleanups.forEach((fn) => fn());
  cleanups = [];
});
