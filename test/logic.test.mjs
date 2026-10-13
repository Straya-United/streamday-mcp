// Unit tests for the parts that decide what Alexa+ says: date windows, tonight's ranking, the week plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowRange, relDay, outLabel, addDays } from '../src/dates.mjs';
import { rankTonight, planWeek, visibleTo, moodGenres } from '../src/logic.mjs';

const today = '2026-10-13'; // a Tuesday
const services = [{ key: 'netflix', name: 'Netflix', color: '#E50914' }, { key: 'stan', name: 'Stan', color: '#0072CE' }, { key: 'disney', name: 'Disney+', color: '#113CCF' }];
const drop = (o) => ({ id: o.id || o.title, showId: o.showId || o.title, type: 'tv', kind: 'episode', date: today, services: ['netflix'], genres: [], popularity: 10, season: 1, epFrom: 1, epTo: 1, epCount: 1, ...o });

test('windows resolve to Australian date ranges', () => {
  assert.deepEqual(windowRange('tonight', today), { from: today, to: today, label: 'Tonight' });
  assert.equal(windowRange('tomorrow', today).from, '2026-10-14');
  assert.deepEqual([windowRange('this_weekend', today).from, windowRange('this_weekend', today).to], ['2026-10-17', '2026-10-18']);
  assert.equal(windowRange('next_week', today).from, '2026-10-19'); // next Monday
  assert.deepEqual([windowRange('just_dropped', today).from, windowRange('just_dropped', today).to], ['2026-10-06', '2026-10-12']);
  assert.equal(windowRange('2026-12-25', today).from, '2026-12-25');
});

test('relative day labels read naturally', () => {
  assert.equal(relDay(today, today), 'Today');
  assert.equal(relDay(addDays(today, 1), today), 'Tomorrow');
  assert.equal(relDay(addDays(today, -5), today), 'Last Thursday');
  assert.equal(outLabel(addDays(today, -1), today), 'out yesterday');
});

test('only the viewer’s services, and no daily soaps unless followed', () => {
  const profile = { services: ['stan'], follow: { Neighbours: {} } };
  const keep = visibleTo(profile);
  assert.equal(keep(drop({ title: 'A', services: ['netflix'] })), false);
  assert.equal(keep(drop({ title: 'B', services: ['stan'] })), true);
  assert.equal(keep(drop({ title: 'Daily', services: ['stan'], frequent: true })), false);
  assert.equal(keep(drop({ title: 'Neighbours', services: ['stan'], frequent: true })), true);
});

test('tonight pick favours followed shows, premieres and the mood, and explains why', () => {
  assert.ok(moodGenres('something light').includes('Comedy'));
  const drops = [
    drop({ title: 'Big Thriller', kind: 'new-series', genres: ['Thriller'], popularity: 90 }),
    drop({ title: 'Light Comedy', kind: 'new-season', genres: ['Comedy'], popularity: 30 }),
    drop({ title: 'My Show', kind: 'episode', genres: ['Drama'], popularity: 5 }),
  ];
  const ctx = { today, services, profile: { services: [], follow: { 'My Show': {} }, history: [] } };
  const picks = rankTonight(drops, ctx, { mood: 'something light' });
  assert.equal(picks[0].title, 'Light Comedy');
  assert.match(picks[0].why, /comedy fits the mood/);
  assert.ok(picks.findIndex((p) => p.title === 'My Show') < picks.findIndex((p) => p.title === 'Big Thriller'));
});

test('tonight pick avoids repeating recent suggestions', () => {
  const drops = [drop({ title: 'Once', kind: 'new-series', popularity: 99 }), drop({ title: 'Twice', kind: 'new-series', popularity: 50 })];
  const ctx = { today, services, profile: { services: [], follow: {}, history: [{ showId: 'Once', date: today }] } };
  assert.equal(rankTonight(drops, ctx, { count: 1 })[0].title, 'Twice');
});

test('week plan puts followed episodes on their night and keeps busy nights free', () => {
  const drops = [
    drop({ title: 'Followed', date: addDays(today, 2) }),
    drop({ title: 'Premiere', kind: 'new-series', date: today, popularity: 80 }),
    drop({ title: 'Second', kind: 'new-season', date: today, popularity: 40 }),
  ];
  const ctx = { today, services, profile: { services: [], follow: { Followed: {} }, history: [] } };
  const plan = planWeek(drops, ctx, { busyDays: ['Wednesday'], perNight: 1 });
  assert.equal(plan.length, 7);
  assert.equal(plan[2].items[0].title, 'Followed');      // Thursday, its release night
  assert.equal(plan[1].busy, true);                       // Wednesday
  assert.equal(plan[1].items.length, 0);
  assert.equal(plan[0].items[0].title, 'Premiere');       // biggest premiere first
});
