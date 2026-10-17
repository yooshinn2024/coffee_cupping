'use strict';
/* ========= Constants ========= */
const COLORS = ['#2c2825', '#3d6352', '#9e5a28', '#3b668c', '#8c3b4a', '#6e6a63'];
const STAGE_COLORS = { hot: '#9e3a26', warm: '#b5852b', room: '#3b668c' };
const SCALE_MAX = 10; // International 1-10 sensory & recommendation scale
const IND_KEYS = ['aroma', 'acid', 'sweet', 'bitter', 'body', 'after']; // 6 radar axes for SCA Cupping
const DAILY_IND_KEYS = ['aroma', 'acid', 'sweet', 'bitter', 'after', 'balance']; // 6 radar axes for Daily Coffee Log
// Canonical stored keys (translated on display via i18n dictionary)
const AROMA_TAGS = ['花香', '水果', '坚果巧克力', '焦糖烘烤', '香料', '泥土木质', '其他'];
const DEFECTS = ['发酵/酸臭', '涩（像浓茶）', '烟焦味', '纸板/陈旧', '土腥', '无明显瑕疵'];
const ORIGINS = ['埃塞俄比亚', '肯尼亚', '巴拿马', '哥伦比亚', '巴西', '危地马拉', '哥斯达黎加', '印尼', '云南', '拼配', '其他'];
const PROCESSES = ['水洗', '日晒', '蜜处理', '厌氧', '不清楚'];
const ROASTS = ['浅', '中浅', '中', '中深', '深'];
const GRINDS = ['极细', '细', '中细', '中', '中粗', '粗'];
const METHODS = ['手冲V60', '手冲平底', '聪明杯', '爱乐压', '法压壶', '意式美式', '奶咖', '冷萃冰咖', '摩卡壶', '挂耳咖啡机'];
const BODY_LEVELS = ['清爽', '适中', '醇厚'];
const DIAG_TAGS = ['刚刚好', '偏淡', '尖酸', '干涩', '焦苦'];
const DAILY_RATIOS = [
  { dose: 15, water: 225, l: '15g / 225ml (1:15)' },
  { dose: 15, water: 240, l: '15g / 240ml (1:16)' },
  { dose: 18, water: 270, l: '18g / 270ml (1:15)' },
  { dose: 20, water: 300, l: '20g / 300ml (1:15)' },
  { dose: 18, water: 36, l: '18g / 36ml (1:2)' },
];
const BREW_TIMES = ['1:30', '2:00', '2:15', '2:30', '3:00'];
const STEP_KEYS = ['dry', 'pour', 'wet', 'hot', 'warm', 'room', 'final'];
const LANG_NAMES = { ja: '日本語', zh: '中文', en: 'EN' };
const HTML_LANG = { ja: 'ja', zh: 'zh-CN', en: 'en' };
const LOCALE = { ja: 'ja-JP', zh: 'zh-CN', en: 'en-US' };
const PUBLIC_VIEWS = ['home', 'shared', 'init', 'login', 'register'];

/* ========= Helpers ========= */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); const tg = ks.reduce((a, k) => a[k], o); tg[last] = v; }
const avg = arr => { const a = arr.filter(x => typeof x === 'number'); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
const fmt = n => (n == null ? '–' : (Math.round(n * 10) / 10).toString());
const mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const today = () => new Date().toLocaleDateString('sv-SE');
const isDaily = s => s && s.type === 'daily';

/* ========= Internationalization ========= */
let lang = localStorage.getItem('cupping.lang');
if (!window.I18N[lang]) lang = 'ja'; // Default language: Japanese
function t(key, vars) {
  let s = getPath(window.I18N[lang], key);
  if (s == null) s = getPath(window.I18N.ja, key);
  if (s == null) return key;
  if (typeof s === 'string' && vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : vars[k]));
  return s;
}
const L = (map, v) => (v ? (window.I18N[lang][map] && window.I18N[lang][map][v]) || (window.I18N.ja[map] && window.I18N.ja[map][v]) || v : '');
const indName = k => t('ind.' + k + '.n');
const stars = n => (n ? t('rec_badge', { n }) : '');
function recFull(n) {
  if (!n) return `<span class="sub">${t('no_star')}</span>`;
  const idx = n <= 3 ? 0 : n <= 6 ? 1 : n <= 8 ? 2 : 3;
  const tiers = t('rec_tiers');
  const label = Array.isArray(tiers) ? tiers[idx] : '';
  return `<b>${n} / 10</b>${label ? ` · <span class="sub">${esc(label)}</span>` : ''}`;
}
const cupName = (c, i) => (c && c.name && c.name.trim() ? c.name.trim() : t('coffee_n', { n: (i || 0) + 1 }));
const fmtTime = ts => new Date(ts).toLocaleString(LOCALE[lang], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

/* ========= Application State ========= */
let sessions = [];     // User records (includes both daily and cupping types)
let draft = null;      // In-progress multi-cup cupping draft
let dailyDraft = null; // In-progress daily coffee draft
try { dailyDraft = JSON.parse(localStorage.getItem('cupping.dailyDraft') || 'null'); } catch (e) { dailyDraft = null; }

const state = {
  view: 'loading', user: null, loading: false, busy: false, langTouched: false,
  resultId: null, resultMode: 'main', sel: [], cmpType: 'cupping', beepedFor: null,
  homeFilter: 'all', community: null, sharedId: null, shared: null, admin: null,
  inviteCode: '', wantAdmin: false,
};

/* ========= API ========= */
async function api(method, url, body) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const res = await fetch(url, opt);
  let data = null;
  try { data = await res.json(); } catch (e) { /* Non-JSON response */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'http_' + res.status);
    err.status = res.status; err.code = data && data.error;
    throw err;
  }
  return data;
}
function errText(e) {
  const code = e && (e.code || e.message);
  return (window.I18N[lang].err && window.I18N[lang].err[code]) || t('err.generic') + code;
}
function handleErr(e, form) {
  if (e && e.status === 401) { state.user = null; go('login'); return; }
  if (form) showFormMsg(form, errText(e), false);
  else alert(errText(e));
}
function showFormMsg(form, text, ok) {
  const el = form.querySelector('.formmsg');
  if (el) { el.textContent = text; el.className = 'formmsg ' + (ok ? 'ok' : 'bad'); } else alert(text);
}
function setBanner(on) { const b = $('#banner'); if (b) { b.hidden = !on; b.textContent = on ? t('saved_offline') : ''; } }

/* Debounced auto-save for active cupping draft (600ms) */
let draftTimer = null;
function persist() { clearTimeout(draftTimer); if (draft) draftTimer = setTimeout(flushDraft, 600); }
function persistDaily() {
  try {
    if (dailyDraft) localStorage.setItem('cupping.dailyDraft', JSON.stringify(dailyDraft));
    else localStorage.removeItem('cupping.dailyDraft');
  } catch (e) { /* Ignore */ }
}
async function flushDraft() {
  clearTimeout(draftTimer); draftTimer = null;
  if (!draft || !state.user) return;
  try { await api('POST', '/api/draft', draft); setBanner(false); }
  catch (e) { if (e.status === 401) handleErr(e); else setBanner(true); }
}
window.addEventListener('pagehide', () => {
  if (draftTimer && draft && state.user) {
    clearTimeout(draftTimer); draftTimer = null;
    navigator.sendBeacon('/api/draft', new Blob([JSON.stringify(draft)], { type: 'application/json' }));
  }
});

/* ========= Data Models ========= */
function emptyStage(isTaste, keys = IND_KEYS) {
  const o = { aroma: null, tags: [], note: '' };
  if (isTaste) { keys.forEach(k => { o[k] = null; }); o.like = null; }
  return o;
}
function emptyCup() {
  return {
    name: '', origin: '', process: '', roast: '', roastDate: '',
    s: { dry: emptyStage(false), wet: emptyStage(false), hot: emptyStage(true), warm: emptyStage(true), room: emptyStage(true) },
    final: { star: null, note: '', defects: [] },
  };
}
function newDraft() {
  const cupSessions = sessions.filter(s => !isDaily(s));
  const last = cupSessions[0];
  const d = {
    type: 'cupping', date: today(), cupCount: 4,
    grind: last ? last.grind : '中粗', grindNote: last ? last.grindNote || '' : '',
    dose: last ? last.dose : 8.25, water: last ? last.water : 150, temp: last ? last.temp : 93,
    blind: false, cups: [], started: false, step: 0, pourStart: null,
  };
  syncCups(d);
  return d;
}
function syncCups(d) {
  while (d.cups.length < d.cupCount) d.cups.push(emptyCup());
  d.cups.length = d.cupCount;
}
function newDailyDraft() {
  const dailyList = sessions.filter(isDaily);
  const last = dailyList[0];
  return {
    type: 'daily',
    date: today(),
    method: last && last.method ? last.method : '手冲V60',
    grind: last && last.grind ? last.grind : '中细',
    grindNote: last ? last.grindNote || '' : '',
    dose: last && last.dose ? last.dose : 15,
    water: last && last.water ? last.water : 225,
    temp: last && last.temp != null ? last.temp : 92,
    brewTime: last && last.brewTime ? last.brewTime : '',
    cups: [{
      name: '', origin: '', process: '', roast: '', roastDate: '',
      tags: [], bodyLevel: '', diag: [],
      s: {
        hot: emptyStage(true, DAILY_IND_KEYS),
        warm: emptyStage(true, DAILY_IND_KEYS),
        room: emptyStage(true, DAILY_IND_KEYS),
      },
      final: { star: null, note: '', defects: [] },
    }],
  };
}
function recentBeans() {
  const seen = new Set();
  const out = [];
  for (const s of sessions) {
    for (const c of (s.cups || [])) {
      const nm = (c.name || '').trim();
      if (!nm || seen.has(nm)) continue;
      seen.add(nm);
      out.push({ name: nm, origin: c.origin || '', process: c.process || '', roast: c.roast || '', roastDate: c.roastDate || '' });
      if (out.length >= 6) return out;
    }
  }
  return out;
}

