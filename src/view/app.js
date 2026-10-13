// MCP App view: receives Streamday tool results from the host and renders cards.
// "Follow" buttons call the server's follow_show tool back through the host.
import { App } from '@modelcontextprotocol/ext-apps/app-with-deps';
import { renderResult, CARD_CSS } from './render.js';

const style = document.createElement('style');
style.textContent = CARD_CSS + `
  html,body{margin:0;background:transparent}
  body.light .sd-root{--surface:#F3F4F7;--surface2:#E6E8EE;--text:#14161C;--muted:#5D6472}
  .sd-root{padding:4px}`;
document.head.appendChild(style);

const root = document.getElementById('root');
const app = new App({ name: 'Streamday cards', version: '1.0.0' });
let last = null;

function draw(sc) {
  last = sc;
  root.innerHTML = renderResult(sc, { interactive: true });
}
app.ontoolresult = (r) => draw(r.structuredContent || { say: r.content?.find((c) => c.type === 'text')?.text });
app.onhostcontextchanged = (ctx) => document.body.classList.toggle('light', ctx.theme === 'light');

root.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-follow]');
  if (!b) return;
  const follow = b.dataset.on !== '1';
  b.disabled = true;
  try {
    await app.callServerTool({ name: 'follow_show', arguments: { show: b.dataset.follow, follow } });
    b.dataset.on = follow ? '1' : '0';
    b.textContent = follow ? '♥ Following' : '♡ Follow';
    b.setAttribute('aria-pressed', String(follow));
  } finally { b.disabled = false; }
});

await app.connect();
const ctx = app.getHostContext?.();
if (ctx?.theme === 'light') document.body.classList.add('light');
