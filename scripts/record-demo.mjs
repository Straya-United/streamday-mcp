// Records the hackathon demo video: drives the live Alexa+ simulator in Chrome at 1080p, voices the viewer,
// the narrator and Alexa+ with Microsoft neural TTS (edge-tts), then mixes everything into video/streamday-demo.mp4.
// Voice input is simulated (questions are typed in while their audio plays); every answer is live.
// Usage: node scripts/record-demo.mjs [baseUrl]
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const BASE = (process.argv[2] || 'https://streamday-mcp.netlify.app').replace(/\/$/, '');
const OUT = path.resolve('video');
const AUD = path.join(OUT, 'audio');
fs.mkdirSync(AUD, { recursive: true });
const FFMPEG = spawnSync('python', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).stdout.trim();
const VOICE = { you: 'en-AU-WilliamMultilingualNeural', narrator: 'en-AU-WilliamMultilingualNeural', alexa: 'en-AU-NatashaNeural' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let n = 0;
function durationMs(file) {
  const m = spawnSync(FFMPEG, ['-i', file], { encoding: 'utf8' }).stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return Math.round(((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000);
}
function tts(text, who) {
  const file = path.join(AUD, `${String(++n).padStart(2, '0')}-${who}.mp3`);
  const spoken = text.replace(/Alexa\+/g, 'Alexa Plus').replace(/MCP/g, 'M C P').replace(/2025-11-25/g, 'twenty twenty-five, eleven, twenty-five');
  const r = spawnSync('python', ['-m', 'edge_tts', '--voice', VOICE[who], `--rate=${who === 'alexa' ? '+6%' : '+0%'}`, '--text', spoken, '--write-media', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('tts failed: ' + r.stderr);
  return { file, ms: durationMs(file) };
}

const NARRATION = {
  open: 'In Australia there are seventeen streaming services, and no easy answer to one question: what’s new tonight, on the ones I actually pay for? This is Streamday, for Alexa+.',
  how: 'Under the hood it’s a remote MCP server, built to the 2025-11-25 spec over Streamable HTTP. It has eight tools, a memory for each viewer, and show cards as an MCP App. Every call it makes shows up on the right.',
  reload: 'Now I’ll reload the page, so the simulator starts from nothing.',
  memory: 'The server still knew my services and the show I followed. Every answer came from live MCP tool calls, and the same server works in any MCP host, not just this one.',
  close: 'Streamday MCP is open source under the MIT licence. Try it live at streamday-mcp dot netlify dot app.',
};
const BEATS = [
  ['narrate', 'open'], ['narrate', 'how'],
  ['ask', 'Alexa, I’ve got Netflix, Stan and ABC iview.'],
  ['ask', 'What’s new tonight?'],
  ['ask', 'Pick something light, I’ve got about an hour.'],
  ['ask', 'When’s the next episode of Slow Horses?'],
  ['ask', 'Follow it.'],
  ['ask', 'Plan my week. I’m busy Thursday.'],
  ['narrate', 'reload'], ['reload'],
  ['ask', 'What do I follow?'],
  ['narrate', 'memory'],
  ['github'], ['narrate', 'close'],
];

// ---- pre-render the lines we know ----
console.log('rendering fixed voice lines…');
const fixed = new Map();
for (const [kind, arg] of BEATS) {
  if (kind === 'narrate') fixed.set('n:' + arg, tts(NARRATION[arg], 'narrator'));
  if (kind === 'ask') fixed.set('a:' + arg, tts(arg, 'you'));
}

// ---- page furniture for the recording (injected, not part of the product) ----
const INIT = `(() => {
  const ours = location.hostname.includes('streamday') || location.hostname === 'localhost';
  const css = \`
    #demoCap{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);max-width:1100px;padding:12px 22px;border-radius:14px;
      background:rgba(8,9,18,.86);color:#EEF0F4;font:500 24px/1.35 "Atkinson Hyperlegible",system-ui,sans-serif;text-align:center;
      box-shadow:0 10px 30px rgba(0,0,0,.45);z-index:99999;opacity:0;transition:opacity .25s}
    #demoCap.on{opacity:1}
    #demoNote{position:fixed;right:22px;bottom:14px;font:13px system-ui,sans-serif;color:#A3A9C2;z-index:99999}
    \${ours ? '.type,.tries,.voice{display:none!important} body{zoom:1.32} .room{padding-top:22px}' : ''}\`;
  const add = () => {
    if (document.getElementById('demoCap')) return;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    const c = document.createElement('div'); c.id = 'demoCap'; document.body.appendChild(c);
    if (ours) { const t = document.createElement('div'); t.id = 'demoNote'; t.textContent = 'Voice input simulated for this recording · answers are live'; document.body.appendChild(t); }
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', add) : add();
})();`;

const b = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } } });
await ctx.addInitScript(INIT);
const page = await ctx.newPage();
const t0 = Date.now();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const viewer = 'video-' + Date.now().toString(36);
await page.goto(`${BASE}/?viewer=${viewer}`, { waitUntil: 'networkidle' });
await page.evaluate(() => { const s = document.getElementById('speak'); if (s) s.checked = false; });
await sleep(1200);
const tStart = Date.now() - t0;
const audio = []; // { file, at }
const thinks = []; // { from, to } — waits for the model, trimmed to ~1 s in the final cut
const play = (clip) => audio.push({ file: clip.file, at: Date.now() - t0 });

async function caption(text) {
  await page.evaluate((t) => { const c = document.getElementById('demoCap'); if (!c) return; c.textContent = t || ''; c.classList.toggle('on', !!t); }, text);
}
async function narrate(key) {
  const clip = fixed.get('n:' + key);
  await caption(NARRATION[key]);
  play(clip);
  await sleep(clip.ms + 350);
  await caption('');
}
async function ask(text) {
  const clip = fixed.get('a:' + text);
  // "listening": mic pressed, light bar reacting, words appearing as they are said
  await page.evaluate(({ text, ms }) => {
    const bar = document.getElementById('lightbar'), mic = document.getElementById('mic');
    bar.dataset.state = 'listening'; mic.setAttribute('aria-pressed', 'true');
    document.getElementById('micLabel').textContent = 'Listening…';
    const words = text.replace(/^\s*alexa[,\s]*/i, '').split(' ');
    let i = 0;
    window.__lvl = setInterval(() => bar.style.setProperty('--level', (0.25 + Math.random() * 0.75).toFixed(2)), 90);
    window.__words = setInterval(() => { if (i < words.length) document.getElementById('heard').textContent = words.slice(0, ++i).join(' '); }, Math.max(120, (ms - 300) / words.length));
  }, { text, ms: clip.ms });
  play(clip);
  await sleep(clip.ms + 250);
  await page.evaluate((text) => {
    clearInterval(window.__lvl); clearInterval(window.__words);
    const bar = document.getElementById('lightbar'), mic = document.getElementById('mic');
    bar.style.removeProperty('--level'); mic.setAttribute('aria-pressed', 'false');
    document.getElementById('micLabel').textContent = 'Tap to talk';
    const input = document.getElementById('typeInput'); input.value = text;
    document.getElementById('typeForm').requestSubmit();
  }, text);
  const thinkFrom = Date.now() - t0;
  await page.waitForFunction(() => { const r = document.getElementById('reply'); return !r.classList.contains('thinking') && r.textContent !== 'Thinking…'; }, null, { timeout: 90000 });
  thinks.push({ from: thinkFrom, to: Date.now() - t0 });
  const reply = (await page.textContent('#reply')).trim();
  console.log(`  you: ${text}\n  alexa: ${reply}`);
  const said = tts(reply, 'alexa');
  await page.evaluate(() => { document.getElementById('lightbar').dataset.state = 'speaking'; });
  play(said);
  await sleep(said.ms + 250);
  await page.evaluate(() => { document.getElementById('lightbar').dataset.state = 'idle'; });
  await sleep(450);
}

console.log('recording…');
for (const [kind, arg] of BEATS) {
  if (kind === 'narrate') await narrate(arg);
  else if (kind === 'ask') await ask(arg);
  else if (kind === 'reload') { await page.reload({ waitUntil: 'networkidle' }); await page.evaluate(() => { const s = document.getElementById('speak'); if (s) s.checked = false; }); await sleep(1200); }
  else if (kind === 'github') {
    await page.goto('https://github.com/Straya-United/streamday-mcp', { waitUntil: 'load' });
    await sleep(800);
    page.evaluate(() => window.scrollTo({ top: 520, behavior: 'smooth' })).catch(() => {});
  }
}
await sleep(1500);
const tEnd = Date.now() - t0;
const raw = await page.video().path();
await ctx.close();
await b.close();

// ---- mix: drop the blank page load, cut each model wait down to ~1 s, lay every clip at its moment ----
const KEEP_THINK = 1000, TAIL = 150;
const cuts = thinks.map((t) => ({ from: t.from + KEEP_THINK, to: t.to - TAIL })).filter((c) => c.to > c.from);
const keeps = [];
let cursor = tStart;
for (const c of cuts) { keeps.push([cursor, c.from]); cursor = c.to; }
keeps.push([cursor, tEnd]);
const shift = (at) => at - tStart - cuts.filter((c) => c.to <= at).reduce((a, c) => a + (c.to - c.from), 0);
const total = keeps.reduce((a, [s, e]) => a + (e - s), 0);
const outFile = path.join(OUT, 'streamday-demo.mp4');
const inputs = ['-i', raw];
audio.forEach((a) => inputs.push('-i', a.file));
const vparts = keeps.map(([s, e], i) => `[0:v]trim=start=${(s / 1000).toFixed(3)}:end=${(e / 1000).toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
const vcat = `${keeps.map((_, i) => `[v${i}]`).join('')}concat=n=${keeps.length}:v=1:a=0[vout]`;
const aparts = audio.map((a, i) => { const d = Math.max(0, Math.round(shift(a.at))); return `[${i + 1}:a]adelay=${d}|${d}[a${i}]`; });
const filter = [...vparts, vcat, ...aparts, `${audio.map((_, i) => `[a${i}]`).join('')}amix=inputs=${audio.length}:normalize=0:duration=longest,apad[aout]`].join(';');
const r = spawnSync(FFMPEG, ['-y', ...inputs, '-filter_complex', filter, '-map', '[vout]', '-map', '[aout]', '-t', (total / 1000).toFixed(3),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', outFile], { encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stderr.slice(-2000)); process.exit(1); }
console.log(`\nvideo: ${outFile}  ${(total / 1000).toFixed(1)} s (raw ${((tEnd - tStart) / 1000).toFixed(1)} s, ${cuts.length} waits trimmed), ${audio.length} voice clips, page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
