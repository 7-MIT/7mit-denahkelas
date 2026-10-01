(() => {
  'use strict';

  // ---- Koneksi ke server.7mit (Supabase). Kunci publishable memang aman ada di klien;
  // endpoint ini baca-saja dan hanya mengembalikan data denah yang sudah dipublikasikan.
  const API_URL = 'https://lajzrempjyoqkubkumhb.supabase.co/functions/v1/class-display-api';
  const API_KEY = 'sb_publishable_yGZ90Bkv3yreqc9pA55bpw_YKKBhWRw';
  const POLL_MS = 30000;
  const CACHE_KEY = 'denah7mit:layout';
  const MINE_KEY = 'denah7mit:mine';
  const MODE_KEY = 'denah7mit:mode';

  // ---- Geometri denah (koordinat panggung 1780 x 1260)
  const STAGE = { w: 1780, h: 1260 };
  const BANJAR = [
    { name: 'Banjar 1', cx: 452,  color: 'var(--b1)', label: 'biru tua' },
    { name: 'Banjar 2', cx: 797,  color: 'var(--b2)', label: 'hijau' },
    { name: 'Banjar 3', cx: 1163, color: 'var(--b3)', label: 'kuning' },
    { name: 'Banjar 4', cx: 1510, color: 'var(--b4)', label: 'merah muda' }
  ];
  const ROW_Y = [600, 822, 1044];
  const DESK = { w: 224, h: 112 };
  const CHIP = { w: 116, h: 62 };
  const DOOR_START = { x: 164, y: 234 };
  const LANE_Y = 470;
  const TOTAL_SEATS = 24;

  const seatInfo = (n) => {
    const i = n - 1;
    const b = Math.floor(i / 6);
    const r = Math.floor((i % 6) / 2);
    const c = i % 2; // 0 = kiri, 1 = kanan
    const { cx } = BANJAR[b];
    const cy = ROW_Y[r];
    return { n, b, r, c, cx, cy, chipX: cx + (c ? 57 : -57) };
  };
  const mateOf = (n) => (n % 2 ? n + 1 : n - 1);

  // ---- State
  const $ = (id) => document.getElementById(id);
  const el = {
    stage: $('stage'), sizer: $('sizer'), wrap: $('mapwrap'),
    q: $('q'), clear: $('clear'), results: $('results'),
    guide: $('guide'), guideSeat: $('guideSeat'), guideName: $('guideName'),
    guideMeta: $('guideMeta'), guideSteps: $('guideSteps'),
    saveMine: $('saveMine'), share: $('share'), reset: $('reset'),
    mine: $('mine'), goMine: $('goMine'), forgetMine: $('forgetMine'),
    mode2d: $('mode2d'), mode3d: $('mode3d'), views3d: $('views3d'), viewSeat: $('viewSeat'),
    box3d: $('view3d'), v3msg: $('v3msg'),
    hint: $('hint'), meta: $('meta'), dot: $('statusDot'), statusText: $('statusText')
  };
  let seats = {};          // { "1": "Nama", ... }
  let version = null;
  let publishedAt = null;
  let selected = null;     // nomor kursi terpilih
  const seatEls = {};
  let routeSvg = null;
  let view3d = null;       // modul view3d.js (dimuat malas)
  let mode = '2d';
  let loading3d = null;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* abaikan */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* abaikan */ } }
  };

  const mk = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const place = (e, x, y, w, h) => {
    e.style.left = x + 'px'; e.style.top = y + 'px';
    if (w) e.style.width = w + 'px';
    if (h) e.style.height = h + 'px';
    return e;
  };
  const add = (e) => { el.stage.appendChild(e); return e; };

  // ---- Bangun peta statis
  function buildStage() {
    const title = add(mk('div', 'abs title'));
    title.append(mk('h2', '', 'Belajar Hari Ini'), mk('p', '', 'Sukses Masa Depan Nanti!'));

    add(place(mk('div', 'abs door'), 60, 72, 208, 158));
    add(place(mk('div', 'abs tag', 'PINTU MASUK'), 274, 116));
    add(place(mk('div', 'abs teacher'), 1330, 74, 312, 158));
    add(place(mk('div', 'abs tag', 'MEJA GURU'), 1176, 122));

    add(place(mk('div', 'abs wall'), 42, 233, 73, 897));
    add(place(mk('div', 'abs wall'), 1672, 233, 73, 897));
    add(place(mk('div', 'abs wall'), 63, 1134, 1682, 93));
    add(place(mk('div', 'abs mading', 'MADING KELAS'), 500, 1150, 785, 60));

    add(place(mk('div', 'abs sticker', 'YOU\nCAN\nDO IT!'), 42, 406, 110, 90)).style.whiteSpace = 'pre-line';
    add(place(mk('div', 'abs sticker', 'BE KIND\nBE COOL'), 42, 690, 110, 70)).style.whiteSpace = 'pre-line';
    const s3 = add(place(mk('div', 'abs sticker', 'FOCUS\nLEARN\nGROW'), 1635, 492, 110, 90)); s3.style.whiteSpace = 'pre-line';
    const s4 = add(place(mk('div', 'abs sticker', 'TEAMWORK\nMAKES\nDREAM\nWORK'), 1635, 800, 110, 106)); s4.style.whiteSpace = 'pre-line';
    add(place(mk('div', 'abs plant'), 1623, 320));
    add(place(mk('div', 'abs plant'), 122, 1106));

    BANJAR.forEach((b) => {
      const tag = add(mk('div', 'abs banjar', b.name.toUpperCase()));
      tag.style.background = b.color;
      tag.append(mk('small', '', '2 ORANG / MEJA'));
      place(tag, b.cx - 92, 258, 184);
      ROW_Y.forEach((cy) => {
        add(place(mk('div', 'abs desk'), b.cx - DESK.w / 2, cy - DESK.h / 2, DESK.w, DESK.h));
      });
    });

    for (let n = 1; n <= TOTAL_SEATS; n++) {
      const s = seatInfo(n);
      const btn = add(mk('button', 'seat'));
      btn.type = 'button';
      btn.dataset.n = n;
      btn.append(mk('b', '', 'Kursi ' + n), mk('span', '', '—'));
      place(btn, s.chipX - CHIP.w / 2, s.cy - CHIP.h / 2 - 8, CHIP.w, CHIP.h);
      btn.addEventListener('click', () => selectSeat(n));
      seatEls[n] = btn;
    }

    routeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    routeSvg.setAttribute('class', 'route');
    routeSvg.setAttribute('viewBox', `0 0 ${STAGE.w} ${STAGE.h}`);
    el.stage.appendChild(routeSvg);
  }

  function fit() {
    const w = el.wrap.clientWidth - parseFloat(getComputedStyle(el.wrap).paddingLeft) * 2;
    const scale = Math.max(0.2, w / STAGE.w);
    el.stage.style.transform = `scale(${scale})`;
    el.sizer.style.height = Math.ceil(STAGE.h * scale) + 'px';
  }

  // ---- Render data kursi
  const nameOf = (n) => (seats[n] || '').trim();
  function renderSeats() {
    for (let n = 1; n <= TOTAL_SEATS; n++) {
      const name = nameOf(n);
      const b = seatEls[n];
      b.classList.toggle('empty', !name);
      b.lastChild.textContent = name || 'Kosong';
      b.title = name ? `Kursi ${n} – ${name}` : `Kursi ${n} – kosong`;
      b.setAttribute('aria-label', b.title);
    }
    markMine();
  }
  function markMine() {
    const mine = getMine();
    for (let n = 1; n <= TOTAL_SEATS; n++) seatEls[n].classList.toggle('mine', mine === n);
    if (mine) {
      el.mine.hidden = false;
      el.goMine.textContent = `Kursi ${mine}${nameOf(mine) ? ' · ' + nameOf(mine).split(' ')[0] : ''}`;
    } else {
      el.mine.hidden = true;
    }
  }
  const getMine = () => {
    const v = parseInt(store.get(MINE_KEY), 10);
    return v >= 1 && v <= TOTAL_SEATS ? v : null;
  };

  // ---- Pencarian
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  function search(qRaw) {
    const q = norm(qRaw);
    if (!q) return [];
    const num = q.match(/^(?:kursi\s*)?(\d{1,2})$/);
    if (num) {
      const n = parseInt(num[1], 10);
      return n >= 1 && n <= TOTAL_SEATS ? [n] : [];
    }
    const tokens = q.split(' ');
    const hits = [];
    for (let n = 1; n <= TOTAL_SEATS; n++) {
      const name = norm(nameOf(n));
      if (name && tokens.every((t) => name.includes(t))) hits.push(n);
    }
    return hits;
  }
  function renderResults() {
    const raw = el.q.value;
    el.clear.hidden = !raw;
    el.results.replaceChildren();
    if (!raw.trim()) return;
    const hits = search(raw).slice(0, 8);
    if (!hits.length) {
      el.results.append(mk('li', 'empty', 'Tidak ditemukan. Coba sebagian nama atau nomor kursi.'));
      return;
    }
    hits.forEach((n) => {
      const li = mk('li');
      const btn = mk('button');
      btn.type = 'button';
      btn.append(mk('span', 'no', 'K' + n), mk('span', '', nameOf(n) || 'Kursi kosong'));
      btn.addEventListener('click', () => selectSeat(n));
      li.append(btn);
      el.results.append(li);
    });
  }

  // ---- Rute & panduan
  function routePoints(s) {
    const aisleX = s.c ? s.cx + DESK.w / 2 + 38 : s.cx - DESK.w / 2 - 38;
    const endX = s.c ? s.chipX + CHIP.w / 2 : s.chipX - CHIP.w / 2;
    const y = s.cy - 8;
    return [
      [DOOR_START.x, DOOR_START.y],
      [DOOR_START.x, LANE_Y],
      [aisleX, LANE_Y],
      [aisleX, y],
      [endX, y]
    ];
  }
  function drawRoute(s) {
    const pts = routePoints(s);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
    const ns = 'http://www.w3.org/2000/svg';
    routeSvg.replaceChildren();
    const halo = document.createElementNS(ns, 'path'); halo.setAttribute('d', d); halo.setAttribute('class', 'halo');
    const line = document.createElementNS(ns, 'path'); line.setAttribute('d', d); line.setAttribute('class', 'line');
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', pts[0][0]); dot.setAttribute('cy', pts[0][1]); dot.setAttribute('r', 14); dot.setAttribute('class', 'start');
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', pts[0][0] + 24); t.setAttribute('y', pts[0][1] + 26); t.textContent = 'MULAI';
    routeSvg.append(halo, line, dot, t);
  }
  function steps(s) {
    const b = BANJAR[s.b];
    const side = s.c ? 'kanan' : 'kiri';
    const mate = nameOf(mateOf(s.n));
    const out = [
      'Masuk lewat <b>Pintu Masuk</b> di pojok kiri depan kelas.',
      'Dari pintu, jalan lurus ke belakang lalu <b>belok kanan</b> menyusuri lorong di depan baris meja pertama.'
    ];
    const turn = s.r === 0 ? '' : ` Belok ke belakang di lorong sisi ${side} banjar.`;
    if (s.b === 0) {
      out.push(`Tujuanmu di <b>${b.name}</b> (paling kiri, label ${b.label}).${turn}`);
    } else {
      const passed = BANJAR.slice(0, s.b).map((x) => x.name).join(', ');
      out.push(`Terus ke kanan melewati ${passed} sampai di <b>${b.name}</b> (label ${b.label}).${turn}`);
    }
    out.push(s.r === 0
      ? `Meja ada di <b>baris pertama</b> (paling depan). Berhenti di lorong sisi ${side} banjar, kursimu tepat di depan.`
      : `Jalan ke arah Mading Kelas, lewati ${s.r} meja, berhenti di <b>baris ke-${s.r + 1}</b> dari depan.`);
    out.push(`<b>Kursi ${s.n}</b> ada di sisi <b>${side}</b> meja${mate ? `, sebelah ${escapeHtml(mate)}` : ''}.`);
    return out;
  }
  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function selectSeat(n, opts = {}) {
    selected = n;
    const s = seatInfo(n);
    el.stage.classList.add('navigating');
    Object.values(seatEls).forEach((e) => e.classList.remove('target', 'mate'));
    seatEls[n].classList.add('target');
    seatEls[mateOf(n)].classList.add('mate');
    drawRoute(s);
    if (view3d) view3d.select(n);
    el.viewSeat.disabled = false;
    el.viewSeat.title = 'Lihat kelas dari kursi ini';

    const name = nameOf(n);
    el.guideSeat.innerHTML = `<div><small>KURSI</small>${n}</div>`;
    el.guideName.textContent = name || 'Kursi kosong';
    el.guideMeta.textContent = `${BANJAR[s.b].name} · baris ${s.r + 1} · sisi ${s.c ? 'kanan' : 'kiri'}`;
    el.guideSteps.innerHTML = steps(s).map((t) => `<li>${t}</li>`).join('');
    el.guide.hidden = false;
    el.hint.hidden = true;
    el.saveMine.textContent = getMine() === n ? 'Ini kursi saya ✓' : 'Jadikan kursi saya';

    const url = new URL(location.href);
    url.searchParams.set('kursi', n);
    history.replaceState(null, '', url);
    if (!opts.silent) {
      if (window.matchMedia('(max-width: 900px)').matches) el.guide.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
  function clearSelection() {
    selected = null;
    el.stage.classList.remove('navigating');
    Object.values(seatEls).forEach((e) => e.classList.remove('target', 'mate'));
    routeSvg.replaceChildren();
    if (view3d) view3d.select(null);
    el.viewSeat.disabled = true;
    el.viewSeat.title = 'Pilih kursi dulu';
    el.guide.hidden = true;
    el.hint.hidden = false;
    const url = new URL(location.href);
    url.searchParams.delete('kursi'); url.searchParams.delete('nama');
    history.replaceState(null, '', url);
  }

  // ---- Data dari server.7mit
  function setStatus(kind, text) {
    el.dot.className = 'dot ' + kind;
    el.statusText.textContent = text;
  }
  function applyLayout(layout, source) {
    seats = layout.published_seats || {};
    if (view3d) view3d.setSeats(seats);
    version = layout.published_version;
    publishedAt = layout.published_at;
    renderSeats();
    renderResults();
    if (selected) selectSeat(selected, { silent: true });
    const when = publishedAt ? new Date(publishedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
    el.meta.textContent = `Denah versi ${version ?? '-'} · dipublikasikan ${when}${source === 'cache' ? ' · (data tersimpan)' : ''}`;
  }
  async function load() {
    try {
      const r = await fetch(API_URL, { headers: { apikey: API_KEY }, cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const json = await r.json();
      const layout = json.data && json.data.layout && json.data.layout[0];
      if (!layout || !layout.published_seats) throw new Error('Data denah kosong');
      store.set(CACHE_KEY, JSON.stringify(layout));
      applyLayout(layout, 'server');
      setStatus('ok', 'Terhubung ke server.7mit');
    } catch (e) {
      const cached = store.get(CACHE_KEY);
      if (cached && !Object.keys(seats).length) {
        try { applyLayout(JSON.parse(cached), 'cache'); } catch { /* cache rusak */ }
      }
      setStatus('err', 'Tidak dapat terhubung – ' + (Object.keys(seats).length ? 'menampilkan data terakhir' : 'coba lagi nanti'));
    }
  }

  // ---- Mode 2D / 3D
  function ensure3d() {
    if (loading3d) return loading3d;
    el.v3msg.textContent = 'Memuat model 3D…';
    loading3d = (async () => {
      const probe = document.createElement('canvas');
      if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('Peramban ini tidak mendukung WebGL.');
      const mod = await import('./view3d.js');
      await mod.init(el.box3d, { onPick: (n) => selectSeat(n) });
      mod.setSeats(seats);
      view3d = mod;
      if (selected) mod.select(selected);
      el.v3msg.textContent = '';
      return mod;
    })().catch((e) => {
      loading3d = null;
      el.v3msg.textContent = 'Model 3D gagal dimuat (' + (e.message || e) + '). Denah 2D tetap bisa dipakai.';
      throw e;
    });
    return loading3d;
  }
  async function setMode(m) {
    mode = m;
    store.set(MODE_KEY, m);
    const is3d = m === '3d';
    el.mode2d.setAttribute('aria-selected', String(!is3d));
    el.mode3d.setAttribute('aria-selected', String(is3d));
    el.sizer.hidden = is3d;
    el.box3d.hidden = !is3d;
    el.views3d.hidden = !is3d;
    const url = new URL(location.href);
    if (is3d) url.searchParams.set('tampilan', '3d'); else url.searchParams.delete('tampilan');
    history.replaceState(null, '', url);
    if (is3d) {
      try { const mod = await ensure3d(); if (mode === '3d') mod.setActive(true); } catch { /* pesan sudah tampil */ }
    } else {
      if (view3d) view3d.setActive(false);
      fit();
    }
  }

  // ---- Event
  el.q.addEventListener('input', renderResults);
  el.q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const hits = search(el.q.value);
      if (hits.length) selectSeat(hits[0]);
    }
  });
  el.clear.addEventListener('click', () => { el.q.value = ''; renderResults(); el.q.focus(); });
  el.reset.addEventListener('click', clearSelection);
  el.mode2d.addEventListener('click', () => setMode('2d'));
  el.mode3d.addEventListener('click', () => setMode('3d'));
  el.views3d.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (b && view3d && !b.disabled) view3d.setView(b.dataset.view);
  });
  el.saveMine.addEventListener('click', () => {
    if (selected) { store.set(MINE_KEY, String(selected)); markMine(); el.saveMine.textContent = 'Ini kursi saya ✓'; }
  });
  el.forgetMine.addEventListener('click', () => { store.del(MINE_KEY); markMine(); if (selected) el.saveMine.textContent = 'Jadikan kursi saya'; });
  el.goMine.addEventListener('click', () => { const m = getMine(); if (m) selectSeat(m); });
  el.share.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); el.share.textContent = 'Tersalin ✓'; }
    catch { el.share.textContent = 'Salin manual dari alamat'; }
    setTimeout(() => { el.share.textContent = 'Salin tautan'; }, 1800);
  });
  window.addEventListener('resize', fit);
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(el.wrap);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });

  // ---- Mulai
  buildStage();
  fit();
  renderSeats();
  load().then(() => {
    const p = new URLSearchParams(location.search);
    const k = parseInt(p.get('kursi'), 10);
    const nama = p.get('nama');
    if (p.get('tampilan') === '3d' || (!p.has('tampilan') && store.get(MODE_KEY) === '3d')) setMode('3d');
    if (k >= 1 && k <= TOTAL_SEATS) selectSeat(k, { silent: true });
    else if (nama) { el.q.value = nama; renderResults(); const h = search(nama); if (h.length) selectSeat(h[0], { silent: true }); }
  });
  setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
})();