/* ========= UI Primitives ========= */
function chips(path, options, cur, opts = {}) {
  const tgt = opts.target ? ` data-target="${opts.target}"` : '';
  return '<div class="chips">' + options.map(o => {
    const val = typeof o === 'object' ? o.v : o, label = typeof o === 'object' ? o.l : o;
    const on = opts.multi ? (cur || []).includes(val) : cur === val;
    const rec = opts.rec === val ? ' rec' : '';
    const extra = opts.num ? ' data-num' : opts.bool ? ' data-bool' : '';
    return `<button type="button" class="chip${on ? ' on' : ''}${rec}" data-act="${opts.multi ? 'toggle' : 'set'}"${tgt}${extra} data-path="${path}" data-val="${esc(val)}">${esc(label)}</button>`;
  }).join('') + '</div>';
}
const opts = (list, map) => list.map(v => ({ v, l: L(map, v) }));
function scale(path, val, target = '') {
  const tgt = target ? ` data-target="${target}"` : '';
  return '<div class="dots">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n =>
    `<button type="button" class="dot${val === n ? ' on' : ''}" data-act="pick" data-num${tgt} data-path="${path}" data-val="${n}">${n}</button>`).join('') + '</div>';
}
function indTable(withMeaning, keys = IND_KEYS) {
  return `<table><tr><th>${t('th_ind')}</th>${withMeaning ? `<th>${t('th_meaning')}</th>` : ''}<th>${t('th_1')}</th><th>${t('th_3')}</th><th>${t('th_5')}</th></tr>` +
    keys.map(k => {
      const a = t('ind.' + k + '.a');
      return `<tr><td><b>${esc(indName(k))}</b>${withMeaning ? '' : `<br><span class="sub">${esc(t('ind.' + k + '.d'))}</span>`}</td>${withMeaning ? `<td>${esc(t('ind.' + k + '.d'))}</td>` : ''}<td>${esc(a[0])}</td><td>${esc(a[1])}</td><td>${esc(a[2])}</td></tr>`;
    }).join('') + '</table>';
}

/* ========= SVG Radar Chart (1-10 Scale) ========= */
function radar(series, keys = IND_KEYS) {
  const cx = 180, cy = 150, R = 100, n = keys.length;
  const pt = (i, v) => {
    const clamped = Math.max(0, Math.min(SCALE_MAX, v || 0));
    const a = -Math.PI / 2 + 2 * Math.PI * i / n;
    return [cx + R * clamped / SCALE_MAX * Math.cos(a), cy + R * clamped / SCALE_MAX * Math.sin(a)];
  };
  let g = '';
  for (let r = 2; r <= SCALE_MAX; r += 2) {
    g += `<polygon points="${keys.map((_, i) => pt(i, r).join(',')).join(' ')}" fill="none" stroke="#e4e0d8" stroke-width="1"/>`;
    g += `<text x="${cx + 3}" y="${cy - R * r / SCALE_MAX + 3}" font-size="9" fill="#9c968c">${r}</text>`;
  }
  keys.forEach((k, i) => {
    const [x, y] = pt(i, SCALE_MAX), [lx, ly] = pt(i, SCALE_MAX * 1.18), cos = Math.cos(-Math.PI / 2 + 2 * Math.PI * i / n);
    g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e4e0d8"/>`;
    g += `<text x="${lx}" y="${ly + 4}" font-size="12" fill="#1c1917" text-anchor="${cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle'}">${esc(indName(k))}</text>`;
  });
  series.forEach(s => {
    const pts = s.values.map((v, i) => pt(i, v == null ? 0 : v));
    g += `<polygon points="${pts.map(p => p.join(',')).join(' ')}" fill="${s.color}" fill-opacity=".12" stroke="${s.color}" stroke-width="1.8"/>`;
    pts.forEach(p => { g += `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="${s.color}"/>`; });
  });
  return `<svg class="radar" viewBox="0 0 360 300">${g}</svg>`;
}
const legend = items => '<div class="legend">' + items.map(([c, txt]) => `<span><i style="background:${c}"></i>${esc(txt)}</span>`).join('') + '</div>';
function stageVals(cup, st, keys = IND_KEYS) { return keys.map(k => (cup.s && cup.s[st] ? cup.s[st][k] : null)); }
function stageHasScore(cup, st, keys) { return keys.some(k => cup.s && cup.s[st] && typeof cup.s[st][k] === 'number'); }
function mainVals(cup, daily = false) {
  if (daily) {
    return DAILY_IND_KEYS.map(k => avg(['hot', 'warm', 'room'].map(st => (cup.s && cup.s[st] ? cup.s[st][k] : null))));
  }
  return IND_KEYS.map(k => {
    const stages = k === 'aroma' ? ['dry', 'wet', 'hot', 'warm', 'room'] : ['hot', 'warm', 'room'];
    return avg(stages.map(s => (cup.s && cup.s[s] ? cup.s[s][k] : null)));
  });
}

/* ========= Views ========= */
const views = {};
views.loading = () => `<div class="card sub">${t('loading')}</div>`;

/* --- Auth Views --- */
const authBox = (title, inner) => `<div class="authbox card"><h1>${title}</h1>${inner}</div>`;
const field = (label, name, type = 'text', extra = '') => `<label class="f">${label}</label><input type="${type}" name="${name}" ${extra}>`;
views.login = () => authBox(t('login_h'), `<form data-form="login">
    ${field(t('f_user_login'), 'username', 'text', 'autocomplete="username" required autofocus')}
    ${field(t('f_pw_login'), 'password', 'password', 'autocomplete="current-password" required')}
    <div class="formmsg"></div><button class="btn big full" type="submit">${t('btn_login')}</button></form>
  <div class="authlink"><a href="#" data-act="nav" data-view="register">${t('goto_reg')}</a></div>`);
views.register = () => authBox(t('register_h'), `<form data-form="register">
    ${field(t('f_invite'), 'invite', 'text', `value="${esc(state.inviteCode)}" required autocomplete="off" style="text-transform:uppercase"`)}
    ${field(t('f_user'), 'username', 'text', 'autocomplete="username" required pattern="[A-Za-z0-9_.\\-]{2,32}"')}
    ${field(t('f_display'), 'display_name', 'text', 'maxlength="32"')}
    ${field(t('f_pw'), 'password', 'password', 'autocomplete="new-password" required minlength="6"')}
    ${field(t('f_pw2'), 'password2', 'password', 'autocomplete="new-password" required minlength="6"')}
    <div class="formmsg"></div><button class="btn big full" type="submit">${t('btn_register')}</button></form>
  <div class="authlink"><a href="#" data-act="nav" data-view="login">${t('goto_login')}</a></div>`);
views.init = () => authBox(t('init_h'), `<div class="hint">${t('init_desc')}</div><form data-form="init">
    ${field(t('f_user'), 'username', 'text', 'autocomplete="username" required pattern="[A-Za-z0-9_.\\-]{2,32}"')}
    ${field(t('f_display'), 'display_name', 'text', 'maxlength="32"')}
    ${field(t('f_pw'), 'password', 'password', 'autocomplete="new-password" required minlength="6"')}
    ${field(t('f_pw2'), 'password2', 'password', 'autocomplete="new-password" required minlength="6"')}
    <div class="formmsg"></div><button class="btn big full" type="submit">${t('btn_init')}</button></form>`);

/* --- Shared Card Helpers --- */
function sessionTags(cups) {
  return (cups || []).map((c, i) => `<span class="tag">${esc(cupName(c, i))}${c.origin ? ' · ' + esc(L('v_origins', c.origin)) : ''}${c.roast ? ' · ' + esc(L('v_roasts', c.roast)) : ''}${c.star || (c.final && c.final.star) ? ' ' + stars(c.star || c.final.star) : ''}</span>`).join('');
}
function dailySummaryLine(s, c) {
  const parts = [];
  if (s.method) parts.push(L('v_methods', s.method));
  if (s.grind) parts.push(t('grind_x', { g: L('v_grinds', s.grind) }));
  if (s.dose && s.water) parts.push(`${s.dose}g/${s.water}ml`);
  if (s.temp != null && s.temp !== '') parts.push(`${s.temp}°C`);
  if (c && c.bodyLevel) parts.push(L('v_body', c.bodyLevel));
  return parts.join(' · ');
}
function diagTipsBox(diagList) {
  const list = (diagList || []).filter(d => L('diag_tips', d));
  if (!list.length) return '';
  return `<div class="tipbox"><b>${t('diag_title')}</b>` +
    list.map(d => `<div style="margin-top:4px"><b>${esc(L('v_diag', d))}：</b>${esc(L('diag_tips', d))}</div>`).join('') +
    `</div>`;
}

