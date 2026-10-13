// Alexa+ simulator: voice in (Web Speech API), /api/agent (MCP host + model), voice out (speechSynthesis), cards on screen.
import { renderResult, CARD_CSS } from './render.js';

const $ = (s) => document.querySelector(s);
const style = document.createElement('style');
style.textContent = CARD_CSS;
document.head.appendChild(style);

// ---------- viewer identity (per browser; the MCP server keys its memory on this) ----------
const mem = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const newId = () => 'lounge-' + Math.random().toString(36).slice(2, 8);
let viewer = new URLSearchParams(location.search).get('viewer') || mem.get('sd.viewer') || newId();
mem.set('sd.viewer', viewer);
$('#viewerId').textContent = viewer;
$('#newViewer').addEventListener('click', () => { viewer = newId(); mem.set('sd.viewer', viewer); $('#viewerId').textContent = viewer; history.length = 0; $('#calls').innerHTML = ''; $('#cards').innerHTML = ''; say('Fresh start. Which streaming services do you have?', false); });

// ---------- clock ----------
const tick = () => { $('#clock').textContent = new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }); };
tick(); setInterval(tick, 15e3);

// ---------- light bar ----------
const bar = $('#lightbar');
const setState = (s) => { bar.dataset.state = s; };

// ---------- speech out ----------
let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  voice = vs.find((v) => v.lang === 'en-AU' && /natural|online/i.test(v.name)) || vs.find((v) => v.lang === 'en-AU') || vs.find((v) => /^en-(GB|US)/.test(v.lang) && /natural|online/i.test(v.name)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function say(text, speak = $('#speak').checked) {
  $('#reply').textContent = text;
  $('#reply').classList.remove('thinking');
  if (!speak || !('speechSynthesis' in window)) { setState('idle'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice?.lang || 'en-AU'; u.rate = 1.03;
  u.onstart = () => setState('speaking');
  u.onend = u.onerror = () => setState('idle');
  speechSynthesis.speak(u);
}

// ---------- the conversation ----------
const history = [];
let busy = false;
async function ask(text) {
  text = text.replace(/^\s*(hey\s+)?alexa[,\s]*/i, '').trim();
  if (!text || busy) return;
  busy = true;
  $('#heard').textContent = text;
  $('#reply').textContent = 'Thinking…';
  $('#reply').classList.add('thinking');
  setState('thinking');
  logTurn(text);
  try {
    const r = await fetch('api/agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, history, viewer }) });
    const out = await r.json();
    if (!r.ok) throw new Error(out.error || `Request failed (${r.status})`);
    (out.calls || []).forEach(logCall);
    if (out.screen) $('#cards').innerHTML = renderResult(out.screen.structuredContent, { interactive: true });
    document.querySelector('.screen').classList.toggle('has-cards', !!$('#cards').textContent.trim());
    history.push({ role: 'user', content: text }, { role: 'assistant', content: out.reply });
    say(out.reply);
  } catch (e) {
    say(`That didn’t work: ${e.message}. Try again in a moment.`, false);
    setState('idle');
  } finally { busy = false; }
}

// Follow buttons on cards: say it, as a viewer would.
$('#cards').addEventListener('click', (e) => {
  const b = e.target.closest('[data-follow]');
  if (b) ask(`${b.dataset.on === '1' ? 'Unfollow' : 'Follow'} ${b.dataset.follow}`);
});

// ---------- under the hood ----------
let group = null;
function logTurn(text) {
  const li = document.createElement('li');
  li.className = 'group';
  li.innerHTML = '<span class="turn"></span><ol></ol>';
  li.querySelector('.turn').textContent = `You: ${text}`;
  $('#calls').prepend(li);
  group = li.querySelector('ol');
}
function logCall(c) {
  const li = document.createElement('li');
  li.className = 'new';
  const args = Object.keys(c.args || {}).length ? JSON.stringify(c.args) : '';
  li.innerHTML = `<span class="ms"></span><b></b><span class="args"></span>`;
  li.querySelector('b').textContent = `${c.name}${c.error ? ' (error)' : ''}`;
  li.querySelector('.ms').textContent = `${c.ms} ms`;
  li.querySelector('.args').textContent = args;
  (group || $('#calls')).append(li);
}

// ---------- typing + suggestions ----------
$('#typeForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#typeInput').value; $('#typeInput').value = ''; ask(v); });
$('#tries').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) ask(b.textContent); });

// ---------- speech in ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const mic = $('#mic');
let rec = null, listening = false, meter = null;
if (!SR) { mic.disabled = true; $('#micLabel').textContent = 'Voice needs Chrome or Edge'; }

async function startMeter() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext();
    const an = ctx.createAnalyser(); an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    let raf;
    const loop = () => {
      an.getByteTimeDomainData(buf);
      let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      bar.style.setProperty('--level', Math.min(1, peak / 60).toFixed(2));
      raf = requestAnimationFrame(loop);
    };
    loop();
    meter = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); ctx.close(); bar.style.removeProperty('--level'); };
  } catch { meter = null; }
}
function stopListening() {
  listening = false;
  mic.setAttribute('aria-pressed', 'false');
  $('#micLabel').textContent = 'Tap to talk';
  if (meter) { meter(); meter = null; }
  if (bar.dataset.state === 'listening') setState('idle');
}
mic.addEventListener('click', () => {
  if (!SR) return;
  if (listening) { rec?.stop(); return; }
  speechSynthesis?.cancel();
  rec = new SR();
  rec.lang = 'en-AU'; rec.interimResults = true; rec.maxAlternatives = 1;
  let finalText = '';
  rec.onresult = (e) => {
    let interim = '';
    for (const r of e.results) (r.isFinal ? (finalText = r[0].transcript) : (interim += r[0].transcript));
    $('#heard').textContent = finalText || interim;
  };
  rec.onerror = (e) => { stopListening(); if (e.error !== 'no-speech' && e.error !== 'aborted') say(`I couldn’t use the microphone (${e.error}).`, false); };
  rec.onend = () => { stopListening(); if (finalText) ask(finalText); };
  listening = true;
  mic.setAttribute('aria-pressed', 'true');
  $('#micLabel').textContent = 'Listening… tap to stop';
  $('#heard').textContent = '';
  setState('listening');
  startMeter();
  rec.start();
});
