// End-to-end check with the official MCP client over Streamable HTTP.
// Usage: node scripts/smoke.mjs [mcpUrl]   (default http://localhost:8787/mcp)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = new URL(process.argv[2] || 'http://localhost:8787/mcp');
const viewer = 'smoke-' + Date.now().toString(36);
const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers: { 'x-streamday-viewer': viewer } } });
const client = new Client({ name: 'streamday-smoke', version: '1.0.0' });
await client.connect(transport);
const v = client.getServerVersion();
console.log('connected:', v.name, v.version, '| protocol', transport.protocolVersion);

const { tools } = await client.listTools();
console.log('tools:', tools.map((t) => t.name + (t._meta?.ui?.resourceUri ? '*' : '')).join(', '), '(* = MCP App UI)');
const { resources } = await client.listResources();
console.log('resources:', resources.map((r) => `${r.uri} [${r.mimeType}]`).join(', '));
const view = await client.readResource({ uri: 'ui://streamday/cards.html' });
console.log('view html:', (view.contents[0].text.length / 1024).toFixed(0), 'KB', view.contents[0].mimeType);

const call = async (name, args = {}) => {
  const t0 = Date.now();
  const r = await client.callTool({ name, arguments: args });
  const sc = r.structuredContent || {};
  const n = sc.cards?.length ?? sc.days?.reduce((a, d) => a + d.items.length, 0) ?? sc.followed?.length ?? '';
  console.log(`\n▶ ${name} ${JSON.stringify(args)}  (${Date.now() - t0}ms${r.isError ? ', ERROR' : ''}) [${sc.view || '-'} ${n}]\n  ${r.content?.[0]?.text}`);
  return r;
};
await call('my_streamday');
await call('set_my_services', { services: ['Netflix', 'Disney plus', 'Stan', 'ABC iview', 'Optus Sport'] });
await call('whats_on', { when: 'this_week', kind: 'premieres' });
await call('whats_on', { when: 'tonight' });
await call('tonight_pick', { mood: 'something light', minutes: 60 });
await call('tonight_pick', { mood: 'something light', minutes: 60 }); // should avoid repeating
await call('next_episode', { show: 'The Bear' });
await call('follow_show', { show: 'Severance' });
await call('plan_my_week', { busy_days: ['Tuesday'] });
await call('my_streamday');
await client.close();