/* ========= Tab 1: Home (Community Feed, Read-Only for Guests) ========= */
views.home = () => {
  let h = `<h1>${t('home_h')}</h1><div class="sub">${t('home_sub')}</div>`;
  h += `<div class="quick-bar">
    <button class="btn" data-act="newDaily">${t('quick_daily')}</button>
    <button class="btn ghost" data-act="nav" data-view="cuppingHome">${t('quick_cupping')}</button>
  </div>`;
  const f = state.homeFilter || 'all';
  const filters = state.user ? ['all', 'daily', 'cupping', 'mine'] : ['all', 'daily', 'cupping'];
  h += `<div class="tabs">
    ${filters.map(k => `<button class="${f === k ? 'on' : ''}" data-act="homeFilter" data-val="${k}">${t('filter_' + k)}</button>`).join('')}
  </div>`;
  const all = state.community || [];
  const list = all.filter(it => {
    const tp = it.type === 'daily' ? 'daily' : 'cupping';
    if (f === 'daily') return tp === 'daily';
    if (f === 'cupping') return tp === 'cupping';
    if (f === 'mine') return !!it.mine;
    return true;
  });
  if (!list.length) return h + `<div class="card sub">${t('no_shared')}</div>`;
  list.forEach(it => {
    const daily = it.type === 'daily';
    const c0 = (it.cups && it.cups[0]) || {};
    const typeBadge = daily
      ? `<span class="badge type-daily">${t('type_daily')}</span>`
      : `<span class="badge type-cup">${t('type_cupping')}</span>`;
    const metaRight = daily
      ? `${esc([L('v_methods', it.method), it.temp ? it.temp + '°C' : ''].filter(Boolean).join(' · '))} · ${t('n_comments', { n: it.comment_count })}`
      : `${t('n_cups', { n: (it.cups || []).length })}${it.blind ? ' · ' + t('blind') : ''} · ${t('n_comments', { n: it.comment_count })}`;
    h += `<div class="card session" data-act="openShared" data-id="${esc(it.id)}">
      <div class="row spread">
        <div>${typeBadge} <b>${esc(it.author)}</b>${it.mine ? ` <span class="badge">${t('mine')}</span>` : ''} · <span class="sub">${esc(it.date)}</span></div>
        <span class="sub">${metaRight}</span>
      </div>
      <div style="margin-top:6px">${sessionTags(it.cups || [])}` +
      (daily && c0.bodyLevel ? `<span class="tag">${esc(L('v_body', c0.bodyLevel))}</span>` : '') +
      (daily && Array.isArray(c0.tags) ? c0.tags.map(tg => `<span class="tag">${esc(L('v_tags', tg))}</span>`).join('') : '') +
      `</div>` +
      (daily && c0.note ? `<div class="sub" style="margin-top:4px">“${esc(c0.note)}”</div>` : '') +
      `</div>`;
  });
  return h;
};

/* ========= Tab 2: Daily Coffee Log ========= */
function dailyGuideDetails() {
  return `<details class="card"><summary>${t('daily_guide_btn')}</summary>
    <div style="margin-top:10px">
      <div class="sub" style="margin-bottom:8px">${t('tasting_3temp_sub')}</div>
      ${indTable(true, DAILY_IND_KEYS)}
    </div>
  </details>`;
}

views.daily = () => {
  const dailyList = sessions.filter(isDaily);
  let h = `<h1>${t('daily_h')}</h1><div class="sub">${t('daily_sub')}</div>`;
  h += `<div class="quick-bar">
    <button class="btn big" data-act="newDaily">${t('btn_new_daily')}</button>
    ${dailyList.length >= 2 ? `<button class="btn ghost" data-act="cmpDaily">${t('btn_cmp_daily')}</button>` : ''}
  </div>`;
  h += dailyGuideDetails();
  if (!dailyList.length) return h + `<div class="card sub">${t('no_daily')}</div>`;
  dailyList.forEach(s => {
    const c = (s.cups && s.cups[0]) || {};
    const note = c.final && c.final.note ? c.final.note : '';
    h += `<div class="card session" data-act="open" data-id="${esc(s.id)}">
      <div class="row spread">
        <div><b>${esc(s.date)} · ${esc(cupName(c, 0))}</b> ${s.shared ? `<span class="badge">${t('shared_badge')}</span>` : `<span class="badge priv">${t('private_badge')}</span>`}</div>
        <span class="sub">${esc(dailySummaryLine(s, c))}</span>
      </div>
      <div style="margin-top:6px">
        ${c.origin ? `<span class="tag">${esc(L('v_origins', c.origin))}</span>` : ''}
        ${c.process ? `<span class="tag">${esc(L('v_processes', c.process))}</span>` : ''}
        ${c.roast ? `<span class="tag">${esc(L('v_roasts', c.roast))}</span>` : ''}
        ${(c.tags || []).map(tg => `<span class="tag">${esc(L('v_tags', tg))}</span>`).join('')}
        ${(c.diag || []).map(dg => `<span class="tag${dg === '刚刚好' ? '' : ' bad'}">${esc(L('v_diag', dg))}</span>`).join('')}
        ${c.final && c.final.star ? `<span style="margin-left:4px">${stars(c.final.star)}</span>` : ''}
      </div>
      ${note ? `<div class="sub" style="margin-top:4px">“${esc(note)}”</div>` : ''}
    </div>`;
  });
  return h;
};

