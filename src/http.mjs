// Streamable HTTP endpoint (MCP spec 2025-11-25), stateless: a fresh server + transport per POST.
// Works on any Web-standard runtime (Netlify Functions, Node 18+ via the dev server, Deno, Workers).
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer } from './server.mjs';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, authorization, mcp-session-id, mcp-protocol-version, last-event-id, x-streamday-viewer',
  'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version',
};

/** Who is talking: a stable per-viewer id from the host (header), or ?viewer= on the server URL. */
export function viewerOf(req) {
  const url = new URL(req.url);
  return req.headers.get('x-streamday-viewer') || url.searchParams.get('viewer') || 'demo';
}

export async function handleMcp(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const accept = req.headers.get('accept') || '';
  if (req.method === 'GET' && accept.includes('text/html') && !accept.includes('text/event-stream')) {
    // A person opened the endpoint in a browser: explain what it is instead of returning a JSON-RPC error.
    return new Response(infoPage(new URL(req.url).origin), { status: 200, headers: { ...CORS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  }
  if (req.method !== 'POST') {
    // Stateless server: no standalone SSE stream (GET) and no sessions to delete.
    return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. POST JSON-RPC to this endpoint.' }, id: null }), { status: 405, headers: { ...CORS, 'content-type': 'application/json', allow: 'POST, OPTIONS' } });
  }
  const server = createServer({ viewerId: viewerOf(req) });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const res = await transport.handleRequest(req);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  } catch (e) {
    console.error('mcp error', e);
    return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });
  } finally {
    // Close after the response body is produced (JSON mode returns a complete body).
    queueMicrotask(() => { transport.close().catch(() => {}); server.close().catch(() => {}); });
  }
}

const TOOLS = [
  ['whats_on', 'What’s new tonight, this weekend or next week, on your services'],
  ['tonight_pick', 'Ranked picks for tonight by follows, premiere size, mood, time and popularity'],
  ['plan_my_week', 'Followed shows on their night, premieres on free nights'],
  ['next_episode', 'When the next episode of a show lands, and where'],
  ['follow_show', 'Track a series across sessions'],
  ['set_my_services', 'Save which of the 17 AU services you have'],
  ['my_streamday', 'Your services, follows and what’s next for each'],
  ['list_services', 'The 17 Australian services covered'],
];

function infoPage(origin) {
  const mcp = `${origin}/mcp`;
  const rows = TOOLS.map(([n, d]) => `<li><code>${n}</code><span>${d}</span></li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Streamday MCP endpoint</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:wght@600;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#0B0C16;--card:#151729;--line:#262A45;--text:#EEF0F4;--muted:#A3A9C2;--accent:#3EC5FF;--ok:#3DDC97}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:17px/1.55 "Atkinson Hyperlegible",system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:40px 16px 64px}
h1{font:800 clamp(28px,6vw,40px)/1.1 "Bricolage Grotesque",system-ui,sans-serif;margin:8px 0 12px}
h2{font:600 20px/1.3 "Bricolage Grotesque",system-ui,sans-serif;margin:32px 0 10px}
.pill{display:inline-flex;align-items:center;gap:8px;font-size:14px;color:var(--ok);border:1px solid var(--line);border-radius:99px;padding:4px 12px}
.pill::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--ok)}
p{color:var(--muted);margin:0 0 12px}a{color:var(--accent)}
.url{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:8px 0}
.url code{flex:1;min-width:0;overflow-wrap:anywhere;color:var(--text)}
button{font:inherit;font-size:14px;background:var(--accent);color:#04121B;border:0;border-radius:8px;padding:6px 12px;cursor:pointer}
code{font:15px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace}
ul{list-style:none;padding:0;margin:0;border:1px solid var(--line);border-radius:12px;overflow:hidden}
li{display:grid;grid-template-columns:minmax(0,170px) 1fr;gap:12px;padding:10px 14px;border-top:1px solid var(--line);background:var(--card)}
li:first-child{border-top:0}li code{color:var(--accent);overflow-wrap:anywhere}li span{color:var(--muted)}
@media (max-width:520px){li{grid-template-columns:1fr;gap:2px}}
.cta{display:inline-block;margin-top:8px;background:var(--accent);color:#04121B;text-decoration:none;font-weight:700;border-radius:10px;padding:10px 16px}
</style></head><body><main>
<span class="pill">MCP server online</span>
<h1>Streamday MCP endpoint</h1>
<p>This address is for AI assistants, not browsers. It’s a remote <a href="https://modelcontextprotocol.io">Model Context Protocol</a> server (spec 2025-11-25, Streamable HTTP) that answers “what’s new to stream tonight” across 17 Australian services, with per-viewer memory and MCP App show cards.</p>
<a class="cta" href="${origin}/">Talk to it in the Alexa+ simulator →</a>

<h2>Connect it to your assistant</h2>
<p>Add this as a remote MCP server or custom connector in Claude, ChatGPT, VS Code or any MCP host. Change <code>pick-any-name</code> to keep your services and follows separate.</p>
<div class="url"><code id="u">${mcp}?viewer=pick-any-name</code><button onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('u').textContent).then(()=>this.textContent='Copied')">Copy</button></div>
<p>Or inspect it with the MCP Inspector: <code>npx @modelcontextprotocol/inspector</code>, choose Streamable HTTP and paste the URL above.</p>

<h2>Tools</h2>
<ul>${rows}</ul>

<h2>Source</h2>
<p>Open source under MIT: <a href="https://github.com/Straya-United/streamday-mcp">github.com/Straya-United/streamday-mcp</a></p>
</main></body></html>`;
}
