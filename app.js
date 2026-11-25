(function () {
  var BASE = 'https://bnuuttvdiyjhefmdxebm.supabase.co';
  var KEY = 'sb_publishable_ufPM8SVm6jfCM02aXeNFNw_2y3XtdUF';
  var SK = 'status_session_v1', EK = 'status_email_v1';
  var STATES = { started: 'بدأ', progress: 'شغال', done: 'خلص', blocked: 'متوقف', error: 'خطأ' };
  var COLORS = { started: '#6ea8fe', progress: '#f5c451', done: '#4ade80', blocked: '#fb923c', error: '#f87171' };
  var app = document.getElementById('app');
  var sess = null, events = [], conn = 'off', ws = null, hb = null, pollT = null, refT = null, ref = 1;

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }
  function ago(ts) {
    var s = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000));
    if (s < 60) return 'من ' + s + ' ثانية';
    if (s < 3600) return 'من ' + Math.floor(s / 60) + ' دقيقة';
    if (s < 86400) return 'من ' + Math.floor(s / 3600) + ' ساعة';
    return 'من ' + Math.floor(s / 86400) + ' يوم';
  }
  function save() { try { localStorage.setItem(SK, JSON.stringify(sess)); } catch (e) {} }
  function load() { try { return JSON.parse(localStorage.getItem(SK)); } catch (e) { return null; } }

  function authCall(grant, body) {
    return fetch(BASE + '/auth/v1/token?grant_type=' + grant, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); });
  }
  function setSess(j) { sess = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in - 120) * 1000 }; save(); }
  function ensureToken() {
    if (!sess) return Promise.reject(new Error('no session'));
    if (Date.now() < sess.exp) return Promise.resolve();
    return authCall('refresh_token', { refresh_token: sess.refresh }).then(function (x) {
      if (!x.ok) { sess = null; try { localStorage.removeItem(SK); } catch (e) {} throw new Error('expired'); }
      setSess(x.j);
      if (ws && ws.readyState === 1) send('access_token', { access_token: sess.access });
    });
  }

  function fetchEvents() {
    return ensureToken().then(function () {
      return fetch(BASE + '/rest/v1/events?select=*&order=id.desc&limit=100', { headers: { apikey: KEY, Authorization: 'Bearer ' + sess.access } });
    }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (rows) { events = rows; if (conn !== 'ok') conn = 'ok'; render(); })
      .catch(function (e) { if (!sess) { showLogin(); return; } conn = 'bad'; render(); });
  }

  function send(event, payload, topic) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ topic: topic || 'realtime:public:events', event: event, payload: payload, ref: String(ref++) }));
  }
  function openWs() {
    closeWs();
    try {
      ws = new WebSocket(BASE.replace('https', 'wss') + '/realtime/v1/websocket?apikey=' + KEY + '&vsn=1.0.0');
    } catch (e) { return; }
    ws.onopen = function () {
      send('phx_join', { config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: [{ event: 'INSERT', schema: 'public', table: 'events' }] }, access_token: sess.access });
      hb = setInterval(function () { send('heartbeat', {}, 'phoenix'); }, 25000);
    };
    ws.onmessage = function (m) {
      var d; try { d = JSON.parse(m.data); } catch (e) { return; }
      if (d.event === 'postgres_changes' && d.payload && d.payload.data && d.payload.data.record) {
        var rec = d.payload.data.record;
        if (!events.some(function (e) { return e.id === rec.id; })) { events.unshift(rec); events.sort(function (a, b) { return b.id - a.id; }); events = events.slice(0, 100); render(); }
      }
    };
    ws.onclose = function () { clearInterval(hb); if (sess) setTimeout(function () { if (sess) openWs(); }, 3000); };
    ws.onerror = function () {};
  }
  function closeWs() { clearInterval(hb); if (ws) { ws.onclose = null; try { ws.close(); } catch (e) {} ws = null; } }

  function startLive() {
    fetchEvents();
    openWs();
    clearInterval(pollT); pollT = setInterval(function () { if (!document.hidden) fetchEvents(); else render(); }, 5000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && sess) { fetchEvents(); if (!ws || ws.readyState > 1) openWs(); } });
  }
  function logout() { sess = null; try { localStorage.removeItem(SK); } catch (e) {} closeWs(); clearInterval(pollT); events = []; showLogin(); }

  function showLogin(msg) {
    closeWs(); clearInterval(pollT);
    var em = ''; try { em = localStorage.getItem(EK) || ''; } catch (e) {}
    app.innerHTML = '<div class="top"><h1>حالة الشغل</h1></div><p class="sub">سجّل دخولك مرة واحدة وهيفضل مفتوح.</p>' +
      '<form id="f"><input id="em" type="email" autocomplete="username" placeholder="الإيميل" value="' + esc(em) + '" required>' +
      '<input id="pw" type="password" autocomplete="current-password" placeholder="الباسورد" required>' +
      '<button type="submit" id="go">دخول</button><div class="err" id="er">' + esc(msg || '') + '</div></form>';
    document.getElementById('f').onsubmit = function (e) {
      e.preventDefault();
      var email = document.getElementById('em').value.trim(), pw = document.getElementById('pw').value;
      var btn = document.getElementById('go'); btn.disabled = true; btn.textContent = '...';
      authCall('password', { email: email, password: pw }).then(function (x) {
        if (!x.ok) { btn.disabled = false; btn.textContent = 'دخول'; document.getElementById('er').textContent = 'الإيميل أو الباسورد غلط'; return; }
        try { localStorage.setItem(EK, email); } catch (e2) {}
        setSess(x.j); startLive();
      }).catch(function () { btn.disabled = false; btn.textContent = 'دخول'; document.getElementById('er').textContent = 'مفيش اتصال بالنت'; });
    };
  }

  function card(e) {
    var c = COLORS[e.state] || '#aaa', p = e.progress;
    var u = safeUrl(e.link);
    return '<div class="card"><div class="row"><b>' + esc(e.task) + '</b><span class="chip" style="color:' + c + '">' + esc(STATES[e.state] || e.state) + '</span></div>' +
      '<div class="src">' + esc(e.source) + '</div>' + (e.message ? '<div class="msg">' + esc(e.message) + '</div>' : '') +
      (p != null ? '<div class="bar"><div class="fill" style="width:' + Math.min(100, Math.max(0, p)) + '%;background:' + c + '"></div></div>' : '') +
      '<div class="row small"><span>' + (p != null ? p + '%' : '') + (e.remaining != null ? ' · فاضل ' + e.remaining : '') + '</span><span>' + ago(e.ts) + '</span></div>' +
      (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">فتح اللينك</a>' : '') + '</div>';
  }
  function render() {
    if (!sess) return;
    var latest = {}, i;
    for (i = events.length - 1; i >= 0; i--) latest[events[i].source + '/' + events[i].task] = events[i];
    var cards = Object.keys(latest).map(function (k) { return latest[k]; }).sort(function (a, b) { return b.id - a.id; });
    var live = ws && ws.readyState === 1;
    var html = '<div class="top"><h1>حالة الشغل<span class="dot ' + (conn === 'ok' ? 'ok' : conn === 'bad' ? 'bad' : '') + '"></span></h1><button class="ghost" id="lo">خروج</button></div>' +
      '<p class="sub">' + (conn === 'bad' ? 'مشكلة في الاتصال، بحاول تاني' : live ? 'متصل لحظي' : 'متصل، بيتحدث كل 5 ثواني') + '</p>' +
      '<h2>الحالي</h2>' + (cards.length ? cards.map(card).join('') : '<p class="sub">مفيش أحداث لسه.</p>') + '<h2>السجل</h2>';
    for (i = 0; i < events.length; i++) {
      var e = events[i], u = safeUrl(e.link);
      html += '<div class="log"><span class="chip" style="color:' + (COLORS[e.state] || '#aaa') + '">' + esc(STATES[e.state] || e.state) + '</span><span class="msg">' + esc(e.task) + (e.message ? ': ' + esc(e.message) : '') + '</span>' +
        (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">لينك</a>' : '') + '<span class="time">' + ago(e.ts) + '</span></div>';
    }
    app.innerHTML = html;
    document.getElementById('lo').onclick = logout;
  }

  sess = load();
  if (sess && sess.refresh) startLive(); else showLogin();
})();