views.dailyNew = () => {
  if (!dailyDraft) dailyDraft = newDailyDraft();
  const d = dailyDraft;
  const c = d.cups[0];
  const recents = recentBeans();
  const names = [...new Set(sessions.flatMap(s => (s.cups || []).map(x => x.name)).filter(Boolean))];
  let h = `<div class="row spread"><div><h1>${t('daily_h')}</h1><div class="sub">${t('daily_sub')}</div></div>
    <button class="btn ghost" data-act="nav" data-view="daily">${t('btn_back')}</button></div>
    <datalist id="names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;

  h += dailyGuideDetails();

  // 1. Bean & Brew Recipe
  h += `<div class="card"><h2>${t('sec_bean_brew')}</h2>`;
  if (recents.length) {
    h += `<div class="recent-box"><div class="sub" style="margin-bottom:4px">${t('recent_beans')}</div><div class="chips">` +
      recents.map((b, idx) => `<button type="button" class="chip" data-act="fillBean" data-idx="${idx}">${esc(b.name)}${b.roast ? ' · ' + esc(L('v_roasts', b.roast)) : ''}</button>`).join('') +
      `</div></div>`;
  }
  h += `<div class="row">
      <div><label class="f">${t('f_date')}</label><input type="date" value="${esc(d.date)}" data-bind="date" data-target="daily" style="max-width:180px"></div>
      <div style="flex:1;min-width:220px"><label class="f">${t('f_name')}</label><input type="text" list="names" placeholder="${esc(t('name_ph'))}" value="${esc(c.name)}" data-bind="cups.0.name" data-target="daily"></div>
    </div>
    <label class="f">${t('f_origin')}</label>${chips('cups.0.origin', opts(ORIGINS, 'v_origins'), c.origin, { target: 'daily' })}
    <label class="f">${t('f_process')}</label>${chips('cups.0.process', opts(PROCESSES, 'v_processes'), c.process, { target: 'daily' })}
    <label class="f">${t('f_roast')}</label>${chips('cups.0.roast', opts(ROASTS, 'v_roasts'), c.roast, { target: 'daily' })}
    <hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
    <label class="f">${t('f_method')}</label>${chips('method', opts(METHODS, 'v_methods'), d.method, { target: 'daily' })}
    <label class="f">${t('f_grind_daily')}</label>${chips('grind', opts(GRINDS, 'v_grinds'), d.grind, { target: 'daily', rec: '中细' })}
    <input type="text" placeholder="${esc(t('grind_note_ph'))}" value="${esc(d.grindNote)}" data-bind="grindNote" data-target="daily">
    <label class="f">${t('preset_ratios')} <span id="dailyRatio" class="sub"></span></label>
    <div class="chips">${DAILY_RATIOS.map(r => `<button type="button" class="chip${d.dose === r.dose && d.water === r.water ? ' on' : ''}" data-act="dailyRatio" data-dose="${r.dose}" data-water="${r.water}">${esc(r.l)}</button>`).join('')}</div>
    <div class="row">
      <input type="number" step="0.5" class="small" value="${esc(d.dose)}" data-bind="dose" data-target="daily" data-num> ${t('unit_g')}
      <input type="number" step="5" class="small" value="${esc(d.water)}" data-bind="water" data-target="daily" data-num> ${t('unit_ml')}
    </div>
    <label class="f">${t('f_temp')}</label>
    ${chips('temp', [88, 90, 92, 93, 95, 4].map(n => ({ v: n, l: n === 4 ? '4°C (Ice)' : n + '°C' })), d.temp, { target: 'daily', num: true, rec: 92 })}
    <label class="f">${t('f_brew_time')}</label>
    <div class="row">
      ${chips('brewTime', BREW_TIMES.map(v => ({ v, l: v })), d.brewTime, { target: 'daily' })}
      <input type="text" class="small" placeholder="2:15" value="${esc(d.brewTime)}" data-bind="brewTime" data-target="daily">
    </div>
  </div>`;

  // 2. Tasting Across 3 Temperature Stages (1-10)
  h += `<div class="card"><h2>${t('sec_tasting_3temp')}</h2><div class="sub">${t('tasting_3temp_sub')}</div>
    <div class="temp-grid">`;
  ['hot', 'warm', 'room'].forEach(st => {
    const s = c.s[st];
    const p = `cups.0.s.${st}`;
    h += `<div class="card temp-card ${st}">
      <div class="cuphead">${t('temp_' + st)}</div>
      <div class="sub" style="margin-bottom:8px">${t('temp_' + st + '_d')}</div>`;
    DAILY_IND_KEYS.forEach(k => {
      const a = t('ind.' + k + '.a');
      h += `<div class="ind compact">
        <div class="head"><span class="nm">${esc(indName(k))}</span><span class="ds">1–3:${esc(a[0])} · 4–6:${esc(a[1])} · 7–10:${esc(a[2])}</span></div>
        ${scale(p + '.' + k, s[k], 'daily')}
      </div>`;
    });
    h += `<label class="f">${t('f_memo')}</label><input type="text" value="${esc(s.note)}" data-bind="${p}.note" data-target="daily" placeholder="${esc(t('summary_ph'))}">
    </div>`;
  });
  h += `</div></div>`;

  // 3. Overall Impression, Diagnosis & Save
  h += `<div class="card"><h2>${t('sec_daily_final')}</h2>
    <label class="f">${t('f_tags')}</label>${chips('cups.0.tags', opts(AROMA_TAGS, 'v_tags'), c.tags, { multi: true, target: 'daily' })}
    <label class="f">${t('f_body_level')}</label>${chips('cups.0.bodyLevel', opts(BODY_LEVELS, 'v_body'), c.bodyLevel, { target: 'daily' })}
    <label class="f">${t('f_diag')}</label>${chips('cups.0.diag', opts(DIAG_TAGS, 'v_diag'), c.diag, { multi: true, target: 'daily' })}
    ${diagTipsBox(c.diag)}
    <label class="f">${t('f_star')}</label>
    <div class="sub" style="margin-bottom:4px">${t('f_star_d')}</div>
    ${scale('cups.0.final.star', c.final.star, 'daily')}
    <label class="f">${t('f_summary')}</label>
    <textarea data-bind="cups.0.final.note" data-target="daily" placeholder="${esc(t('summary_ph'))}">${esc(c.final.note)}</textarea>
    <div class="row spread" style="margin-top:16px">
      <button type="button" class="btn ghost" data-act="nav" data-view="daily">${t('btn_back')}</button>
      <div class="row">
        <button type="button" class="btn ghost big" data-act="saveDaily" data-share="0">${t('btn_save_private')}</button>
        <button type="button" class="btn big" data-act="saveDaily" data-share="1">${t('btn_save_share')}</button>
      </div>
    </div>
  </div>`;
  return h;
};

/* ========= Tab 3: Multi-Cup SCA Cupping ========= */
function cupGuideDetails() {
  return `<details class="card"><summary>${t('cup_guide_btn')}</summary>
    <div style="margin-top:10px">${views.guide()}</div>
  </details>`;
}

views.cuppingHome = () => {
  const cupSessions = sessions.filter(s => !isDaily(s));
  let h = `<h1>${t('nav_cupping')}</h1><div class="sub">${t('subtitle')}</div>`;
  if (draft) {
    const prog = draft.started ? t('draft_at', { step: t('steps.' + STEP_KEYS[draft.step]) }) : t('draft_setting');
    h += `<div class="card"><h2>${t('draft_h')}</h2><div class="sub">${esc(draft.date)} · ${t('n_cups', { n: draft.cupCount })} · ${esc(prog)}</div>
      <div class="row" style="margin-top:10px"><button class="btn" data-act="resume">${t('btn_resume')}</button><button class="btn ghost" data-act="discard">${t('btn_discard')}</button></div></div>`;
  } else {
    h += `<div class="quick-bar">
      <button class="btn big" data-act="new">${t('btn_new')}</button>
      ${cupSessions.length ? `<button class="btn ghost" data-act="cmpCup">${t('btn_cmp_cup')}</button>` : ''}
    </div>`;
  }
  h += cupGuideDetails();
  h += `<h2 style="margin-top:20px">${t('history_h')}</h2>`;
  if (!cupSessions.length) h += `<div class="card sub">${t('no_record')}</div>`;
  cupSessions.forEach(s => {
    h += `<div class="card session" data-act="open" data-id="${esc(s.id)}">
      <div class="row spread"><b>${esc(s.date)} ${s.shared ? `<span class="badge">${t('shared_badge')}</span>` : `<span class="badge priv">${t('private_badge')}</span>`}</b><span class="sub">${t('n_cups', { n: s.cups.length })} · ${esc(t('grind_x', { g: L('v_grinds', s.grind) }))} · ${esc(s.temp)}°C${s.blind ? ' · ' + t('blind') : ''}</span></div>
      <div style="margin-top:4px">${sessionTags(s.cups)}</div></div>`;
  });
  return h;
};

/* --- Cupping Setup --- */
views.setup = () => {
  const d = draft;
  const names = [...new Set(sessions.flatMap(s => (s.cups || []).map(c => c.name)).filter(Boolean))];
  let h = `<h1>${t('setup_h')}</h1><div class="sub">${t('setup_sub')}</div>
  ${cupGuideDetails()}
  <datalist id="names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
  <div class="card"><h2>${t('overall_h')}</h2>
    <label class="f">${t('f_date')}</label><input type="date" value="${esc(d.date)}" data-bind="date" style="max-width:200px">
    <label class="f">${t('f_cupCount')}</label>${chips('cupCount', [3, 4, 5].map(n => ({ v: n, l: t('n_cups', { n }) })), d.cupCount, { num: true })}
    <label class="f">${t('f_grind')}</label>${chips('grind', opts(GRINDS, 'v_grinds'), d.grind, { rec: '中粗' })}
    <input type="text" placeholder="${esc(t('grind_note_ph'))}" value="${esc(d.grindNote)}" data-bind="grindNote">
    <label class="f">${t('f_ratio')} <span id="ratio" class="sub"></span></label>
    <div class="chips"><button class="chip rec${d.dose === 8.25 && d.water === 150 ? ' on' : ''}" data-act="stdratio">${t('std_ratio')}</button></div>
    <div class="row"><input type="number" step="0.05" class="small" value="${esc(d.dose)}" data-bind="dose" data-num> ${t('unit_g')}
      <input type="number" step="5" class="small" value="${esc(d.water)}" data-bind="water" data-num> ${t('unit_ml')}</div>
    <label class="f">${t('f_temp')}</label>${chips('temp', [92, 93, 94].map(n => ({ v: n, l: n + '°C' })), d.temp, { rec: 93, num: true })}
    <label class="f">${t('f_blind')}</label>${chips('blind', [{ v: 'false', l: t('blind_off') }, { v: 'true', l: t('blind_on') }], String(d.blind), { bool: true })}
  </div>`;
  d.cups.forEach((c, i) => {
    h += `<div class="card cupcard" style="border-top-color:${COLORS[i]}"><div class="cuphead">${t('cup_n', { n: i + 1 })}</div>
      <label class="f">${t('f_name')}</label><input type="text" list="names" placeholder="${esc(t('name_ph'))}" value="${esc(c.name)}" data-bind="cups.${i}.name">
      <label class="f">${t('f_origin')}</label>${chips(`cups.${i}.origin`, opts(ORIGINS, 'v_origins'), c.origin)}
      <label class="f">${t('f_process')}</label>${chips(`cups.${i}.process`, opts(PROCESSES, 'v_processes'), c.process)}
      <label class="f">${t('f_roast')}</label>${chips(`cups.${i}.roast`, opts(ROASTS, 'v_roasts'), c.roast)}
      <label class="f">${t('f_roastDate')}</label><input type="date" value="${esc(c.roastDate)}" data-bind="cups.${i}.roastDate" style="max-width:200px"></div>`;
  });
  h += `<div class="nav"><button class="btn ghost" data-act="nav" data-view="cuppingHome">${t('btn_back')}</button><button class="btn big" data-act="start">${t('btn_start')}</button></div>`;
  return h;
};

/* --- Active Cupping Session --- */
function stepBar() {
  return '<div class="steps">' + STEP_KEYS.map((k, i) =>
    `<button class="step${i === draft.step ? ' on' : i < draft.step ? ' done' : ''}" data-act="goto" data-val="${i}">${t('steps.' + k)}</button>`).join('') + '</div>';
}
function cupTitle(c, i) {
  const nm = draft.blind ? '' : ' ' + esc(cupName(c, i));
  return `<div class="cuphead"><span style="color:${COLORS[i]}">●</span> ${t('cup_no', { n: i + 1 })}${nm}</div>`;
}
views.cupping = () => {
  const st = STEP_KEYS[draft.step];
  let h = stepBar();
  if (st === 'pour') {
    h += `<h1>${t('pour_h')}</h1><div class="hint">${t('pour_hint', { temp: esc(draft.temp) })}</div>`;
    if (!draft.pourStart) h += `<div style="text-align:center;margin:30px 0"><button class="btn big" data-act="startTimer">${t('btn_poured')}</button></div>`;
    else h += `<div id="countdown" class="big-timer"></div><div style="text-align:center"><button class="btn ghost" data-act="resetTimer">${t('btn_reset_timer')}</button></div>`;
  } else if (st === 'final') {
    h += `<h1>${t('final_h')}</h1><div class="sub">${t('final_sub')}</div><div class="grid" style="margin-top:12px">`;
    draft.cups.forEach((c, i) => {
      h += `<div class="card cupcard" style="border-top-color:${COLORS[i]}">${cupTitle(c, i)}
        <label class="f">${t('f_star')}</label><div class="sub" style="margin-bottom:4px">${t('f_star_d')}</div>${scale(`cups.${i}.final.star`, c.final.star)}
        <label class="f">${t('f_defects')}</label>${chips(`cups.${i}.final.defects`, opts(DEFECTS, 'v_defects'), c.final.defects, { multi: true })}
        <label class="f">${t('f_summary')}</label><textarea data-bind="cups.${i}.final.note" placeholder="${esc(t('summary_ph'))}">${esc(c.final.note)}</textarea></div>`;
    });
    h += '</div>';
  } else {
    const taste = ['hot', 'warm', 'room'].includes(st);
    h += `<h1>${t('steps.' + st)}：${t('stage.' + st)}</h1><div class="hint">${t('hint.' + st)}</div>`;
    if (taste) h += `<details class="card"><summary>${t('ref_h')}</summary><div style="margin-top:8px">${indTable(false)}</div></details>`;
    h += '<div class="grid" style="margin-top:12px">';
    draft.cups.forEach((c, i) => {
      const s = c.s[st], p = `cups.${i}.s.${st}`;
      h += `<div class="card cupcard" style="border-top-color:${COLORS[i]}">${cupTitle(c, i)}`;
      if (!taste) {
        h += `<div class="ind"><div class="nm">${t('aroma_int')}</div><div class="ds">${t('aroma_int_desc')}</div>${scale(p + '.aroma', s.aroma)}</div>
          <label class="f">${t('f_tags')}</label>${chips(p + '.tags', opts(AROMA_TAGS, 'v_tags'), s.tags, { multi: true })}`;
      } else {
        IND_KEYS.forEach(k => {
          const a = t('ind.' + k + '.a');
          h += `<div class="ind"><div class="nm">${esc(indName(k))}</div><div class="ds">${esc(t('ind.' + k + '.d'))}<br>1–3:${esc(a[0])} · 4–6:${esc(a[1])} · 7–10:${esc(a[2])}</div>${scale(p + '.' + k, s[k])}</div>`;
        });
        h += `<div class="ind"><div class="nm">${t('f_like')}</div><div class="dots">${['bad', 'ok', 'good'].map(v =>
          `<button class="dot like${s.like === v ? ' on' : ''}" data-act="pick" data-path="${p}.like" data-val="${v}">${L('v_likes', v)}</button>`).join('')}</div></div>`;
      }
      h += `<label class="f">${t('f_memo')}</label><textarea data-bind="${p}.note">${esc(s.note)}</textarea></div>`;
    });
    h += '</div>';
  }
  const last = draft.step === STEP_KEYS.length - 1;
  h += `<div class="nav"><button class="btn ghost" data-act="prev">${draft.step === 0 ? t('btn_back_setup') : t('btn_prev')}</button>
    <button class="btn big" data-act="${last ? 'finish' : 'next'}">${last ? t('btn_finish') : t('btn_next')}</button></div>`;
  return h;
};

/* --- Result View (Daily & Cupping) --- */
function dailyResultBody(s) {
  const c = (s.cups && s.cups[0]) || emptyCup();
  const m = state.resultMode === 'temp' ? 'temp' : 'main';
  const sub = [L('v_origins', c.origin), L('v_processes', c.process), L('v_roasts', c.roast)].filter(Boolean).join(' · ');
  const activeStages = ['hot', 'warm', 'room'].filter(st => stageHasScore(c, st, DAILY_IND_KEYS));
  let h = `<div class="tabs">
    <button class="${m === 'main' ? 'on' : ''}" data-act="mode" data-val="main">${t('tab_main')}</button>
    <button class="${m === 'temp' ? 'on' : ''}" data-act="mode" data-val="temp">${t('tab_temp')}</button>
  </div>`;
  h += `<div class="card cupcard" style="border-top-color:${COLORS[0]}">
    <div class="cuphead">${esc(cupName(c, 0))}</div>
    <div class="sub">${esc(sub) || '&nbsp;'}</div>`;
  if (m === 'temp') {
    const stagesToPlot = activeStages.length ? activeStages : ['hot', 'warm', 'room'];
    h += radar(stagesToPlot.map(k => ({ color: STAGE_COLORS[k], values: stageVals(c, k, DAILY_IND_KEYS) })), DAILY_IND_KEYS) +
      legend(stagesToPlot.map(k => [STAGE_COLORS[k], t('temp_' + k)]));
  } else {
    const mv = mainVals(c, true);
    h += radar([{ color: COLORS[0], values: mv }], DAILY_IND_KEYS);
    h += `<div class="sub" style="margin-top:6px;text-align:center">${DAILY_IND_KEYS.map((k, j) => `${esc(indName(k))} ${fmt(mv[j])}`).join(' · ')}</div>`;
  }
  const stNotes = ['hot', 'warm', 'room'].filter(st => c.s && c.s[st] && c.s[st].note);
  if (stNotes.length) {
    h += `<div style="margin-top:10px">` + stNotes.map(st => `<div class="sub"><b>${t('temp_' + st)}：</b>${esc(c.s[st].note)}</div>`).join('') + `</div>`;
  }
  h += `<h3>${t('overall')}</h3>
    <div>${recFull(c.final && c.final.star)}</div>
    <div style="margin-top:6px">
      ${c.bodyLevel ? `<span class="tag">${esc(L('v_body', c.bodyLevel))}</span>` : ''}
      ${(c.tags || []).map(tg => `<span class="tag">${esc(L('v_tags', tg))}</span>`).join('')}
      ${(c.diag || []).map(dg => `<span class="tag${dg === '刚刚好' ? '' : ' bad'}">${esc(L('v_diag', dg))}</span>`).join('')}
    </div>`;
  if (c.final && c.final.note) h += `<div style="margin-top:8px">“${esc(c.final.note)}”</div>`;
  h += diagTipsBox(c.diag);
  h += `</div>`;
  if (m === 'main') h += `<div class="sub" style="margin-top:8px">${t('daily_radar_note')}</div>`;
  return h;
}

function cupCard(c, i, mode) {
  const sub = [L('v_origins', c.origin), L('v_processes', c.process), L('v_roasts', c.roast)].filter(Boolean).join(' · ');
  let h = `<div class="card cupcard" style="border-top-color:${COLORS[i]}"><div class="cuphead">${t('cup_no', { n: i + 1 })} · ${esc(cupName(c, i))}</div><div class="sub">${esc(sub) || '&nbsp;'}</div>`;
  if (mode === 'temp') {
    h += radar(['hot', 'warm', 'room'].map(k => ({ color: STAGE_COLORS[k], values: stageVals(c, k) }))) +
      legend(['hot', 'warm', 'room'].map(k => [STAGE_COLORS[k], t('stage.' + k)]));
  } else {
    const mv = mainVals(c);
    h += radar([{ color: COLORS[i], values: mv }]);
    h += `<div class="sub" style="margin-top:6px">${IND_KEYS.map((k, j) => `${esc(indName(k))} ${fmt(mv[j])}`).join(' · ')}</div>`;
  }
  const keys = ['dry', 'wet', 'hot', 'warm', 'room'];
  h += `<h3>${t('aroma_evo')}</h3><div class="bars">${keys.map(k => { const v = c.s[k].aroma; return `<div><span style="height:${(v || 0) * 5}px"></span>${v == null ? '–' : v}<br>${t('stage_short.' + k)}</div>`; }).join('')}</div>`;
  h += `<h3>${t('overall')}</h3><div>${recFull(c.final && c.final.star)}</div>`;
  h += (c.final.defects || []).map(d => `<span class="tag${d === '无明显瑕疵' ? '' : ' bad'}">${esc(L('v_defects', d))}</span>`).join('');
  if (c.final.note) h += `<div style="margin-top:6px">“${esc(c.final.note)}”</div>`;
  const tags = [...new Set(['dry', 'wet'].flatMap(k => c.s[k].tags || []))];
  if (tags.length) h += `<div class="sub" style="margin-top:6px">${t('smelled')}${tags.map(x => esc(L('v_tags', x))).join(', ')}</div>`;
  return h + '</div>';
}
function summaryTable(cups) {
  return `<div class="card scroll"><table><tr><th>${t('th_cup')}</th>${IND_KEYS.map(k => `<th>${esc(indName(k))}</th>`).join('')}<th>${t('th_overall')}</th></tr>${cups.map((c, i) =>
    `<tr><td><span style="color:${COLORS[i]}">●</span> ${esc(cupName(c, i))}</td>${mainVals(c).map(v => `<td>${fmt(v)}</td>`).join('')}<td>${c.final.star ? stars(c.final.star) : '–'}</td></tr>`).join('')}</table></div>`;
}
function sessionMeta(s) {
  if (isDaily(s)) {
    const parts = [];
    if (s.method) parts.push(L('v_methods', s.method));
    if (s.grind) parts.push(t('grind_x', { g: L('v_grinds', s.grind) }) + (s.grindNote ? `（${s.grindNote}）` : ''));
    if (s.dose && s.water) parts.push(`${s.dose}g / ${s.water}ml`);
    if (s.temp != null && s.temp !== '') parts.push(`${s.temp}°C`);
    if (s.brewTime) parts.push(s.brewTime);
    return esc(parts.join(' · '));
  }
  return `${esc(t('grind_x', { g: L('v_grinds', s.grind) }))}${s.grindNote ? '（' + esc(s.grindNote) + '）' : ''} · ${esc(s.dose)}g / ${esc(s.water)}ml · ${esc(s.temp)}°C${s.blind ? ' · ' + t('blind') : ''}`;
}
function resultBody(s) {
  if (isDaily(s)) return dailyResultBody(s);
  const m = state.resultMode;
  let h = `<div class="tabs">${['main', 'temp', 'cmp'].map(k => `<button class="${m === k ? 'on' : ''}" data-act="mode" data-val="${k}">${t('tab_' + k)}</button>`).join('')}</div>`;
  if (m === 'cmp') {
    h += `<div class="card">${radar(s.cups.map((c, i) => ({ color: COLORS[i], values: mainVals(c) })))}${legend(s.cups.map((c, i) => [COLORS[i], `${i + 1}. ${cupName(c, i)}`]))}</div>` + summaryTable(s.cups);
  } else {
    h += '<div class="grid">' + s.cups.map((c, i) => cupCard(c, i, m)).join('') + '</div>';
  }
  if (m === 'main') h += `<div class="sub" style="margin-top:10px">${t('radar_note')}</div>`;
  return h;
}
views.result = () => {
  const s = sessions.find(x => x.id === state.resultId);
  if (!s) return `<p>${t('not_found')}</p>`;
  const backView = isDaily(s) ? 'daily' : 'cuppingHome';
  const titlePrefix = isDaily(s) ? t('daily_h') : t('result_h');
  let h = `<div class="row spread"><div><h1>${titlePrefix} · ${esc(s.date)}</h1><div class="sub">${sessionMeta(s)}</div></div>
    <div class="row"><button class="btn ghost" data-act="nav" data-view="${backView}">${t('btn_back_list')}</button><button class="btn danger" data-act="delSession" data-id="${esc(s.id)}">${t('btn_delete')}</button></div></div>`;
  h += `<div class="card sharebox row spread">${s.shared
    ? `<span>${t('shared_note')}</span><span class="row"><button class="btn ghost" data-act="openShared" data-id="${esc(s.id)}">${t('btn_view_shared')}</button><button class="btn ghost" data-act="share" data-id="${esc(s.id)}" data-val="0">${t('btn_unshare')}</button></span>`
    : `<span class="sub">${t('home_sub')}</span><button class="btn" data-act="share" data-id="${esc(s.id)}" data-val="1">${t('btn_share')}</button>`}</div>`;
  return h + resultBody(s);
};

/* --- Radar Comparison View --- */
views.compare = () => {
  const dailyMode = state.cmpType === 'daily';
  const keys = dailyMode ? DAILY_IND_KEYS : IND_KEYS;
  const backView = dailyMode ? 'daily' : 'cuppingHome';
  const items = [];
  sessions.filter(s => isDaily(s) === dailyMode).forEach(s => (s.cups || []).forEach((c, i) => items.push({ key: s.id + ':' + i, s, c, i })));
  const sel = state.sel.map(k => items.find(x => x.key === k)).filter(Boolean);
  let h = `<div class="row spread"><div><h1>${dailyMode ? t('btn_cmp_daily') : t('compare_h')}</h1><div class="sub">${t('compare_sub')}</div></div>
    <button class="btn ghost" data-act="nav" data-view="${backView}">${t('btn_back')}</button></div>`;
  if (!items.length) return h + `<div class="card sub">${t('no_record')}</div>`;
  if (sel.length) {
    const cols = sel.map((_, k) => COLORS[k % COLORS.length]);
    h += `<div class="card">${radar(sel.map((x, k) => ({ color: cols[k], values: mainVals(x.c, dailyMode) })), keys)}${legend(sel.map((x, k) => [cols[k], `${x.s.date} ${cupName(x.c, x.i)}`]))}</div>`;
  }
  h += '<div class="card">' + items.map(x => `<div class="row" style="padding:6px 0;border-bottom:1px solid #f0ede6">
    <label style="display:flex;gap:10px;align-items:center;cursor:pointer;width:100%"><input type="checkbox" data-act="selCup" data-key="${esc(x.key)}" ${state.sel.includes(x.key) ? 'checked' : ''} style="width:18px;height:18px">
    <span><b>${esc(cupName(x.c, x.i))}</b> <span class="sub">${esc(x.s.date)}${x.s.method ? ' · ' + esc(L('v_methods', x.s.method)) : ''}${x.c.roast ? ' · ' + esc(L('v_roasts', x.c.roast)) : ''}${x.c.origin ? ' · ' + esc(L('v_origins', x.c.origin)) : ''}${x.c.final && x.c.final.star ? ' · ' + stars(x.c.final.star) : ''}</span></span></label></div>`).join('') + '</div>';
  return h;
};

/* --- Shared Record Detail & Comments --- */
views.shared = () => {
  const d = state.shared;
  if (!d) return `<p>${t('not_found')}</p>`;
  const s = d.cupping;
  const typeBadge = isDaily(s)
    ? `<span class="badge type-daily">${t('type_daily')}</span>`
    : `<span class="badge type-cup">${t('type_cupping')}</span>`;
  let h = `<div class="row spread"><div><h1>${typeBadge} ${esc(t('by_author', { name: s.author }))} · ${esc(s.date)}</h1><div class="sub">${sessionMeta(s)}</div></div>
    <button class="btn ghost" data-act="nav" data-view="home">${t('btn_back_list')}</button></div>`;
  h += resultBody(s);
  h += `<div class="card"><h2>${t('comments_h')}</h2>`;
  if (!d.comments.length) h += `<div class="sub">${t('no_comments')}</div>`;
  d.comments.forEach(m => {
    h += `<div class="comment"><div class="row spread"><b>${esc(m.author)}</b><span class="sub">${esc(fmtTime(m.created_at))}${m.can_delete ? ` <button class="linkbtn" data-act="delComment" data-id="${m.id}">✕</button>` : ''}</span></div>
      <div class="cbody">${esc(m.body).replace(/\n/g, '<br>')}</div></div>`;
  });
  if (s.shared) {
    if (state.user) {
      h += `<form data-form="comment" style="margin-top:12px"><textarea name="body" maxlength="1000" placeholder="${esc(t('comment_ph'))}" required></textarea>
        <div class="formmsg"></div><div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn" type="submit">${t('btn_send')}</button></div></form>`;
    } else {
      h += `<div style="margin-top:12px"><button class="btn ghost" data-act="nav" data-view="login">${t('login_to_comment')}</button></div>`;
    }
  }
  return h + '</div>';
};

