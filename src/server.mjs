// Streamday MCP server: an Alexa+-ready TV guide for Australian streaming.
// One McpServer per request (stateless Streamable HTTP); the viewer's memory lives in Netlify Blobs.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { getServices, dropsBetween, searchShows, getShow, poster } from './streamday.mjs';
import { todayIn, windowRange, addDays, relDay, niceDate, DEFAULT_TZ } from './dates.mjs';
import { visibleTo, card, rankTonight, planWeek, sayList, sayPicks, sayPlan, KIND } from './logic.mjs';
import { loadProfile, saveProfile } from './memory.mjs';
import { VIEW_HTML } from './view.generated.mjs';

export const VIEW_URI = 'ui://streamday/cards.html';
const ui = { ui: { resourceUri: VIEW_URI } };

const INSTRUCTIONS = `Streamday knows what is releasing on Australian streaming services (Netflix, Disney+, Prime Video, Stan, Binge, Max, Apple TV+, Paramount+, Foxtel, BritBox, ABC iview, SBS On Demand, 9Now, 7plus, 10, hayu, Crunchyroll), day by day.
It remembers each viewer's services and followed shows between sessions, so call my_streamday first in a new conversation to personalise answers.
Answers are written to be spoken aloud: keep replies short, name the service for each title, and offer one follow-up (follow a show, plan the week, pick for tonight).`;

// ---------- helpers ----------
const ALIASES = [
  [/disney/, 'disney'], [/prime|amazon/, 'prime'], [/apple/, 'appletv'], [/\bmax\b|hbo/, 'hbomax'], [/iview|\babc\b/, 'iview'],
  [/sbs/, 'sbs'], [/9now|nine/, 'nine'], [/7plus|seven|\b7\b/, 'seven'], [/\b10\b|\bten\b|10 ?play/, 'ten'], [/paramount/, 'paramount'],
  [/netflix/, 'netflix'], [/stan\b/, 'stan'], [/binge/, 'binge'], [/foxtel|kayo/, 'foxtel'], [/britbox/, 'britbox'], [/hayu/, 'hayu'], [/crunchy/, 'crunchyroll'],
];
function matchServices(names, all) {
  const keys = new Set(), unknown = [];
  for (const raw of names) {
    const n = raw.toLowerCase().trim();
    const byName = all.find((s) => s.key === n || s.name.toLowerCase() === n);
    const alias = ALIASES.find(([re]) => re.test(n));
    const k = byName?.key || (alias && all.some((s) => s.key === alias[1]) ? alias[1] : null);
    k ? keys.add(k) : unknown.push(raw);
  }
  return { keys: [...keys], unknown };
}
async function resolveShow(query) {
  const results = await searchShows(query);
  if (!results.length) return null;
  const q = query.toLowerCase().trim();
  return results.find((r) => r.title.toLowerCase() === q) || results[0];
}
const text = (t) => ({ type: 'text', text: t });
function result(say, structured) {
  return { content: [text(say)], structuredContent: { say, ...structured } };
}
function errorResult(message) {
  return { isError: true, content: [text(message)] };
}
async function context(viewerId) {
  const [profile, services] = await Promise.all([loadProfile(viewerId), getServices()]);
  return { profile, services, today: todayIn(profile.tz || DEFAULT_TZ), viewerId };
}
const serviceNames = (ctx, keys) => keys.map((k) => ctx.services.find((s) => s.key === k)?.name || k);

