// Per-viewer memory that survives across sessions: services, followed shows, recent picks, timezone.
// Netlify Blobs in production; an in-process map when running locally without Netlify.
// The Blobs store is opened per request: its credentials are request-scoped and expire, so a store
// cached in a warm function instance fails later with "Token expired".
const local = new Map();
const NAME = 'streamday-mcp-viewers';

async function store() {
  try {
    const { getStore } = await import('@netlify/blobs');
    return getStore({ name: NAME, consistency: 'strong' }); // throws outside a Netlify context
  } catch {
    return null;
  }
}

const blank = () => ({ services: [], follow: {}, history: [], tz: null, createdAt: new Date().toISOString() });
const safeId = (id) => String(id || 'demo').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'demo';

export async function loadProfile(viewerId) {
  const key = `viewer/${safeId(viewerId)}`;
  const s = await store();
  const v = s ? await s.get(key, { type: 'json' }) : local.get(key);
  return { ...blank(), ...(v || {}) };
}

export async function saveProfile(viewerId, profile) {
  const key = `viewer/${safeId(viewerId)}`;
  profile.updatedAt = new Date().toISOString();
  profile.history = (profile.history || []).slice(-40);
  const s = await store();
  if (s) await s.setJSON(key, profile);
  else local.set(key, structuredClone(profile));
  return profile;
}