/* --- Reference Guide --- */
views.guide = () => t('guide').replace('{table}', indTable(true));

/* --- Account Settings & Backup --- */
views.settings = () => {
  const u = state.user;
  return `<h1>${t('settings_h')}</h1>
  <div class="card"><h2>${t('account_h')}</h2><div class="sub">${esc(u.username)}${u.is_admin ? ' · ' + t('role_admin') : ''}</div>
    <form data-form="profile"><label class="f">${t('f_display_short')}</label>
      <div class="row"><input type="text" name="display_name" value="${esc(u.display_name)}" maxlength="32" required style="max-width:280px"><button class="btn" type="submit">${t('btn_save')}</button></div>
      <div class="formmsg"></div></form></div>
  <div class="card"><h2>${t('pw_h')}</h2><form data-form="password" style="max-width:360px">
    ${field(t('f_old_pw'), 'old', 'password', 'autocomplete="current-password" required')}
    ${field(t('f_new_pw'), 'new', 'password', 'autocomplete="new-password" required minlength="6"')}
    ${field(t('f_pw2'), 'new2', 'password', 'autocomplete="new-password" required minlength="6"')}
    <div class="formmsg"></div><button class="btn" type="submit" style="margin-top:10px">${t('btn_change_pw')}</button></form></div>
  <div class="card"><h2>${t('backup_h')}</h2><div>${t('backup_desc')}</div>
    <div class="row" style="margin-top:12px"><button class="btn" data-act="export">${t('btn_export', { n: sessions.length })}</button>
    <label class="btn ghost" style="cursor:pointer">${t('btn_import')}<input type="file" accept=".json,application/json" id="importFile" style="display:none"></label></div>
    <div class="sub" style="margin-top:8px">${t('import_note')}</div></div>`;
};

