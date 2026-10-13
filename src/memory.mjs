// Per-viewer memory that survives across sessions: services, followed shows, recent picks, timezone.
// Netlify Blobs in production; an in-process map when running locally without Netlify.
let blobStore = null;
const local = new Map();

async function store() {
  if (blobStore !== null) return blobStore;
  try {
    const { getStore } = await import('@netlify/blobs');
    blobStore = getStore({ name: 'streamday-mcp-viewers', consistency: 'strong' });
    await blobStore.get('__probe'); // throws outside a Netlify context
  } catch {
    blobStore = false;
  }
  return blobStore;
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