// ---------- server ----------
export function createServer({ viewerId = 'demo' } = {}) {
  const server = new McpServer({ name: 'streamday', title: 'Streamday', version: '1.0.0' }, { instructions: INSTRUCTIONS });

  registerAppResource(server, 'Streamday cards', VIEW_URI, {
    description: 'Show cards, tonight’s picks and the weekly plan, rendered as an MCP App.',
    _meta: { ui: { csp: { resourceDomains: ['https://image.tmdb.org'] }, prefersBorder: false } },
  }, async () => ({ contents: [{ uri: VIEW_URI, mimeType: RESOURCE_MIME_TYPE, text: VIEW_HTML, _meta: { ui: { csp: { resourceDomains: ['https://image.tmdb.org'] } } } }] }));

  // --- memory ---
  server.registerTool('my_streamday', {
    title: 'My Streamday',
    description: 'The viewer’s saved Streamday profile: which streaming services they have, the shows they follow (with each show’s next episode), and what was suggested recently. Call this first in a new conversation.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
    _meta: ui,
  }, async () => {
    const ctx = await context(viewerId);
    const ids = Object.keys(ctx.profile.follow);
    const shows = await Promise.all(ids.map((id) => getShow(id).catch(() => ({ id, title: ctx.profile.follow[id].title, next: null, services: [] }))));
    const followed = shows.map((s) => ({
      showId: s.id, title: s.title, poster: poster(s.poster || ctx.profile.follow[s.id]?.poster),
      next: s.next ? { date: s.next.date, when: relDay(s.next.date, ctx.today), season: s.next.season, episode: s.next.episode } : null,
      status: s.status || null, services: serviceNames(ctx, s.services || []),
    })).sort((a, b) => (a.next?.date || '9999').localeCompare(b.next?.date || '9999'));
    const svc = serviceNames(ctx, ctx.profile.services);
    const nextUp = followed.find((f) => f.next && f.next.date >= ctx.today);
    const say = (svc.length ? `You have ${svc.join(', ')}.` : 'You haven’t told me your streaming services yet, so I’ll include all of them.')
      + (followed.length ? ` You follow ${followed.length} show${followed.length > 1 ? 's' : ''}${nextUp ? `; next up is ${nextUp.title}, ${nextUp.next.when.toLowerCase()}` : ''}.` : ' You don’t follow any shows yet.');
    return result(say, { view: 'profile', title: 'My Streamday', services: svc, followed, today: ctx.today, isNew: !svc.length && !followed.length });
  });

  server.registerTool('set_my_services', {
    title: 'Set my streaming services',
    description: 'Remember which streaming services the viewer subscribes to (e.g. "Netflix, Stan and Binge"). Replaces the saved list; pass an empty list to include every service.',
    inputSchema: { services: z.array(z.string()).describe('Service names as the viewer said them, e.g. ["Netflix", "Disney plus", "ABC iview"]') },
    annotations: { idempotentHint: true },
  }, async ({ services }) => {
    const ctx = await context(viewerId);
    const { keys, unknown } = matchServices(services, ctx.services);
    ctx.profile.services = keys;
    await saveProfile(viewerId, ctx.profile);
    const names = serviceNames(ctx, keys);
    const say = (names.length ? `Got it: ${names.join(', ')}.` : 'Okay, I’ll include every service.') + (unknown.length ? ` I don’t cover ${unknown.join(', ')} yet.` : '');
    return result(say, { view: 'profile', title: 'Your services', services: names, unknown });
  });

  server.registerTool('follow_show', {
    title: 'Follow a show',
    description: 'Follow (or unfollow) a TV series by name so Streamday tracks its new episodes for this viewer across sessions.',
    inputSchema: { show: z.string().describe('Show name, e.g. "The Bear"'), follow: z.boolean().default(true).describe('false to unfollow') },
  }, async ({ show, follow }) => {
    const ctx = await context(viewerId);
    const hit = await resolveShow(show);
    if (!hit) return errorResult(`I couldn’t find a series called “${show}”.`);
    if (follow) ctx.profile.follow[hit.id] = { title: hit.title, poster: hit.poster || null, since: ctx.today };
    else delete ctx.profile.follow[hit.id];
    await saveProfile(viewerId, ctx.profile);
    const s = follow ? await getShow(hit.id).catch(() => null) : null;
    const next = s?.next ? ` Next episode: ${relDay(s.next.date, ctx.today).toLowerCase()}, season ${s.next.season} episode ${s.next.episode}.` : '';
    const say = follow ? `Following ${hit.title}.${next}` : `Stopped following ${hit.title}.`;
    return result(say, { view: 'show', title: hit.title, show: { showId: hit.id, title: hit.title, year: hit.year, poster: poster(hit.poster), followed: follow, next: s?.next ? { ...s.next, when: relDay(s.next.date, ctx.today) } : null, services: serviceNames(ctx, s?.services || []) } });
  });

  // --- discovery ---
  registerAppTool(server, 'whats_on', {
    title: 'What’s on',
    description: 'New releases on Australian streaming for a time window: new series, new seasons, finales, weekly episodes and movies. Defaults to the viewer’s own services.',
    inputSchema: {
      when: z.string().default('today').describe('today, tonight, tomorrow, this_weekend, this_week, next_week, just_dropped, this_month, or a date YYYY-MM-DD'),
      kind: z.enum(['any', 'premieres', 'new_series', 'new_season', 'finale', 'movie', 'episode']).default('any').describe('premieres = new series + new seasons'),
      only_my_shows: z.boolean().default(false).describe('Only shows the viewer follows'),
      all_services: z.boolean().default(false).describe('Ignore the viewer’s service list'),
    },
    annotations: { readOnlyHint: true },
    _meta: ui,
  }, async ({ when, kind, only_my_shows, all_services }) => {
    const ctx = await context(viewerId);
    const { from, to, label } = windowRange(when, ctx.today);
    const kinds = { any: null, premieres: ['new-series', 'new-season'], new_series: ['new-series'], new_season: ['new-season'], finale: ['finale'], movie: ['movie'], episode: ['episode'] }[kind];
    let drops = (await dropsBetween(from, to)).filter(visibleTo(ctx.profile, { myServicesOnly: !all_services, followedOnly: only_my_shows, kinds }));
    const order = { 'new-series': 0, 'new-season': 1, finale: 2, movie: 3, episode: 4 };
    drops.sort((a, b) => a.date.localeCompare(b.date) || (order[a.kind] - order[b.kind]) || (b.popularity || 0) - (a.popularity || 0));
    const cards = drops.slice(0, 40).map((d) => card(d, ctx));
    const ranked = [...cards].sort((a, b) => (order[a.kind] - order[b.kind]));
    return result(sayList(ranked, label), { view: 'list', title: label, subtitle: from === to ? niceDate(from) : `${niceDate(from)} to ${niceDate(to)}`, total: drops.length, cards });
  });

  registerAppTool(server, 'tonight_pick', {
    title: 'Pick something for tonight',
    description: 'Recommend what to watch tonight from what’s fresh on the viewer’s services, explaining each pick. Weighs shows they follow, premieres, mood, time available and avoids repeating recent suggestions. Remembers what it suggested.',
    inputSchema: {
      mood: z.string().optional().describe('Free text, e.g. "something light", "a thriller", "date night"'),
      minutes: z.number().int().positive().optional().describe('How long they have, in minutes'),
      count: z.number().int().min(1).max(5).default(3),
    },
    _meta: ui,
  }, async ({ mood, minutes, count }) => {
    const ctx = await context(viewerId);
    const drops = (await dropsBetween(addDays(ctx.today, -14), ctx.today)).filter(visibleTo(ctx.profile));
    const picks = rankTonight(drops, ctx, { mood, minutes, count });
    ctx.profile.history.push(...picks.map((p) => ({ showId: p.showId, title: p.title, date: ctx.today, via: 'tonight_pick' })));
    await saveProfile(viewerId, ctx.profile);
    return result(sayPicks(picks), { view: 'picks', title: 'Tonight', subtitle: mood ? `For: ${mood}` : 'Fresh on your services', cards: picks });
  });

  registerAppTool(server, 'plan_my_week', {
    title: 'Plan my viewing week',
    description: 'A night-by-night viewing plan for the next 7 days: new episodes of followed shows on their release night, then the biggest premieres on the viewer’s services on free nights.',
    inputSchema: {
      busy_days: z.array(z.string()).default([]).describe('Days they can’t watch, e.g. ["Tuesday", "Saturday"]'),
      per_night: z.number().int().min(1).max(4).default(2),
    },
    annotations: { readOnlyHint: true },
    _meta: ui,
  }, async ({ busy_days, per_night }) => {
    const ctx = await context(viewerId);
    const drops = (await dropsBetween(addDays(ctx.today, -7), addDays(ctx.today, 6))).filter(visibleTo(ctx.profile));
    const ids = Object.keys(ctx.profile.follow);
    const shows = await Promise.all(ids.map((id) => getShow(id).catch(() => null)));
    const followedNext = shows.filter((s) => s?.next).map((s) => ({ showId: s.id, title: s.title, poster: poster(s.poster), ...s.next, services: (s.services || []).map((k) => ctx.services.find((x) => x.key === k)).filter(Boolean).map((x) => ({ key: x.key, name: x.name, color: x.color })) }));
    const plan = planWeek(drops.filter((d) => d.date <= addDays(ctx.today, 6)), ctx, { busyDays: busy_days, perNight: per_night, followedNext });
    return result(sayPlan(plan), { view: 'plan', title: 'Your week', subtitle: `${niceDate(ctx.today)} to ${niceDate(addDays(ctx.today, 6))}`, days: plan });
  });

  registerAppTool(server, 'next_episode', {
    title: 'When is the next episode',
    description: 'When the next episode of a series comes out in Australia, and which services stream it (and whether the viewer has them).',
    inputSchema: { show: z.string().describe('Series name') },
    annotations: { readOnlyHint: true },
    _meta: ui,
  }, async ({ show }) => {
    const ctx = await context(viewerId);
    const hit = await resolveShow(show);
    if (!hit) return errorResult(`I couldn’t find a series called “${show}”.`);
    const s = await getShow(hit.id);
    const svc = serviceNames(ctx, s.services || []);
    const mine = new Set(ctx.profile.services);
    const hasIt = !mine.size || (s.services || []).some((k) => mine.has(k));
    let say;
    if (s.next) say = `The next episode of ${s.title}, season ${s.next.season} episode ${s.next.episode}, is out ${relDay(s.next.date, ctx.today).toLowerCase() === 'today' ? 'today' : 'on ' + niceDate(s.next.date)}`;
    else say = s.status === 'Ended' || s.status === 'Canceled' ? `${s.title} has finished its run` : `There’s no date for the next episode of ${s.title} yet`;
    say += s.next ? (svc.length ? `, on ${svc.join(' and ')}.` : '.') : (svc.length ? `. You can stream it on ${svc.join(' and ')}.` : '.');
    if (!svc.length) say += ' It isn’t streaming in Australia right now.';
    if (svc.length && !hasIt) say += ' That’s not one of your services.';
    const following = !!ctx.profile.follow[hit.id];
    if (!following) say += ' Want me to follow it?';
    return result(say, { view: 'show', title: s.title, show: { showId: s.id, title: s.title, poster: poster(s.poster), status: s.status, next: s.next ? { ...s.next, when: relDay(s.next.date, ctx.today) } : null, services: svc, onMyServices: hasIt, followed: following } });
  });

  server.registerTool('list_services', {
    title: 'Streaming services covered',
    description: 'Every Australian streaming service Streamday covers.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    const all = await getServices();
    return result(`I cover ${all.length} services: ${all.map((s) => s.name).join(', ')}.`, { view: 'services', services: all.map((s) => ({ key: s.key, name: s.name, color: s.color })) });
  });

  return server;
}

export { KIND };
