// Simulated Alexa+ backend: an MCP *host*. It connects to the Streamday MCP server as an MCP client,
// hands the server's tools to an OpenAI model, executes the model's tool calls over MCP, and returns
// a short spoken reply plus the tool results (structuredContent) for the screen to render as cards.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-terra';
const MAX_STEPS = 5;

const PERSONA = `You are Alexa+, a voice assistant on a screen in an Australian living room, using the Streamday skill for anything about TV, movies and streaming.
Reply in one or two short spoken sentences in Australian English: no markdown, no lists, no URLs. The screen shows cards for whatever the tools return, so don't read out long lists; mention the top two or three and say the rest are on screen.
Use the tools for every question about what's on, what to watch, next episodes, following shows or the viewer's services, and trust their results. Start a new conversation by calling my_streamday so you know the viewer's services and shows.
If the viewer mentions services they have, save them with set_my_services before answering. When they like the sound of a show, offer to follow it.`;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

async function connect(mcpUrl, viewer) {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), { requestInit: { headers: { 'x-streamday-viewer': viewer } } });
  const client = new Client({ name: 'alexa-plus-simulator', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

// What the model sees from a tool: the spoken summary plus a compact version of the data (no image URLs).
function forModel(r) {
  const sc = r.structuredContent;
  const text = r.content?.filter((c) => c.type === 'text').map((c) => c.text).join('\n') || '';
  if (!sc) return text;
  const slim = (c) => c && { title: c.title, when: c.when, date: c.date, kind: c.kindLabel, detail: c.detail, services: (c.services || []).map((s) => s.name || s), why: c.why, followed: c.followed };
  const data = sc.cards ? { cards: sc.cards.slice(0, 12).map(slim), total: sc.total }
    : sc.days ? { days: sc.days.map((d) => ({ label: d.label, busy: d.busy, items: d.items.map(slim) })) }
    : sc.show ? { show: { ...sc.show, poster: undefined } }
    : sc.followed ? { services: sc.services, followed: sc.followed.map((f) => ({ title: f.title, next: f.next })) }
    : { services: sc.services };
  return `${text}\nDATA: ${JSON.stringify(data)}`;
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: 'OPENAI_API_KEY is not set on the server' }, 500);
  const { text, history = [], viewer = 'demo' } = await req.json().catch(() => ({}));
  if (!text || typeof text !== 'string') return json({ error: 'Say something first' }, 400);
  const mcpUrl = process.env.MCP_URL || new URL('/mcp', req.url).href;
  const viewerId = String(viewer).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'demo';

  const t0 = Date.now();
  const client = await connect(mcpUrl, viewerId);
  try {
    const { tools } = await client.listTools();
    const fnTools = tools.map((t) => ({ type: 'function', name: t.name, description: t.description || t.title || t.name, parameters: t.inputSchema, strict: false }));
    const ongoing = history.length > 0
      ? '\n\nThis conversation is already under way and you loaded the viewer’s profile at the start, so don’t call my_streamday again unless they ask about their profile, and only call set_my_services when they mention a change.'
      : '';
    const instructions = `${PERSONA}${ongoing}\n\nAbout the Streamday skill: ${client.getInstructions?.() || ''}`;
    const input = [
      ...history.slice(-10).filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ];
    const calls = [];
    const results = [];
    let reply = '';
    for (let step = 0; step < MAX_STEPS; step++) {
      const r = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, instructions, input, tools: fnTools, store: false, max_output_tokens: 600 }),
      });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error?.message || `OpenAI ${r.status}`);
      const fc = (out.output || []).filter((o) => o.type === 'function_call');
      if (!fc.length) { reply = out.output_text || (out.output || []).flatMap((o) => o.content || []).map((c) => c.text || '').join(' ').trim(); break; }
      input.push(...out.output.filter((o) => o.type === 'function_call' || o.type === 'reasoning'));
      for (const call of fc) {
        const args = (() => { try { return JSON.parse(call.arguments || '{}'); } catch { return {}; } })();
        const ts = Date.now();
        let res;
        try { res = await client.callTool({ name: call.name, arguments: args }); }
        catch (e) { res = { isError: true, content: [{ type: 'text', text: `Tool failed: ${e.message}` }] }; }
        calls.push({ name: call.name, args, ms: Date.now() - ts, error: !!res.isError });
        if (res.structuredContent && !res.isError) results.push({ tool: call.name, structuredContent: res.structuredContent });
        input.push({ type: 'function_call_output', call_id: call.call_id, output: forModel(res) });
      }
    }
    // The screen shows the most useful result: the last one with cards, otherwise the last result.
    const screen = [...results].reverse().find((x) => x.structuredContent.view !== 'profile' || results.length === 1) || results[results.length - 1] || null;
    return json({ reply: reply || 'Sorry, I didn’t catch that.', screen, calls, model: MODEL, ms: Date.now() - t0 });
  } catch (e) {
    console.error('agent', e);
    return json({ error: e.message }, 502);
  } finally {
    client.close().catch(() => {});
  }
}

export const config = { path: '/api/agent' };
