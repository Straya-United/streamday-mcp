// Australian calendar-day helpers. Streamday's release dates are AU dates; we default to Sydney time.
export const DEFAULT_TZ = 'Australia/Sydney';

export function todayIn(tz = DEFAULT_TZ, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
export const weekday = (ymd) => new Date(ymd + 'T00:00:00Z').getUTCDay(); // 0 Sun .. 6 Sat
export const dayName = (ymd) => new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' });
export const niceDate = (ymd) => new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Relative label from today: Today / Tomorrow / Yesterday / weekday name / date. */
export function relDay(ymd, today) {
  const diff = Math.round((Date.parse(ymd) - Date.parse(today)) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return dayName(ymd);
  if (diff < -1 && diff > -7) return `Last ${dayName(ymd)}`;
  return niceDate(ymd);
}

/** Turn a spoken-style window into an inclusive [from, to] date range. */
export function windowRange(when, today) {
  const w = String(when || 'today').toLowerCase().replace(/[\s-]+/g, '_');
  if (/^\d{4}-\d{2}-\d{2}$/.test(when)) return { from: when, to: when, label: niceDate(when) };
  const wd = weekday(today);
  switch (w) {
    case 'today': case 'tonight': return { from: today, to: today, label: w === 'tonight' ? 'Tonight' : 'Today' };
    case 'tomorrow': { const t = addDays(today, 1); return { from: t, to: t, label: 'Tomorrow' }; }
    case 'yesterday': { const t = addDays(today, -1); return { from: t, to: t, label: 'Yesterday' }; }
    case 'this_weekend': case 'weekend': {
      const sat = addDays(today, (6 - wd + 7) % 7), sun = addDays(sat, 1);
      return { from: wd === 0 ? today : sat, to: wd === 0 ? today : sun, label: 'This weekend' };
    }
    case 'next_week': { const mon = addDays(today, ((8 - wd) % 7) || 7); return { from: mon, to: addDays(mon, 6), label: 'Next week' }; }
    case 'just_dropped': case 'last_week': case 'recent': return { from: addDays(today, -7), to: addDays(today, -1), label: 'Just dropped' };
    case 'this_month': return { from: today, to: addDays(today, 30), label: 'The next 30 days' };
    case 'this_week': case 'week': default: return { from: today, to: addDays(today, 6), label: 'This week' };
  }
}

/** "out today", "out yesterday", "out last Thursday", "out 12 October" — for why-lines. */
export function outLabel(ymd, today) {
  const diff = Math.round((Date.parse(ymd) - Date.parse(today)) / 864e5);
  if (diff === 0) return 'out today';
  if (diff === -1) return 'out yesterday';
  if (diff < -1 && diff > -7) return `out last ${dayName(ymd)}`;
  if (diff === 1) return 'out tomorrow';
  if (diff > 1 && diff < 7) return `out ${dayName(ymd)}`;
  return 'out ' + new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}
