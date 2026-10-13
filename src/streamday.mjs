// Data client for the public Streamday API (AU streaming release calendar built from TMDB + JustWatch).
// The MCP server never holds a TMDB key: it reads Streamday's precomputed, CDN-cached endpoints.
const BASE = (process.env.STREAMDAY_API || 'https://streamday-appforge.netlify.app').replace(/\/$/, '') + '/api';
const memo = new Map(); // key -> { at, value }
const TTL = { services: 6 * 3600e3, month: 10 * 60e3, show: 30 * 60e3, search: 30 * 60e3 };

async function get(path, ttl) {
  const hit = memo.get(path);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const r = await fetch(BASE + path, { headers: { accept: 'application/json', 'user-agent': 'streamday-mcp' } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Streamday API ${r.status} on ${path}`);
  memo.set(path, { at: Date.now(), value: body });
  if (memo.size > 300) memo.delete(memo.keys().next().value);
  return body;
}

export const getServices = async () => (await get('/services', TTL.services)).services;
export const getMonth = (ym) => get(`/month?m=${ym}`, TTL.month);
export const getShow = (id) => get(`/show/${encodeURIComponent(id)}`, TTL.show);
export const searchShows = async (q) => (await get(`/search?q=${encodeURIComponent(q)}`, TTL.search)).results || [];

const ymOf = (d) => d.slice(0, 7);
function* monthsBetween(from, to) {
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) { yield `${y}-${String(m).padStart(2, '0')}`; if (++m > 12) { m = 1; y++; } }
}

/** All drops (episodes, seasons, series, movies) released between two AU dates, inclusive. */
export async function dropsBetween(from, to) {
  const months = await Promise.all([...monthsBetween(ymOf(from), ymOf(to))].map(getMonth));
  const seen = new Set();
  return months.flatMap((m) => m.drops || []).filter((d) => d.date >= from && d.date <= to && !seen.has(d.id) && seen.add(d.id));
}

export const IMG = 'https://image.tmdb.org/t/p/';
export const poster = (p, size = 'w342') => (p ? `${IMG}${size}${p}` : null);
