// The "agentic" layer: turns raw release data + a viewer's memory into answers worth speaking out loud.
// Pure functions over plain data, so they are unit-testable without the network.
import { addDays, relDay, niceDate, weekday, outLabel } from './dates.mjs';
import { poster } from './streamday.mjs';

export const KIND = { 'new-series': 'New series', 'new-season': 'New season', finale: 'Finale', episode: 'New episode', movie: 'Movie' };
const KIND_WEIGHT = { 'new-series': 30, 'new-season': 26, finale: 22, movie: 14, episode: 8 };

export function epLine(d) {
  if (d.type === 'movie') return [d.genres?.[0], d.runtime ? `${d.runtime} min` : ''].filter(Boolean).join(' · ') || 'Movie';
  const s = `Season ${d.season}`;
  if (d.epCount > 1) {
    const all = d.seasonEpisodes && d.epFrom === 1 && d.epTo === d.seasonEpisodes;
    return all ? `${s}, all ${d.epCount} episodes` : `${s}, episodes ${d.epFrom} to ${d.epTo}`;
  }
  return `${s}, episode ${d.epFrom}`;
}

/** Keep drops a viewer can actually watch: on their services (if they set any), not soap/daily noise unless followed. */
export function visibleTo(profile, { myServicesOnly = true, followedOnly = false, kinds } = {}) {
  const mine = new Set(profile.services || []);
  const follow = profile.follow || {};
  return (d) => {
    if (kinds?.length && !kinds.includes(d.kind)) return false;
    if (followedOnly && !follow[d.showId]) return false;
    if (d.frequent && !follow[d.showId]) return false;
    if (myServicesOnly && mine.size && !d.services.some((s) => mine.has(s))) return false;
    return true;
  };
}

/** A card the MCP App view (and the simulator) can render, plus a sentence a voice assistant can say. */
export function card(d, ctx) {
  const svc = (ctx.services || []).filter((s) => d.services.includes(s.key));
  const mine = new Set(ctx.profile?.services || []);
  const onMine = svc.filter((s) => !mine.size || mine.has(s.key));
  return {
    id: d.id, showId: d.showId, type: d.type, title: d.title, kind: d.kind, kindLabel: KIND[d.kind],
    date: d.date, when: relDay(d.date, ctx.today), detail: epLine(d),
    services: (onMine.length ? onMine : svc).map((s) => ({ key: s.key, name: s.name, color: s.color })),
    poster: poster(d.poster), backdrop: poster(d.backdrop, 'w780'),
    overview: (d.overview || d.showOverview || '').slice(0, 280), genres: d.genres || [],
    followed: !!ctx.profile?.follow?.[d.showId],
  };
}
const svcNames = (c) => c.services.map((s) => s.name).join(' and ');

// ---------- mood → genres (TMDB genre names) ----------
const MOODS = [
  [/light|funny|laugh|comed|chill|easy|fun|cosy|cozy/, ['Comedy', 'Animation', 'Family', 'Reality']],
  [/scary|horror|creepy|spooky|halloween/, ['Horror', 'Mystery', 'Thriller']],
  [/thrill|tense|edge|suspense|crime|detective|murder/, ['Thriller', 'Crime', 'Mystery']],
  [/action|exciting|adrenaline|fight/, ['Action', 'Action & Adventure', 'Adventure', 'War & Politics']],
  [/romance|romantic|date night|love/, ['Romance', 'Drama', 'Comedy']],
  [/sci|space|future|fantasy|magic|dragon/, ['Science Fiction', 'Sci-Fi & Fantasy', 'Fantasy']],
  [/real|true|documentar|learn|history/, ['Documentary', 'History', 'Reality']],
  [/kid|family|children/, ['Family', 'Animation', 'Kids']],
  [/drama|emotional|cry|serious/, ['Drama']],
];
export function moodGenres(mood = '') {
  const m = mood.toLowerCase();
  return [...new Set(MOODS.filter(([re]) => re.test(m)).flatMap(([, g]) => g))];
}

/**
 * Tonight's pick: rank what is fresh on the viewer's services and explain each choice.
 * Signals: followed shows, how big the release is (new series > new season > finale > movie > episode),
 * mood/genre match, fits the time they have, popularity, and not suggested in the last few days.
 */
