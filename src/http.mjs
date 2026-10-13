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
