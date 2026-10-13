// Renders Streamday tool results (structuredContent) as cards. Shared by the MCP App view and the Alexa+ simulator.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pills = (svcs = []) => svcs.map((s) => typeof s === 'string'
  ? `<span class="sd-svc">${esc(s)}</span>`
  : `<span class="sd-svc" style="--c:${esc(s.color || '#888')}"><i></i>${esc(s.name)}</span>`).join('');
const badge = (c) => c.kindLabel ? `<span class="sd-badge sd-${esc(c.kind)}">${esc(c.kindLabel)}</span>` : '';
const art = (c) => c.poster ? `<div class="sd-poster" style="background-image:url('${esc(c.poster)}')"></div>` : `<div class="sd-poster sd-none">${esc((c.title || '?')[0])}</div>`;
const followBtn = (c, interactive) => interactive && c.type === 'tv' && c.title
  ? `<button class="sd-follow" data-follow="${esc(c.title)}" data-on="${c.followed ? 1 : 0}" aria-pressed="${!!c.followed}">${c.followed ? '♥ Following' : '♡ Follow'}</button>` : '';

function cardHTML(c, { interactive, showWhy, compact } = {}) {
  if (compact) return `<article class="sd-card sd-compact" title="${esc(c.why || '')}">${art(c)}<div class="sd-body"><h3>${esc(c.title)}</h3><div class="sd-meta">${pills(c.services)}</div></div></article>`;
  return `<article class="sd-card">
    ${art(c)}
    <div class="sd-body">
      <div class="sd-when">${esc(c.when || '')}</div>
      <h3>${esc(c.title)}</h3>
      <div class="sd-detail">${esc(c.detail || '')}</div>
      ${showWhy && c.why ? `<div class="sd-why">${esc(c.why)}</div>` : ''}
      <div class="sd-meta">${badge(c)}${pills(c.services)}</div>
      ${followBtn(c, interactive)}
    </div>
  </article>`;
}

export function renderResult(sc, opts = {}) {
  if (!sc || typeof sc !== 'object') return '';
  const head = (sc.title || sc.subtitle) ? `<header class="sd-head"><h2>${esc(sc.title || '')}</h2>${sc.subtitle ? `<p>${esc(sc.subtitle)}</p>` : ''}</header>` : '';
  switch (sc.view) {
    case 'list':
      return head + (sc.cards?.length
        ? `<div class="sd-grid">${sc.cards.map((c) => cardHTML(c, opts)).join('')}</div>${sc.total > sc.cards.length ? `<p class="sd-more">+${sc.total - sc.cards.length} more</p>` : ''}`
        : '<p class="sd-empty">Nothing new on your services.</p>');
    case 'picks':
      return head + `<div class="sd-picks">${(sc.cards || []).map((c, i) => `<div class="sd-pick${i === 0 ? ' sd-top' : ''}">${c.backdrop && i === 0 ? `<div class="sd-hero" style="background-image:url('${esc(c.backdrop)}')"></div>` : ''}${cardHTML(c, { ...opts, showWhy: true })}</div>`).join('')}</div>`;
    case 'plan':
      return head + `<div class="sd-week">${(sc.days || []).map((d) => `<section class="sd-night${d.busy ? ' sd-busy' : ''}">
          <h4>${esc(d.label)}</h4>
          ${d.busy ? '<p class="sd-empty">Busy</p>' : d.items.length ? d.items.map((c) => cardHTML(c, { ...opts, compact: true })).join('') : '<p class="sd-empty">Free night</p>'}
        </section>`).join('')}</div>`;
    case 'show': {
      const s = sc.show || {};
      const next = s.next ? `Next episode ${esc(String(s.next.when).toLowerCase())}: season ${esc(s.next.season)}, episode ${esc(s.next.episode)}` : esc(s.status === 'Ended' || s.status === 'Canceled' ? 'Series has ended' : 'No next episode announced');
      return `<div class="sd-showcard">${art(s)}<div class="sd-body"><h3>${esc(s.title)}</h3><div class="sd-detail">${next}</div><div class="sd-meta">${pills(s.services)}</div>${followBtn({ ...s, type: 'tv' }, opts.interactive)}</div></div>`;
    }
    case 'profile':
      return head + `<div class="sd-profile">
        <div class="sd-meta">${sc.services?.length ? pills(sc.services) : '<span class="sd-svc">All services</span>'}</div>
        ${(sc.followed || []).length ? `<div class="sd-grid">${sc.followed.map((f) => cardHTML({ title: f.title, poster: f.poster, when: f.next ? f.next.when : (f.status === 'Ended' ? 'Ended' : 'No date yet'), detail: f.next ? `Season ${f.next.season}, episode ${f.next.episode}` : '', services: f.services, type: 'tv', followed: true }, opts)).join('')}</div>` : '<p class="sd-empty">No followed shows yet. Try “follow The Bear”.</p>'}
      </div>`;
    case 'services':
      return `<div class="sd-meta">${pills(sc.services)}</div>`;
    default:
      return sc.say ? `<p>${esc(sc.say)}</p>` : '';
  }
}

