// Screenshots the simulator after a few typed questions (speech off), for design review.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = process.argv[2] || 'D:/GameDevelopment/StreamdayMCP/shots/';
const b = await chromium.launch({ channel: 'chrome' });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://localhost:8787/?viewer=shot-' + Date.now().toString(36));
await p.uncheck('#speak');
await p.screenshot({ path: out + 'sim-0-idle.png' });
const askAndWait = async (q, f) => {
  await p.fill('#typeInput', q); await p.press('#typeInput', 'Enter');
  await p.waitForFunction(() => !document.querySelector('#reply').classList.contains('thinking'), null, { timeout: 60000 });
  await p.waitForTimeout(600);
  await p.screenshot({ path: out + f });
  console.log(q, '→', await p.textContent('#reply'));
};
await askAndWait("I've got Netflix, Stan and ABC iview", 'sim-1-services.png');
await askAndWait('Pick something light for tonight', 'sim-2-picks.png');
await askAndWait("Plan my week, I'm busy Thursday", 'sim-3-plan.png');
await askAndWait("What's new this week?", 'sim-4-list.png');
console.log('errors:', errors.length ? errors : 'none');
await b.close();