export function rankTonight(drops, ctx, { mood = '', minutes, count = 3 } = {}) {
  const want = moodGenres(mood);
  const recent = new Set((ctx.profile?.history || []).filter((h) => Date.parse(ctx.today) - Date.parse(h.date) < 4 * 864e5).map((h) => h.showId));
  const maxPop = Math.max(1, ...drops.map((d) => d.popularity || 0));
  const scored = drops.map((d) => {
    const why = [];
    let s = KIND_WEIGHT[d.kind] || 5;
    if (ctx.profile?.follow?.[d.showId]) { s += 40; why.push('you follow it'); }
    if (d.kind !== 'episode') why.push(KIND[d.kind].toLowerCase());
    const age = Math.round((Date.parse(ctx.today) - Date.parse(d.date)) / 864e5);
    if (age === 0) { s += 10; why.push('out today'); } else if (age > 0 && age <= 3) { s += 6; why.push(outLabel(d.date, ctx.today)); }
    if (want.length) {
      const hit = (d.genres || []).filter((g) => want.includes(g));
      if (hit.length) { s += 25; why.push(`${hit[0].toLowerCase()} fits the mood`); } else s -= 12;
    }
    if (minutes && d.type === 'movie' && d.runtime) { if (d.runtime <= minutes) s += 6; else s -= 20; }
    if (minutes && d.type === 'tv' && minutes < 40 && d.epCount > 3) s -= 4;
    s += 12 * ((d.popularity || 0) / maxPop);
    if (recent.has(d.showId)) s -= 30;
    return { d, s, why };
  }).sort((a, b) => b.s - a.s);
  const seen = new Set();
  return scored.filter(({ d }) => !seen.has(d.showId) && seen.add(d.showId)).slice(0, count)
    .map(({ d, why }) => ({ ...card(d, ctx), why: why.slice(0, 3).join(', ') }));
}

/**
 * Plan my week: followed shows' new episodes land on their release night; the rest of the free nights get
 * the biggest premieres on the viewer's services. Nights they say they're busy stay empty.
 */
export function planWeek(drops, ctx, { busyDays = [], perNight = 2, followedNext = [] } = {}) {
  const busy = new Set(busyDays.map((d) => d.toLowerCase().slice(0, 3)));
  const days = Array.from({ length: 7 }, (_, i) => addDays(ctx.today, i));
  const nameOf = (ymd) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][weekday(ymd)];
  const plan = days.map((date) => ({ date, label: relDay(date, ctx.today), busy: busy.has(nameOf(date)), items: [] }));
  const byDate = new Map(plan.map((p) => [p.date, p]));
  const used = new Set();
  const followed = ctx.profile?.follow || {};
  // 1. Followed shows on their release day (from the calendar, then each show's "next episode" date).
  for (const d of drops.filter((x) => followed[x.showId]).sort((a, b) => a.date.localeCompare(b.date))) {
    const night = byDate.get(d.date);
    if (!night || used.has(d.showId)) continue;
    used.add(d.showId);
    night.items.push({ ...card(d, ctx), why: 'new episode of a show you follow', fixed: true });
  }
  for (const n of followedNext) {
    const night = n.date && byDate.get(n.date);
    if (!night || used.has(n.showId)) continue;
    used.add(n.showId);
    night.items.push({ id: `next-${n.showId}`, showId: n.showId, type: 'tv', title: n.title, kind: 'episode', kindLabel: 'New episode', date: n.date, when: relDay(n.date, ctx.today), detail: `Season ${n.season}, episode ${n.episode}`, services: n.services || [], poster: n.poster || null, followed: true, why: 'new episode of a show you follow', fixed: true });
  }
  // 2. Fill free nights with the strongest premieres released this week or just before it.
  const picks = drops.filter((d) => !used.has(d.showId) && d.kind !== 'episode')
    .sort((a, b) => (KIND_WEIGHT[b.kind] - KIND_WEIGHT[a.kind]) || (b.popularity || 0) - (a.popularity || 0));
  for (const night of plan) {
    if (night.busy) { night.items = night.items.filter((x) => x.fixed); continue; }
    while (night.items.length < perNight) {
      const i = picks.findIndex((d) => d.date <= night.date && !used.has(d.showId));
      if (i < 0) break;
      const d = picks.splice(i, 1)[0];
      used.add(d.showId);
      night.items.push({ ...card(d, ctx), why: d.date === night.date ? `${KIND[d.kind].toLowerCase()} out that day` : `${KIND[d.kind].toLowerCase()}, ${outLabel(d.date, ctx.today)}` });
    }
  }
  return plan;
}

// ---------- speech ----------
export function sayList(cards, label) {
  if (!cards.length) return `${label}, there's nothing new on your services.`;
  const top = cards.slice(0, 4).map((c) => `${c.title}${c.kind !== 'episode' ? ` (${c.kindLabel.toLowerCase()})` : ''} on ${svcNames(c)}`);
  const more = cards.length > 4 ? `, plus ${cards.length - 4} more` : '';
  return `${label}: ${top.join('; ')}${more}.`;
}
export function sayPicks(picks) {
  if (!picks.length) return 'I couldn’t find anything fresh on your services for tonight.';
  const [a, ...rest] = picks;
  return `Tonight I’d go with ${a.title} on ${svcNames(a)}, because ${a.why}.` + (rest.length ? ` Also good: ${rest.map((p) => p.title).join(' or ')}.` : '');
}
export function sayPlan(plan) {
  const nights = plan.filter((n) => n.items.length);
  if (!nights.length) return 'Your week is clear: nothing new from your services yet.';
  return nights.slice(0, 4).map((n) => `${n.label}: ${n.items.map((i) => i.title.replace(/\.$/, '')).join(' and ')}`).join('. ') + '.';
}
export const fmtLong = niceDate;