/* --- Admin Console (accessible via /admin or /#admin) --- */
const inviteLink = code => `${location.origin}/#invite=${code}`;
views.admin = () => {
  const a = state.admin || { users: [], invites: [] };
  let h = `<div class="row spread"><h1>${t('admin_h')}</h1><button class="btn ghost" data-act="nav" data-view="home">${t('btn_home')}</button></div>
  <div class="card"><div class="row spread"><h2>${t('invites_h')}</h2><button class="btn" data-act="genInvite">${t('btn_gen_invite')}</button></div>
    <div class="sub">${t('invite_hint')}</div><div class="scroll"><table style="margin-top:8px"><tr><th>${t('th_code')}</th><th>${t('th_status')}</th><th>${t('th_link')}</th><th></th></tr>`;
  a.invites.forEach(i => {
    const status = i.revoked ? t('st_revoked') : i.used_at ? t('st_used', { name: i.used_by_name || '?' }) : t('st_unused');
    const usable = !i.revoked && !i.used_at;
    h += `<tr><td><code>${esc(i.code)}</code></td><td>${esc(status)}</td>
      <td>${usable ? `<code class="small">${esc(inviteLink(i.code))}</code>` : ''}</td>
      <td class="nowrap">${usable ? `<button class="btn ghost sm" data-act="copyInvite" data-val="${esc(i.code)}">${t('btn_copy')}</button> <button class="btn ghost sm" data-act="revokeInvite" data-val="${esc(i.code)}">${t('btn_revoke')}</button>` : ''}</td></tr>`;
  });
  h += `</table></div></div>
  <div class="card"><h2>${t('users_h')}</h2><div class="scroll"><table><tr><th>${t('th_user')}</th><th>${t('th_role')}</th><th>${t('th_records')}</th><th></th></tr>`;
  a.users.forEach(u => {
    h += `<tr><td><b>${esc(u.display_name)}</b> <span class="sub">@${esc(u.username)}</span>${u.disabled ? ` <span class="tag bad">${t('st_disabled')}</span>` : ''}</td>
      <td>${u.is_admin ? t('role_admin') : t('role_user')}</td><td>${u.cupping_count}</td>
      <td class="nowrap">${u.is_admin ? '' : `<button class="btn ghost sm" data-act="toggleUser" data-id="${u.id}" data-val="${u.disabled ? 0 : 1}">${u.disabled ? t('btn_enable') : t('btn_disable')}</button> <button class="btn ghost sm" data-act="resetPw" data-id="${u.id}">${t('btn_reset_pw')}</button>`}</td></tr>`;
  });
  h += `</table></div></div>
  <div class="card"><h2>${t('dbbackup_h')}</h2><div class="sub">${t('dbbackup_desc')}</div><a class="btn ghost" style="display:inline-block;margin-top:10px;text-decoration:none" href="/api/admin/backup">${t('btn_dl_db')}</a></div>`;
  return h;
};