export const CARD_CSS = `
.sd-root{--bg:#0E1016;--surface:#171A22;--surface2:#1F232D;--text:#EEF0F4;--muted:#9AA1AE;--accent:#FFB547;font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--text)}
.sd-head h2{margin:0;font-size:20px;letter-spacing:-.01em}.sd-head p{margin:2px 0 10px;color:var(--muted);font-size:13px}
.sd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.sd-card,.sd-showcard{display:grid;grid-template-columns:62px 1fr;gap:12px;padding:10px;border-radius:14px;background:var(--surface);border:1px solid rgba(255,255,255,.06)}
.sd-showcard{grid-template-columns:96px 1fr}
.sd-poster{width:100%;aspect-ratio:2/3;border-radius:8px;background:var(--surface2) center/cover no-repeat;box-shadow:0 6px 16px rgba(0,0,0,.4)}
.sd-none{display:grid;place-items:center;font-weight:800;color:var(--muted);font-size:20px}
.sd-body{min-width:0}.sd-body h3{margin:1px 0 3px;font-size:15.5px;line-height:1.2}
.sd-when{font-size:13px;font-weight:700;color:#FFD08A}
.sd-detail{color:var(--text);opacity:.85;font-size:13px;margin-bottom:6px}
.sd-why{font-size:12.5px;color:#C9F0DE;margin-bottom:6px}.sd-why::before{content:"✦ ";color:#2FBF8F}
.sd-meta{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.sd-badge{font-size:11.5px;font-weight:700;padding:3px 7px;border-radius:6px;background:var(--surface2);color:var(--muted)}
.sd-new-series{background:#FFB547;color:#1A1206}.sd-new-season{background:#7C5CFF;color:#fff}.sd-finale{background:#FF5E7E;color:#fff}.sd-movie{background:#2FBF8F;color:#062017}
.sd-svc{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;padding:3px 8px;border-radius:6px;background:color-mix(in srgb,var(--c,#888) 24%,transparent)}
.sd-svc i{width:7px;height:7px;border-radius:50%;background:var(--c,#888)}
.sd-follow{margin-top:8px;font:inherit;font-size:12.5px;font-weight:700;color:var(--text);background:var(--surface2);border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:5px 12px;cursor:pointer}
.sd-follow[data-on="1"]{color:#FF5E7E;border-color:#FF5E7E}
.sd-picks{display:grid;gap:10px}.sd-pick{position:relative;border-radius:16px;overflow:hidden}
.sd-top .sd-hero{height:150px;background:center/cover no-repeat;border-radius:16px 16px 0 0}
.sd-top .sd-card{border-radius:0 0 16px 16px;margin-top:-1px;background:linear-gradient(180deg,#22202d,var(--surface))}
.sd-week{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.sd-night{background:rgba(255,255,255,.03);border-radius:14px;padding:8px}.sd-night h4{margin:2px 4px 8px;font-size:15px;color:var(--accent)}
.sd-night .sd-card{grid-template-columns:44px 1fr;margin-bottom:8px}
.sd-compact{grid-template-columns:40px 1fr;gap:9px;padding:8px}.sd-compact h3{font-size:14px}.sd-compact .sd-why{margin:5px 0 0;font-size:12px}.sd-busy{opacity:.5}
.sd-empty{color:var(--muted);margin:6px 4px}.sd-more{color:var(--muted);font-size:12.5px}
.sd-profile{display:grid;gap:10px}
`;
