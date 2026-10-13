// Local dev server: /mcp (MCP server), /api/* (simulator backend) and the simulator page from web/.
// Usage: node scripts/dev.mjs [port]   — OpenAI key from OPENAI_API_KEY or a git-ignored .env file.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || 8787);
try { // KEY=VALUE lines from .env (never committed)
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}
process.env.MCP_URL ||= `http://localhost:${port}/mcp`;
const { handleMcp } = await import('../src/http.mjs');
const agent = await import('../netlify/functions/agent.mjs').catch(() => null);

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

async function toRequest(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  return new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
}
async function send(res, r) {
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === '/mcp') return send(res, await handleMcp(await toRequest(req)));
    if (url.pathname.startsWith('/api/agent') && agent) return send(res, await agent.default(await toRequest(req)));
    let file = path.join(root, 'web', decodeURIComponent(url.pathname));
    if (!file.startsWith(path.join(root, 'web'))) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return res.writeHead(404).end('not found');
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    res.writeHead(500).end(String(e));
  }
}).listen(port, () => console.log(`Streamday MCP dev on http://localhost:${port}  (MCP at /mcp, OpenAI key ${process.env.OPENAI_API_KEY ? 'found' : 'MISSING'})`));