/* ========= Rendering & Navigation ========= */
function activeNavTab() {
  const v = state.view;
  if (v === 'shared') return 'home';
  if (v === 'dailyNew') return 'daily';
  if (v === 'setup' || v === 'cupping') return 'cuppingHome';
  if (v === 'result') {
    const s = sessions.find(x => x.id === state.resultId);
    return isDaily(s) ? 'daily' : 'cuppingHome';
  }
  if (v === 'compare') return state.cmpType === 'daily' ? 'daily' : 'cuppingHome';
  return v;
}
function renderTopbar() {
  const u = state.user;
  const active = activeNavTab();
  const mainTabs = [
    { v: 'home', l: t('nav_home') },
    { v: 'daily', l: t('nav_daily') },
    { v: 'cuppingHome', l: t('nav_cupping') },
  ];
  const navHtml = mainTabs.map(x => `<button data-act="nav" data-view="${x.v}" class="main-tab${active === x.v ? ' on' : ''}">${x.l}</button>`).join('');
  $('#topbar').innerHTML = `<div class="brand" data-act="nav" data-view="home">${t('brand')}</div>
    <nav>${navHtml}</nav>
    <div class="right"><div id="elapsed" class="elapsed"></div>
      <div class="langs">${Object.keys(LANG_NAMES).map(l => `<button data-act="lang" data-val="${l}" class="${l === lang ? 'on' : ''}">${LANG_NAMES[l]}</button>`).join('')}</div>
      ${u
        ? `<span class="who" data-act="nav" data-view="settings">${esc(u.display_name)} · ${t('nav_settings')}</span><button class="logout" data-act="logout">${t('logout')}</button>`
        : `<button class="login-btn" data-act="nav" data-view="login">${t('nav_login')}</button>`}</div>`;
}
function render() {
  if (!state.user && !PUBLIC_VIEWS.includes(state.view) && state.view !== 'loading') {
    state.view = state.needsFirstRun ? 'init' : 'login';
  }
  if (['setup', 'cupping'].includes(state.view) && !draft) state.view = 'cuppingHome';
  document.documentElement.lang = HTML_LANG[lang];
  document.title = t('brand');
  renderTopbar();
  const y = window.scrollY;
  $('#app').innerHTML = state.loading ? views.loading() : views[state.view]();
  const foot = $('#foot');
  if (foot) foot.textContent = t('brand') + (state.version ? ' · v' + state.version : '');
  if (state.view === 'setup' || state.view === 'dailyNew') updateRatio();
  tick();
  window.scrollTo(0, y);
}
const loaders = {
  home: async () => { state.community = (await api('GET', '/api/shared')).items; },
  shared: async () => { state.shared = await api('GET', '/api/shared/' + encodeURIComponent(state.sharedId)); },
  admin: async () => { state.admin = await api('GET', '/api/admin/overview'); },
};
async function go(view) {
  if (!state.user && !PUBLIC_VIEWS.includes(view)) {
    state.view = state.needsFirstRun ? 'init' : 'login';
    render(); window.scrollTo(0, 0);
    return;
  }
  state.view = view;
  if (loaders[view]) {
    state.loading = true; render();
    try { await loaders[view](); } catch (e) { state.loading = false; handleErr(e); return; }
    state.loading = false;
  }
  render(); window.scrollTo(0, 0);
}
function updateRatio() {
  const el = $('#ratio');
  if (el && draft && draft.dose > 0) el.textContent = '≈ 1:' + (draft.water / draft.dose).toFixed(1);
  const del = $('#dailyRatio');
  if (del && dailyDraft && dailyDraft.dose > 0) del.textContent = '≈ 1:' + (dailyDraft.water / dailyDraft.dose).toFixed(1);
}
function parseVal(el) {
  if (el.dataset.bool !== undefined) return el.dataset.val === 'true';
  return el.dataset.num !== undefined ? Number(el.dataset.val) : el.dataset.val;
}
function targetObj(el) { return el && el.dataset.target === 'daily' ? dailyDraft : draft; }
function saveTarget(el) { if (el && el.dataset.target === 'daily') persistDaily(); else persist(); }
function setLangLocal(l) { lang = l; localStorage.setItem('cupping.lang', l); }
async function reloadSessions() { sessions = (await api('GET', '/api/cuppings')).cuppings; }
async function onLoggedIn(user) {
  state.user = user;
  if (state.langTouched && user.lang !== lang) { api('POST', '/api/lang', { lang }).catch(() => {}); state.user.lang = lang; }
  else if (user.lang && window.I18N[user.lang]) setLangLocal(user.lang);
  const [c, d] = await Promise.all([api('GET', '/api/cuppings'), api('GET', '/api/draft')]);
  sessions = c.cuppings;
  draft = d.draft;
  if (draft) syncCups(draft);
  const target = state.wantAdmin && user.is_admin ? 'admin' : 'home';
  state.wantAdmin = false;
  if (location.hash || location.pathname !== '/') history.replaceState(null, '', '/');
  go(target);
}
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); alert(t('copied') + '\n' + text); return; }
  } catch (e) { /* Fallback */ }
  prompt(t('copy_prompt'), text);
}

