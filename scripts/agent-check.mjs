// Drives /api/agent like the simulator does, one conversation, and prints replies + tool calls.
const base = process.argv[2] || 'http://localhost:8787';
const viewer = 'check-' + Date.now().toString(36);
const history = [];
const turns = [
  "What's new tonight?",
  "I've got Netflix, Stan and ABC iview",
  'Pick something light for tonight, I have about an hour',
  "When's the next episode of Slow Horses?",
  'Follow it',
  "Plan my week, I'm busy Thursday",
];
for (const text of turns) {
  const t0 = Date.now();
  const r = await fetch(base + '/api/agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, history, viewer }) });
  const out = await r.json();
  console.log(`\nYOU: ${text}  (${Date.now() - t0}ms, ${out.model || ''})`);
  if (!r.ok) { console.log('  ERROR', out.error); continue; }
  console.log('  tools:', (out.calls || []).map((c) => `${c.name}${JSON.stringify(c.args)} ${c.ms}ms`).join(' | ') || 'none');
  console.log('  screen:', out.screen ? `${out.screen.tool} → ${out.screen.structuredContent.view}` : 'none');
  console.log('  ALEXA:', out.reply);
  history.push({ role: 'user', content: text }, { role: 'assistant', content: out.reply });
}