/* ========= Event Actions ========= */
const actions = {
  nav: el => go(el.dataset.view),
  homeFilter: el => { state.homeFilter = el.dataset.val; render(); },
  lang: el => {
    setLangLocal(el.dataset.val); state.langTouched = true;
    if (state.user) { state.user.lang = lang; api('POST', '/api/lang', { lang }).catch(() => {}); }
    render(); setBanner(!$('#banner').hidden);
  },
  logout: async () => {
    await flushDraft();
    await api('POST', '/api/logout').catch(() => {});
    state.user = null; sessions = []; draft = null; state.sel = [];
    go('home');
  },
  newDaily: () => {
    if (!state.user) return go('login');
    if (!dailyDraft) dailyDraft = newDailyDraft();
    persistDaily();
    go('dailyNew');
  },
  fillBean: el => {
    const b = recentBeans()[Number(el.dataset.idx)];
    if (!b || !dailyDraft) return;
    const c = dailyDraft.cups[0];
    c.name = b.name; c.origin = b.origin; c.process = b.process; c.roast = b.roast; c.roastDate = b.roastDate;
    persistDaily(); render();
  },
  dailyRatio: el => {
    if (!dailyDraft) return;
    dailyDraft.dose = Number(el.dataset.dose);
    dailyDraft.water = Number(el.dataset.water);
    persistDaily(); render();
  },
  saveDaily: async el => {
    if (state.busy || !dailyDraft) return;
    state.busy = true;
    try {
      const wantShare = el.dataset.share === '1';
      const s = JSON.parse(JSON.stringify(dailyDraft));
      s.type = 'daily';
      s.finishedAt = Date.now();
      s.shared = wantShare;
      const r = await api('POST', '/api/cuppings', s);
      s.id = r.id; s.shared = !!r.shared;
      sessions.unshift(s);
      dailyDraft = null; persistDaily();
      state.resultId = r.id; state.resultMode = 'main';
      go('result');
    } finally { state.busy = false; }
  },
  cmpDaily: () => { state.cmpType = 'daily'; state.sel = []; go('compare'); },
  cmpCup: () => { state.cmpType = 'cupping'; state.sel = []; go('compare'); },
  new: () => { draft = newDraft(); persist(); go('setup'); },
  resume: () => go(draft.started ? 'cupping' : 'setup'),
  discard: async () => {
    if (!confirm(t('confirm_discard'))) return;
    clearTimeout(draftTimer); draftTimer = null; draft = null; render();
    await api('DELETE', '/api/draft');
  },
  set: el => {
    const obj = targetObj(el);
    if (!obj) return;
    setPath(obj, el.dataset.path, parseVal(el));
    if (el.dataset.path === 'cupCount') syncCups(obj);
    saveTarget(el); render();
  },
  stdratio: () => { draft.dose = 8.25; draft.water = 150; persist(); render(); },
  toggle: el => {
    const obj = targetObj(el);
    if (!obj) return;
    const arr = getPath(obj, el.dataset.path), v = el.dataset.val, i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1); else arr.push(v);
    saveTarget(el); render();
  },
  pick: el => {
    const obj = targetObj(el);
    if (!obj) return;
    const v = parseVal(el), cur = getPath(obj, el.dataset.path);
    setPath(obj, el.dataset.path, cur === v ? null : v); saveTarget(el); render();
  },
  start: () => { draft.started = true; draft.step = 0; persist(); go('cupping'); },
  prev: () => { if (draft.step === 0) go('setup'); else { draft.step--; persist(); go('cupping'); } },
  next: () => { draft.step++; persist(); go('cupping'); },
  goto: el => { draft.step = Number(el.dataset.val); persist(); go('cupping'); },
  startTimer: () => { draft.pourStart = Date.now(); state.beepedFor = null; persist(); render(); },
  resetTimer: () => { if (confirm(t('confirm_reset_timer'))) { draft.pourStart = Date.now(); state.beepedFor = null; persist(); render(); } },
  finish: async () => {
    if (state.busy) return;
    state.busy = true;
    clearTimeout(draftTimer); draftTimer = null;
    try {
      const s = JSON.parse(JSON.stringify(draft));
      s.type = 'cupping';
      s.finishedAt = Date.now(); delete s.started; delete s.step;
      const r = await api('POST', '/api/cuppings', s);
      s.id = r.id; s.shared = false;
      sessions.unshift(s);
      draft = null;
      api('DELETE', '/api/draft').catch(() => {});
      state.resultId = r.id; state.resultMode = 'main';
      go('result');
    } catch (e) { persist(); throw e; } finally { state.busy = false; }
  },
  open: el => { state.resultId = el.dataset.id; state.resultMode = 'main'; go('result'); },
  mode: el => { state.resultMode = el.dataset.val; render(); },
  delSession: async el => {
    if (!confirm(t('confirm_delete'))) return;
    const target = sessions.find(s => s.id === el.dataset.id);
    const back = isDaily(target) ? 'daily' : 'cuppingHome';
    await api('DELETE', '/api/cuppings/' + encodeURIComponent(el.dataset.id));
    sessions = sessions.filter(s => s.id !== el.dataset.id);
    state.sel = state.sel.filter(k => !k.startsWith(el.dataset.id + ':'));
    go(back);
  },
  share: async el => {
    const on = el.dataset.val === '1';
    await api('POST', `/api/cuppings/${encodeURIComponent(el.dataset.id)}/share`, { shared: on });
    const s = sessions.find(x => x.id === el.dataset.id);
    if (s) s.shared = on;
    render();
  },
  openShared: el => { state.sharedId = el.dataset.id; state.resultMode = 'main'; go('shared'); },
  delComment: async el => {
    if (!confirm(t('confirm_del_comment'))) return;
    await api('DELETE', '/api/comments/' + el.dataset.id);
    await loaders.shared(); render();
  },
  selCup: el => {
    const k = el.dataset.key, i = state.sel.indexOf(k);
    if (i >= 0) state.sel.splice(i, 1);
    else if (state.sel.length >= 6) { alert(t('max6')); el.checked = false; return; }
    else state.sel.push(k);
    render();
  },
  export: () => {
    const data = sessions.map(s => { const c = { ...s }; delete c.shared; return c; });
    const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), sessions: data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'coffee-cupping-' + today() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
  },
  genInvite: async () => {
    const r = await api('POST', '/api/admin/invites');
    await loaders.admin(); render();
    copyText(inviteLink(r.code));
  },
  copyInvite: el => copyText(inviteLink(el.dataset.val)),
  revokeInvite: async el => { await api('POST', `/api/admin/invites/${encodeURIComponent(el.dataset.val)}/revoke`); await loaders.admin(); render(); },
  toggleUser: async el => {
    await api('POST', `/api/admin/users/${el.dataset.id}/disable`, { disabled: el.dataset.val === '1' });
    await loaders.admin(); render();
  },
  resetPw: async el => {
    const pw = prompt(t('prompt_new_pw'));
    if (!pw) return;
    await api('POST', `/api/admin/users/${el.dataset.id}/reset_pw`, { password: pw });
    alert(t('pw_reset_ok'));
  },
};

const forms = {
  login: async d => { const r = await api('POST', '/api/login', { username: d.username, password: d.password }); await onLoggedIn(r.user); },
  register: async (d, f) => {
    if (d.password !== d.password2) return showFormMsg(f, t('err.pw_mismatch'), false);
    const r = await api('POST', '/api/register', { invite: d.invite, username: d.username, display_name: d.display_name, password: d.password, lang });
    await onLoggedIn(r.user);
  },
  init: async (d, f) => {
    if (d.password !== d.password2) return showFormMsg(f, t('err.pw_mismatch'), false);
    const r = await api('POST', '/api/init', { username: d.username, display_name: d.display_name, password: d.password, lang });
    await onLoggedIn(r.user);
  },
  profile: async (d, f) => {
    await api('POST', '/api/profile', { display_name: d.display_name });
    state.user.display_name = d.display_name.trim();
    renderTopbar(); tick(); showFormMsg(f, t('saved'), true);
  },
  password: async (d, f) => {
    if (d.new !== d.new2) return showFormMsg(f, t('err.pw_mismatch'), false);
    await api('POST', '/api/password', { old: d.old, new: d.new });
    f.reset(); showFormMsg(f, t('saved'), true);
  },
  comment: async (d, f) => {
    await api('POST', `/api/shared/${encodeURIComponent(state.sharedId)}/comments`, { body: d.body });
    await loaders.shared(); render();
    f = null;
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  if (el.tagName === 'A') e.preventDefault();
  const f = actions[el.dataset.act];
  if (f) Promise.resolve().then(() => f(el)).catch(err => handleErr(err));
});
document.addEventListener('submit', async e => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(f));
  const btn = f.querySelector('[type=submit]');
  if (btn) btn.disabled = true;
  try { await forms[f.dataset.form](data, f); } catch (err) { handleErr(err, f); } finally { if (btn) btn.disabled = false; }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset && el.dataset.act === 'selCup') actions.selCup(el);
  if (el.id === 'importFile' && el.files[0]) {
    const r = new FileReader();
    r.onload = async () => {
      let data;
      try { data = JSON.parse(r.result); } catch (err) { alert(t('import_fail')); return; }
      const list = Array.isArray(data) ? data : data.sessions;
      if (!Array.isArray(list)) { alert(t('import_fail')); return; }
      try {
        const res = await api('POST', '/api/import', { sessions: list });
        await reloadSessions();
        alert(t('import_done', { n: res.imported })); render();
      } catch (err) { handleErr(err); }
    };
    r.readAsText(el.files[0]);
    el.value = '';
  }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (!el.dataset || !el.dataset.bind) return;
  const obj = targetObj(el);
  if (!obj) return;
  let v = el.value;
  if (el.dataset.num !== undefined) v = v === '' ? null : Number(v);
  setPath(obj, el.dataset.bind, v);
  saveTarget(el);
  if (el.dataset.bind === 'dose' || el.dataset.bind === 'water') updateRatio();
});

/* ========= Steep Timer & Audio Beep ========= */
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach(dt => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.2, ctx.currentTime + dt); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dt + 0.3);
      o.start(ctx.currentTime + dt); o.stop(ctx.currentTime + dt + 0.3);
    });
  } catch (e) { /* Ignore */ }
}
function tick() {
  const el = $('#elapsed'), cd = $('#countdown');
  if (!el) return;
  if (!draft || !draft.pourStart || state.view !== 'cupping') { el.textContent = ''; return; }
  const ms = Date.now() - draft.pourStart;
  el.textContent = t('elapsed', { t: mmss(ms) });
  if (cd) {
    const remain = 240000 - ms;
    if (remain > 0) { cd.className = 'big-timer'; cd.textContent = mmss(remain); }
    else {
      cd.className = 'big-timer done'; cd.textContent = t('timer_done');
      if (state.beepedFor !== draft.pourStart) { state.beepedFor = draft.pourStart; beep(); }
    }
  }
}
setInterval(tick, 500);

/* ========= Bootstrap & URI Routing ========= */
function checkUrlIntent() {
  const m = /^#invite=([A-Za-z0-9]+)/.exec(location.hash);
  if (m) state.inviteCode = m[1].toUpperCase();
  if (location.pathname.replace(/\/+$/, '') === '/admin' || location.hash === '#admin') {
    state.wantAdmin = true;
  }
}
window.addEventListener('hashchange', () => {
  if (location.hash === '#admin') {
    history.replaceState(null, '', '/');
    if (state.user && state.user.is_admin) go('admin');
    else { state.wantAdmin = true; go('login'); }
  }
});

async function boot() {
  checkUrlIntent();
  render();
  try {
    const st = await api('GET', '/api/status');
    state.needsFirstRun = !!st.needsFirstRun;
    state.version = st.version || '';
    if (st.needsFirstRun) return go('init');
    try {
      const me = await api('GET', '/api/me');
      await onLoggedIn(me.user);
    } catch (e) {
      if (e.status === 401) {
        if (state.inviteCode) return go('register');
        if (state.wantAdmin) return go('login');
        return go('home'); // Guests land on the public Home feed by default
      }
      throw e;
    }
  } catch (e) {
    $('#app').innerHTML = `<div class="card">${esc(errText(e))}</div>`;
  }
}
boot();
