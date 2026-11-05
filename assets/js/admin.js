/* ==========================================================================
   Amo Pijao Terraza — panel de administración
   Datos en Supabase:
   - content (col, id, position, data): textos, carta, productos, fotos, apariencia
   - reservas: solicitudes hechas desde el sitio
   - admins: quién puede entrar
   Las políticas RLS de la base de datos garantizan que solo los
   administradores puedan leer reservas o modificar contenido.
   ========================================================================== */
(function () {
  'use strict';

  var SB = {
    url: 'https://suvqsjloaoovaxjusini.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1dnFzamxvYW9vdmF4anVzaW5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NTI0MDIsImV4cCI6MjEwNjEyODQwMn0.3HC7MK3TCSEIWkpgHApObsgo6a5oyUjMv_511AwG0iU'
  };
  var DOMAIN = 'amopijaoterraza.local';
  var SESSION_KEY = 'apt-admin';

  /* ---------- utilidades ---------- */
  var $ = function (s, p) { return (p || document).querySelector(s); };
  var $$ = function (s, p) { return Array.prototype.slice.call((p || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var icon = function (id) { return '<svg aria-hidden="true"><use href="#' + id + '"/></svg>'; };
  var slug = function (u) { return String(u || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, ''); };
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  var money = function (v) {
    v = String(v == null ? '' : v).trim();
    if (!v) return '';
    return /^\$?\s*[\d.,\s]+$/.test(v) ? '$' + v.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.') : v;
  };
  var today = function () { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date()); };
  var addDays = function (iso, n) { var p = iso.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().slice(0, 10); };
  var fmtHora = function (h) {
    var m = /^(\d{2}):(\d{2})$/.exec(h || ''); if (!m) return h || '';
    var H = +m[1], h12 = H % 12 || 12; return h12 + ':' + m[2] + (H < 12 ? ' a.m.' : ' p.m.');
  };
  var fmtFecha = function (iso, opts) {
    var p = String(iso).split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12)).toLocaleDateString('es-CO', Object.assign({ weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }, opts || {}));
  };
  var ago = function (ts) {
    var d = (Date.now() - new Date(ts).getTime()) / 60000;
    if (d < 1) return 'hace un momento';
    if (d < 60) return 'hace ' + Math.round(d) + ' min';
    if (d < 1440) return 'hace ' + Math.round(d / 60) + ' h';
    return 'el ' + new Date(ts).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  };
  var waNum = function (tel) { var d = String(tel || '').replace(/\D/g, ''); if (d.length === 10) d = '57' + d; return d; };
  var openWa = function (tel, msg) {
    var url = 'https://wa.me/' + waNum(tel) + (msg ? '?text=' + encodeURIComponent(msg) : '');
    var w = window.open(url, '_blank'); if (w) { try { w.opener = null; } catch (e) {} }
  };

  var toastTimer;
  function toast(msg, bad) {
    var t = $('#toast'); t.textContent = msg; t.className = 'toast on' + (bad ? ' bad' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = 'toast' + (bad ? ' bad' : ''); }, 3200);
  }
  function setSaving(state, msg) {
    var el = $('#saving'); if (!el) return;
    el.className = 'saving' + (state === 'ok' ? ' ok' : state === 'bad' ? ' bad' : '');
    el.textContent = msg || { pend: 'Cambios sin guardar…', saving: 'Guardando…', ok: 'Guardado · ya se ve en el sitio', bad: 'No se pudo guardar' }[state] || '';
  }
  /** Botón de dos toques para acciones que no se deshacen */
  function armed(btn) {
    if (btn.dataset.armed) return true;
    var html = btn.innerHTML; btn.dataset.armed = '1'; btn.classList.add('is-armed'); btn.textContent = btn.dataset.confirm || '¿Seguro?';
    setTimeout(function () { if (!btn.isConnected) return; delete btn.dataset.armed; btn.classList.remove('is-armed'); btn.innerHTML = html; }, 3000);
    return false;
  }

  /* ---------- sesión ---------- */
  var S = null;
  function loadSession() {
    [localStorage, sessionStorage].some(function (st) { try { var v = JSON.parse(st.getItem(SESSION_KEY)); if (v && v.a) { S = v; return true; } } catch (e) {} return false; });
  }
  function saveSession() {
    try { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); (S.remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(S)); } catch (e) {}
  }
  function clearSession() {
    S = null;
    try { ['ap_s', SESSION_KEY].forEach(function (k) { localStorage.removeItem(k); sessionStorage.removeItem(k); }); } catch (e) {}
  }
  function authReq(body, grant) {
    return fetch(SB.url + '/auth/v1/token?grant_type=' + grant, { method: 'POST', headers: { apikey: SB.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw j; return j; }); });
  }
  function applyToken(j, extra) {
    S = Object.assign({}, S || {}, extra || {}, { a: j.access_token, r: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000, id: (j.user && j.user.id) || (S && S.id) });
    saveSession();
  }
  function fresh() {
    if (!S) return Promise.reject(new Error('sin sesión'));
    if (Date.now() < S.exp - 120000) return Promise.resolve();
    return authReq({ refresh_token: S.r }, 'refresh_token').then(function (j) { applyToken(j); })
      .catch(function (e) { logout('Su sesión venció. Ingrese de nuevo.'); throw e; });
  }
  function api(path, opt) {
    opt = opt || {};
    return fresh().then(function () {
      var h = { apikey: SB.key, Authorization: 'Bearer ' + S.a };
      if (opt.body && typeof opt.body === 'string') h['Content-Type'] = 'application/json';
      Object.assign(h, opt.headers || {});
      return fetch(SB.url + path, Object.assign({}, opt, { headers: h }));
    }).then(function (r) {
      if (r.status === 401) { logout('Su sesión venció. Ingrese de nuevo.'); throw new Error('401'); }
      return r.text().then(function (t) {
        if (!r.ok) { var m = t; try { m = JSON.parse(t).message || t; } catch (e) {} throw new Error(m); }
        return t ? JSON.parse(t) : null;
      });
    });
  }
  function logout(msg) { clearSession(); clearInterval(pollTimer); renderLogin(msg); }

  /* ---------- datos ---------- */
  var D = { texts: {}, theme: {}, images: {}, menu: [], shop: [], admins: [], upcoming: [], past: [], seen: null };
  var view = 'reservas', resFilter = 'proximas', resQ = '', openCats = {}, pollTimer = null, resetFor = null;

  var DEF_TEXTS = {
    tagline: 'La mejor vista cafetera de Pijao.',
    lede: 'Café de especialidad, cocina de la casa y coctelería en una terraza frente al parque principal de Pijao, Quindío.',
    aboutTitle: 'Un rincón para amar a Pijao',
    aboutText: 'En el corazón de Pijao, uno de los pueblos más coloridos del Eje Cafetero, Amo Pijao Terraza es un rincón pensado para disfrutar el buen café con calma.\n\nDesde nuestra terraza, con vista al parque principal, invitamos a compartir una tarde tranquila, una buena conversación y una carta preparada con cuidado en cada detalle.',
    hours: 'Todos los días\n1:00 p.m. – 10:00 p.m.', address: 'Cra. 4 #12-12\nPijao, Quindío', phone: '+57 310 433 7667', notice: '', noticeOn: false
  };

  var upsert = function (rows) {
    var now = new Date().toISOString();
    return api('/rest/v1/content?on_conflict=col,id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.map(function (r) { return Object.assign({ updated_at: now }, r); })) });
  };
  var delRow = function (col, id) { return api('/rest/v1/content?col=eq.' + col + '&id=eq.' + encodeURIComponent(id), { method: 'DELETE' }); };
  function track(p) {
    setSaving('saving');
    return p.then(function () { setSaving('ok'); }, function (e) { setSaving('bad'); toast('No se pudo guardar. Revise la conexión e intente de nuevo.', true); throw e; });
  }
  var timers = {};
  function later(key, fn) { clearTimeout(timers[key]); setSaving('pend'); timers[key] = setTimeout(function () { track(fn()).catch(function () {}); }, 650); }
  var rowOf = function (o) { var d = Object.assign({}, o); delete d.id; delete d.position; return d; };
  var saveCat = function (c) { return upsert([{ col: 'menu', id: c.id, position: c.position, data: rowOf(c) }]); };
  var saveProd = function (p) { return upsert([{ col: 'shop', id: p.id, position: p.position, data: rowOf(p) }]); };
  var saveTexts = function () { return upsert([{ col: 'site', id: 'texts', position: 0, data: D.texts }]); };
  var saveTheme = function () { return upsert([{ col: 'site', id: 'theme', position: 0, data: D.theme }]); };

  function loadContent() {
    return api('/rest/v1/content?select=col,id,position,data&order=position').then(function (rows) {
      if (!rows.some(function (r) { return r.col === 'meta'; })) return seed().then(loadContent);
      D.texts = {}; D.theme = {}; D.images = {}; D.menu = []; D.shop = [];
      rows.forEach(function (r) {
        if (r.col === 'site' && r.id === 'texts') D.texts = r.data || {};
        else if (r.col === 'site' && r.id === 'theme') D.theme = (r.data && r.data.v >= 2) ? r.data : { v: 2 };
        else if (r.col === 'img' && r.data && r.data.src) D.images[r.id] = r.data.src;
        else if (r.col === 'menu') D.menu.push(Object.assign({ id: r.id, position: r.position }, r.data));
        else if (r.col === 'shop') D.shop.push(Object.assign({ id: r.id, position: r.position }, r.data));
      });
      if (!D.theme.v) D.theme = { v: 2 };
      D.menu.sort(function (a, b) { return a.position - b.position; });
      D.shop.sort(function (a, b) { return a.position - b.position; });
    });
  }
  function seed() {
    return fetch('/data/menu.json').then(function (r) { return r.json(); }).then(function (menu) {
      var rows = [{ col: 'site', id: 'texts', position: 0, data: DEF_TEXTS }, { col: 'meta', id: 'seeded', position: 0, data: {} }];
      menu.forEach(function (c, i) { rows.push({ col: 'menu', id: 'c' + String(i).padStart(2, '0'), position: i, data: c }); });
      return upsert(rows);
    });
  }
  function loadReservas() {
    var t = today();
    var reqs = [api('/rest/v1/reservas?select=*&fecha=gte.' + t + '&order=fecha.asc,hora.asc&limit=500')];
    if (resFilter === 'pasadas' || resFilter === 'todas') reqs.push(api('/rest/v1/reservas?select=*&fecha=lt.' + t + '&order=fecha.desc,hora.desc&limit=300'));
    return Promise.all(reqs).then(function (r) {
      var up = r[0] || [];
      // avisar de reservas nuevas desde la última revisión
      if (D.seen) {
        up.filter(function (x) { return x.estado === 'pendiente' && !D.seen[x.id]; }).forEach(function (x) {
          toast('Nueva reserva: ' + x.nombre + ' · ' + fmtFecha(x.fecha, { weekday: undefined }) + ', ' + fmtHora(x.hora));
        });
      }
      D.seen = {}; up.forEach(function (x) { D.seen[x.id] = 1; });
      D.upcoming = up; if (r[1]) D.past = r[1];
      updateBadge();
    });
  }
  function updateBadge() {
    var n = D.upcoming.filter(function (r) { return r.estado === 'pendiente'; }).length;
    var b = $('[data-view="reservas"] .count'); if (b) { b.textContent = n; b.hidden = !n; }
    document.title = (n ? '(' + n + ') ' : '') + 'Panel · Amo Pijao Terraza';
  }

  /* ---------- ingreso ---------- */
  function renderLogin(msg) {
    $('#app').innerHTML =
      '<div class="login"><form class="login__card" id="login-form" novalidate>' +
      '<div class="login__brand"><img src="/assets/img/emblema-crema-96.webp" width="64" height="71" alt=""><span class="label">Panel de administración</span><h1>Amo Pijao <em>Terraza</em></h1></div>' +
      '<div class="field"><label for="lg-u">Usuario</label><input id="lg-u" autocomplete="username" autocapitalize="none" required></div>' +
      '<div class="field"><label for="lg-p">Contraseña</label><input id="lg-p" type="password" autocomplete="current-password" required></div>' +
      '<label class="switch"><input type="checkbox" id="lg-r"><i></i>Recordar este dispositivo</label>' +
      '<p class="login__err" id="lg-e" role="alert">' + esc(msg || '') + '</p>' +
      '<button class="b b--primary" type="submit">Entrar</button>' +
      '<a class="b b--ghost" href="/">Volver al sitio</a></form></div>';
    $('#lg-u').focus();
    $('#login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var u = $('#lg-u').value.trim(), p = $('#lg-p').value, err = $('#lg-e'), btn = e.target.querySelector('[type=submit]');
      if (!u || !p) { err.textContent = 'Escriba su usuario y su contraseña.'; return; }
      btn.disabled = true; btn.textContent = 'Entrando…'; err.textContent = '';
      S = null;
      authReq({ email: slug(u) + '@' + DOMAIN, password: p }, 'password')
        .then(function (j) { applyToken(j, { u: u, remember: $('#lg-r').checked }); return start(); })
        .catch(function (x) {
          clearSession(); btn.disabled = false; btn.textContent = 'Entrar';
          err.textContent = x && x.message === 'sin acceso' ? 'Este usuario no tiene acceso al panel.' : 'Usuario o contraseña incorrectos.';
        });
    });
  }

  /* ---------- estructura ---------- */
  var NAV = [
    ['reservas', 'Reservas', 'a-cal'], ['carta', 'Carta y precios', 'a-menu'], ['productos', 'Productos', 'a-bag'],
    ['textos', 'Textos y avisos', 'a-text'], ['fotos', 'Fotos', 'a-photo'], ['apariencia', 'Apariencia', 'a-brush'], ['usuarios', 'Usuarios', 'a-users']
  ];
  function shell() {
    $('#app').innerHTML =
      '<div class="app"><aside class="side">' +
      '<div class="side__brand"><span style="display:flex;align-items:center;gap:12px"><img src="/assets/img/emblema-crema-96.webp" width="36" height="40" alt=""><span><b>Amo Pijao</b><small>Panel</small></span></span>' +
      '<span class="mobile-tools"><a class="b b--icon b--ghost" href="/" target="_blank" rel="noopener" aria-label="Ver el sitio">' + icon('a-eye') + '</a><button class="b b--icon b--ghost" type="button" data-act="logout" aria-label="Salir">' + icon('a-out') + '</button></span></div>' +
      '<nav aria-label="Secciones del panel">' + NAV.map(function (n) {
        return '<button class="nav-b" type="button" data-view="' + n[0] + '">' + icon(n[2]) + n[1] + (n[0] === 'reservas' ? '<span class="count" hidden>0</span>' : '') + '</button>';
      }).join('') + '</nav>' +
      '<div class="side__foot"><span class="who">Sesión: ' + esc(S.u || '') + '</span><div class="row"><a class="b b--sm" href="/" target="_blank" rel="noopener">' + icon('a-eye') + 'Ver sitio</a><button class="b b--sm b--ghost" type="button" data-act="logout">' + icon('a-out') + 'Salir</button></div></div>' +
      '</aside><main class="main" id="main"></main></div>';
  }
  function go(v) {
    view = NAV.some(function (n) { return n[0] === v; }) ? v : 'reservas';
    $$('[data-view]').forEach(function (b) { if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (location.hash.slice(1) !== view) history.replaceState(null, '', '#' + view);
    render();
    window.scrollTo(0, 0);
  }
  function head(title, sub, actions) {
    return '<header class="head"><div><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div><div class="actions"><span class="saving" id="saving" aria-live="polite"></span>' + (actions || '') + '</div></header>';
  }
  function render() {
    var m = $('#main'); if (!m) return;
    m.innerHTML = ({ reservas: vReservas, carta: vCarta, productos: vProductos, textos: vTextos, fotos: vFotos, apariencia: vApariencia, usuarios: vUsuarios })[view]();
  }

  /* ==========================================================================
     RESERVAS
     ========================================================================== */
  var ESTADOS = { pendiente: 'Pendiente', confirmada: 'Confirmada', cancelada: 'Cancelada', atendida: 'Atendida' };
  var nPersonas = function (p) { var n = parseInt(p, 10); return isNaN(n) ? 0 : n; };

  function vReservas() {
    var t = today(), all = D.upcoming;
    var hoy = all.filter(function (r) { return r.fecha === t && r.estado !== 'cancelada'; });
    var pend = all.filter(function (r) { return r.estado === 'pendiente'; });
    var semana = all.filter(function (r) { return r.fecha <= addDays(t, 6) && r.estado !== 'cancelada'; });
    var list = resFilter === 'hoy' ? all.filter(function (r) { return r.fecha === t; })
      : resFilter === 'pendientes' ? pend
      : resFilter === 'pasadas' ? D.past
      : resFilter === 'todas' ? all.concat(D.past)
      : all.filter(function (r) { return r.estado !== 'cancelada' || r.fecha >= t; });
    if (resQ) {
      var q = resQ.toLowerCase();
      list = list.filter(function (r) { return (r.nombre + ' ' + r.telefono + ' ' + (r.notas || '')).toLowerCase().indexOf(q) > -1; });
    }
    var groups = {}, order = [];
    list.forEach(function (r) { if (!groups[r.fecha]) { groups[r.fecha] = []; order.push(r.fecha); } groups[r.fecha].push(r); });
    var dayLabel = function (f) { return f === t ? 'Hoy' : f === addDays(t, 1) ? 'Mañana' : f === addDays(t, -1) ? 'Ayer' : fmtFecha(f); };
    var FILTERS = [['proximas', 'Próximas'], ['hoy', 'Hoy'], ['pendientes', 'Pendientes'], ['pasadas', 'Pasadas'], ['todas', 'Todas']];
    return head('Reservas', 'Solicitudes hechas desde el sitio. Se actualiza solo cada minuto.', '<button class="b" type="button" data-act="res-refresh">' + icon('a-refresh') + 'Actualizar</button>') +
      '<div class="stats">' +
      '<div class="stat"><b>' + hoy.length + '</b><span>Reservas hoy · ' + hoy.reduce(function (a, r) { return a + nPersonas(r.personas); }, 0) + ' personas</span></div>' +
      '<div class="stat"><b>' + pend.length + '</b><span>Por confirmar</span></div>' +
      '<div class="stat"><b>' + semana.length + '</b><span>Próximos 7 días</span></div></div>' +
      '<div class="toolbar"><div class="seg" role="group" aria-label="Filtrar reservas">' + FILTERS.map(function (f) {
        return '<button type="button" data-res-filter="' + f[0] + '" aria-pressed="' + (resFilter === f[0]) + '">' + f[1] + '</button>';
      }).join('') + '</div><input class="input" type="search" placeholder="Buscar por nombre o teléfono" value="' + esc(resQ) + '" data-res-q aria-label="Buscar reservas"></div>' +
      (order.length ? order.map(function (f) {
        var g = groups[f];
        return '<section class="day"><h2>' + esc(dayLabel(f)) + ' <small>' + (f === t || f === addDays(t, 1) || f === addDays(t, -1) ? esc(fmtFecha(f)) + ' · ' : '') + g.length + (g.length === 1 ? ' reserva' : ' reservas') + '</small></h2>' + g.map(resCard).join('') + '</section>';
      }).join('') : '<div class="empty"><b>Sin reservas aquí</b>' + (resFilter === 'proximas' ? 'Cuando alguien reserve desde el sitio, aparecerá en esta lista.' : 'Pruebe con otro filtro.') + '</div>');
  }
  function resCard(r) {
    var e = r.estado;
    return '<article class="res" data-estado="' + e + '" data-id="' + esc(r.id) + '">' +
      '<div class="res__time">' + esc(fmtHora(r.hora)) + '<small>' + esc(r.personas) + '</small></div>' +
      '<div><div class="res__who"><b>' + esc(r.nombre) + '</b><span class="pill" data-estado="' + e + '">' + ESTADOS[e] + '</span></div>' +
      '<div class="res__meta"><a href="tel:+' + waNum(r.telefono) + '">' + esc(r.telefono) + '</a><span class="muted">Recibida ' + esc(ago(r.created_at)) + '</span></div>' +
      (r.notas ? '<p class="res__notes">“' + esc(r.notas) + '”</p>' : '') +
      '<div class="res__internal field"><textarea class="input" rows="1" placeholder="Nota interna (solo la ve el equipo)" data-res-note aria-label="Nota interna">' + esc(r.nota_interna || '') + '</textarea></div></div>' +
      '<div class="res__actions">' +
      (e === 'pendiente' ? '<button class="b b--ok b--sm" type="button" data-res="confirmar">' + icon('a-wa') + 'Confirmar y avisar</button>' : '') +
      (e === 'confirmada' ? '<button class="b b--sm" type="button" data-res="atendida">Marcar atendida</button>' : '') +
      (e === 'cancelada' || e === 'atendida' ? '<button class="b b--sm" type="button" data-res="reabrir">Volver a pendiente</button>' : '') +
      '<button class="b b--sm" type="button" data-res="whatsapp">' + icon('a-wa') + 'Escribir</button>' +
      (e === 'pendiente' || e === 'confirmada' ? '<button class="b b--bad b--sm" type="button" data-res="cancelar" data-confirm="¿Cancelar?">Cancelar</button>' : '') +
      '<button class="b b--ghost b--sm" type="button" data-res="borrar" data-confirm="¿Eliminar?">Eliminar</button>' +
      '</div></article>';
  }
  function findRes(id) { return D.upcoming.concat(D.past).filter(function (r) { return r.id === id; })[0]; }
  function patchRes(r, data) {
    Object.assign(r, data);
    return track(api('/rest/v1/reservas?id=eq.' + encodeURIComponent(r.id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(data) }));
  }
  function resAction(btn) {
    var card = btn.closest('.res'), r = findRes(card.dataset.id); if (!r) return;
    var first = String(r.nombre).split(' ')[0], cuando = fmtFecha(r.fecha) + ' a las ' + fmtHora(r.hora);
    var a = btn.dataset.res;
    if (a === 'confirmar') {
      openWa(r.telefono, 'Hola ' + first + ', le escribimos de Amo Pijao Terraza para confirmar su reserva del ' + cuando + ' para ' + r.personas + '. ¡Lo esperamos!');
      patchRes(r, { estado: 'confirmada' }).then(function () { toast('Reserva confirmada'); render(); updateBadge(); }).catch(function () {});
    } else if (a === 'atendida') {
      patchRes(r, { estado: 'atendida' }).then(function () { render(); }).catch(function () {});
    } else if (a === 'reabrir') {
      patchRes(r, { estado: 'pendiente' }).then(function () { render(); updateBadge(); }).catch(function () {});
    } else if (a === 'whatsapp') {
      openWa(r.telefono, r.estado === 'cancelada'
        ? 'Hola ' + first + ', le escribimos de Amo Pijao Terraza sobre su reserva del ' + cuando + '. Lamentablemente no podemos recibirlos en ese horario. ¿Le gustaría reservar en otro momento?'
        : 'Hola ' + first + ', le escribimos de Amo Pijao Terraza sobre su reserva del ' + cuando + '.');
    } else if (a === 'cancelar') {
      if (!armed(btn)) return;
      patchRes(r, { estado: 'cancelada' }).then(function () { toast('Reserva cancelada. Puede avisarle con «Escribir».'); render(); updateBadge(); }).catch(function () {});
    } else if (a === 'borrar') {
      if (!armed(btn)) return;
      track(api('/rest/v1/reservas?id=eq.' + encodeURIComponent(r.id), { method: 'DELETE' })).then(function () {
        D.upcoming = D.upcoming.filter(function (x) { return x.id !== r.id; }); D.past = D.past.filter(function (x) { return x.id !== r.id; });
        toast('Reserva eliminada'); render(); updateBadge();
      }).catch(function () {});
    }
  }

  /* ==========================================================================
     CARTA
     ========================================================================== */
  function vCarta() {
    return head('Carta y precios', 'Los cambios se guardan solos y se ven de inmediato en el sitio. Los precios se escriben solo con números: 12000 queda $12.000.', '<button class="b b--primary" type="button" data-act="cat-add">' + icon('a-plus') + 'Nueva categoría</button>') +
      (D.menu.length ? D.menu.map(function (c, i) {
        var cols = c.cols && c.cols.length ? c.cols : null, n = (c.items || []).length;
        return '<details class="cat-ed" data-cat="' + esc(c.id) + '"' + (openCats[c.id] ? ' open' : '') + '>' +
          '<summary><h3>' + esc(c.name || 'Sin nombre') + '</h3><span class="muted">' + n + (n === 1 ? ' producto' : ' productos') + '</span>' +
          '<button class="b b--icon b--ghost" type="button" data-cat-move="-1" aria-label="Subir categoría"' + (i === 0 ? ' disabled' : '') + '>' + icon('a-up') + '</button>' +
          '<button class="b b--icon b--ghost" type="button" data-cat-move="1" aria-label="Bajar categoría"' + (i === D.menu.length - 1 ? ' disabled' : '') + '>' + icon('a-down') + '</button></summary>' +
          '<div class="cat-ed__body"><div class="cat-ed__top">' +
          '<div class="field"><label>Nombre de la categoría</label><input data-cat-field="name" value="' + esc(c.name) + '"></div>' +
          '<div class="field"><label>Nota (opcional)</label><input data-cat-field="note" value="' + esc(c.note || '') + '" placeholder="Ej.: Patacones, burritos y conos"></div>' +
          '<button class="b b--bad b--sm" type="button" data-act="cat-del" data-confirm="¿Eliminar categoría?">Eliminar categoría</button></div>' +
          (cols ? '<div class="items-head cols" style="--n:' + cols.length + '"><span>Producto</span>' + cols.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '<span></span></div>'
            : '<div class="items-head"><span>Producto</span><span>Descripción</span><span>Precio</span><span></span></div>') +
          '<div class="items">' + (c.items || []).map(function (it, j) {
            return '<div class="item' + (cols ? ' cols' : '') + '" data-j="' + j + '"' + (cols ? ' style="--n:' + cols.length + '"' : '') + '>' +
              '<input class="input nm" data-it="n" value="' + esc(it.n) + '" placeholder="Nombre" aria-label="Nombre del producto">' +
              (cols ? cols.map(function (x, k) { return '<input class="input" data-it-v="' + k + '" value="' + esc((it.v || [])[k] || '') + '" placeholder="' + esc(x) + '" inputmode="numeric" aria-label="Precio ' + esc(x) + '">'; }).join('')
                : '<input class="input ds" data-it="d" value="' + esc(it.d || '') + '" placeholder="Descripción (opcional)" aria-label="Descripción">' +
                  '<input class="input" data-it="p" value="' + esc(it.p || '') + '" placeholder="$0" inputmode="numeric" aria-label="Precio">') +
              '<span class="item__tools"><button class="b b--icon b--ghost" type="button" data-it-move="-1" aria-label="Subir"' + (j === 0 ? ' disabled' : '') + '>' + icon('a-up') + '</button>' +
              '<button class="b b--icon b--ghost" type="button" data-it-move="1" aria-label="Bajar"' + (j === n - 1 ? ' disabled' : '') + '>' + icon('a-down') + '</button>' +
              '<button class="b b--icon b--ghost" type="button" data-act="it-del" data-confirm="✕" aria-label="Quitar producto">' + icon('a-x') + '</button></span></div>';
          }).join('') + '</div>' +
          '<div><button class="b b--sm" type="button" data-act="it-add">' + icon('a-plus') + 'Agregar ' + (cols ? 'fila' : 'producto') + '</button></div></div></details>';
      }).join('') : '<div class="empty"><b>La carta está vacía</b>Cree la primera categoría con «Nueva categoría».</div>');
  }
  var catOf = function (el) { var d = el.closest('[data-cat]'); return d && D.menu.filter(function (c) { return c.id === d.dataset.cat; })[0]; };

  /* ==========================================================================
     PRODUCTOS
     ========================================================================== */
  var CATS = ['Café', 'Tazas', 'Camisetas', 'Imanes', 'Stickers', 'Otros'];
  function vProductos() {
    var pub = D.shop.filter(function (p) { return p.on && p.name; }).length;
    return head('Productos', 'Lo que vende la casa. Solo los productos marcados como <b>Publicado</b> aparecen en el sitio; si no hay ninguno, la página Productos no se muestra.', '<button class="b b--primary" type="button" data-act="prod-add">' + icon('a-plus') + 'Nuevo producto</button>') +
      '<p class="hint" style="margin:-8px 0 18px">' + pub + (pub === 1 ? ' publicado' : ' publicados') + ' · ' + (D.shop.length - pub) + ' sin publicar</p>' +
      '<datalist id="prod-cats">' + CATS.map(function (c) { return '<option value="' + c + '">'; }).join('') + '</datalist>' +
      (D.shop.length ? '<div class="prods">' + D.shop.map(function (p, i) {
        return '<article class="prod' + (p.on ? '' : ' is-draft') + '" data-prod="' + esc(p.id) + '">' +
          '<label class="photo">' + (p.img ? '<img src="' + esc(p.img) + '" alt=""><span class="change">Cambiar foto</span>' : '<span>' + icon('a-photo') + '<br>Agregar foto</span>') +
          '<input type="file" accept="image/*" data-photo="prod" aria-label="Foto del producto"></label>' +
          '<div class="field"><label>Nombre</label><input data-p="name" value="' + esc(p.name) + '" placeholder="Ej.: Café de origen Pijao 500 g"></div>' +
          '<div class="grid2"><div class="field"><label>Categoría</label><input data-p="cat" list="prod-cats" value="' + esc(p.cat || '') + '" placeholder="Café, Tazas…"></div>' +
          '<div class="field"><label>Precio</label><input data-p="price" value="' + esc(p.price || '') + '" placeholder="$0" inputmode="numeric"></div></div>' +
          '<div class="field"><label>Descripción</label><textarea data-p="desc" rows="2">' + esc(p.desc || '') + '</textarea></div>' +
          '<div class="field"><label>Opciones (separadas por coma)</label><input data-p="opts" value="' + esc(p.opts || '') + '" placeholder="Grano, Molido · S, M, L, XL"></div>' +
          '<div class="prod__switches"><label class="switch"><input type="checkbox" data-p="on"' + (p.on ? ' checked' : '') + '><i></i>Publicado</label>' +
          '<label class="switch"><input type="checkbox" data-p="out"' + (p.out ? ' checked' : '') + '><i></i>Agotado</label></div>' +
          '<div class="prod__foot"><span><button class="b b--icon b--ghost" type="button" data-prod-move="-1" aria-label="Mover antes"' + (i === 0 ? ' disabled' : '') + '>' + icon('a-up') + '</button>' +
          '<button class="b b--icon b--ghost" type="button" data-prod-move="1" aria-label="Mover después"' + (i === D.shop.length - 1 ? ' disabled' : '') + '>' + icon('a-down') + '</button></span>' +
          '<button class="b b--bad b--sm" type="button" data-act="prod-del" data-confirm="¿Eliminar producto?">Eliminar</button></div></article>';
      }).join('') + '</div>' : '<div class="empty"><b>Aún no hay productos</b>Agregue tazas, camisetas, café en grano o molido, imanes o stickers con «Nuevo producto».</div>');
  }
  var prodOf = function (el) { var d = el.closest('[data-prod]'); return d && D.shop.filter(function (p) { return p.id === d.dataset.prod; })[0]; };

  /* ==========================================================================
     TEXTOS
     ========================================================================== */
  var MAIN_TEXTS = [
    ['tagline', 'Frase principal (portada)', 'i'], ['lede', 'Presentación bajo el nombre (portada)', 't'],
    ['aboutTitle', 'Título de «Nuestra historia»', 'i'], ['aboutText', 'Texto de «Nuestra historia» (deje una línea en blanco entre párrafos)', 't'],
    ['hours', 'Horario (el sitio calcula «Abierto ahora» con este texto)', 't'], ['address', 'Dirección', 't'], ['phone', 'Teléfono y WhatsApp (llamadas, reservas y pedidos)', 'i']
  ];
  var MICRO = [
    ['navMenu', 'Menú: carta', 'La carta'], ['navAbout', 'Menú: nosotros', 'Nosotros'], ['navLoc', 'Menú: ubicación', 'Visítenos'], ['navShop', 'Menú: productos', 'Productos'],
    ['btnReserve', 'Botón de reservar', 'Reservar'], ['btnMenu', 'Botón para ver la carta', 'Ver la carta'], ['btnMaps', 'Botón de Google Maps', 'Google Maps'],
    ['heroBadge', 'Leyenda bajo la imagen de portada', 'Frente al parque principal'], ['menuTitle', 'Título de la página de la carta', 'La carta'],
    ['eyebrowAbout', 'Etiqueta de «Nosotros»', 'Nuestra historia'], ['eyebrowLoc', 'Etiqueta de «Visítenos»', 'Visítenos'], ['locTitle', 'Título de «Visítenos»', 'En el centro de Pijao'],
    ['eyebrowShop', 'Etiqueta de «Productos»', 'Productos de la casa'], ['shopTitle', 'Título de «Productos»', 'Llévese un pedacito de Pijao']
  ];
  function vTextos() {
    var T = D.texts;
    return head('Textos y avisos', 'Los cambios se guardan solos al escribir.') +
      '<section class="card stack"><h2>Aviso destacado</h2><p class="hint">Una franja en la parte superior de todas las páginas. Úsela para horarios especiales, eventos o cierres.</p>' +
      '<label class="switch"><input type="checkbox" data-t="noticeOn"' + (T.noticeOn ? ' checked' : '') + '><i></i>Mostrar el aviso en el sitio</label>' +
      '<div class="field"><label>Mensaje del aviso</label><input data-t="notice" value="' + esc(T.notice || '') + '" placeholder="Ej.: Este domingo abrimos desde las 10:00 a.m."></div></section>' +
      '<section class="card stack"><h2>Información de la casa</h2>' + MAIN_TEXTS.map(function (f) {
        return '<div class="field"><label>' + f[1] + '</label>' + (f[2] === 't' ? '<textarea data-t="' + f[0] + '" rows="' + (f[0] === 'aboutText' ? 6 : 3) + '" placeholder="' + esc(DEF_TEXTS[f[0]] || '') + '">' + esc(T[f[0]] || '') + '</textarea>' : '<input data-t="' + f[0] + '" value="' + esc(T[f[0]] || '') + '" placeholder="' + esc(DEF_TEXTS[f[0]] || '') + '">') + '</div>';
      }).join('') + '</section>' +
      '<details class="card"><summary style="cursor:pointer"><h2 style="display:inline">Textos pequeños</h2> <span class="muted">· menú, botones y títulos</span></summary><p class="hint" style="margin:10px 0 14px">Si deja un campo vacío, el sitio usa el texto que aparece en gris.</p><div class="grid2">' +
      MICRO.map(function (f) { return '<div class="field"><label>' + f[1] + '</label><input data-t="' + f[0] + '" value="' + esc(T[f[0]] || '') + '" placeholder="' + esc(f[2]) + '"></div>'; }).join('') + '</div></details>';
  }

  /* ==========================================================================
     FOTOS
     ========================================================================== */
  function vFotos() {
    var box = function (key, title, hint, cls, def) {
      var src = D.images[key];
      return '<section class="card stack"><h2>' + title + '</h2><p class="hint">' + hint + '</p>' +
        '<label class="photo ' + cls + '">' + (src ? '<img src="' + esc(src) + '" alt=""><span class="change">Cambiar foto</span>' : '<img src="' + def + '" alt="" style="object-fit:contain;padding:12%;opacity:.5"><span class="change">Subir foto</span>') +
        '<input type="file" accept="image/*" data-photo="' + key + '" aria-label="' + title + '"></label>' +
        (src ? '<div><button class="b b--bad b--sm" type="button" data-act="img-del" data-img="' + key + '" data-confirm="¿Quitar foto?">Quitar foto y volver a la imagen original</button></div>' : '') + '</section>';
    };
    return head('Fotos', 'Al elegir una foto podrá ajustar el encuadre antes de subirla.') +
      box('hero', 'Foto de portada', 'Reemplaza el grabado de la iglesia en la portada. Ideal: la terraza al atardecer, en vertical.', 'photo--wide', '/assets/img/iglesia-grabado.webp') +
      box('about', 'Foto de «Nuestra historia»', 'Se muestra en círculo junto a la historia de la casa. Ideal: el local, el equipo o una bebida insignia.', 'photo--round', '/assets/img/logo-480.webp');
  }

  /* ==========================================================================
     APARIENCIA
     ========================================================================== */
  var PAL = [
    { n: 'Vinotinto Clásico', m: '#742B1E', c: '#F2EAD6', g: '#BF9B62', d: 'Colores del logo · original' },
    { n: 'Borgoña', m: '#5E1A1D', c: '#EFE6D8', g: '#C4A46E', d: 'Más profundo y sobrio' },
    { n: 'Café de origen', m: '#6A3B22', c: '#F0E4CF', g: '#C29A5B', d: 'Cálido, tono tostado' },
    { n: 'Verde cafetal', m: '#2F4A34', c: '#EEE8DA', g: '#C9A227', d: 'Para temporadas especiales' }
  ];
  var HEAD_FONTS = ['Cormorant Garamond', 'Playfair Display', 'Bodoni Moda', 'EB Garamond', 'Libre Baskerville', 'Marcellus', 'Prata', 'Lora'];
  var BODY_FONTS = ['Jost', 'Manrope', 'Outfit', 'Figtree', 'Work Sans', 'Inter'];
  var loadedFonts = {};
  function loadFont(n) {
    if (loadedFonts[n]) return; loadedFonts[n] = 1;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + n.replace(/ /g, '+') + '&display=swap'; document.head.appendChild(l);
  }
  function vApariencia() {
    var th = D.theme, m = th.maroon || PAL[0].m, c = th.cream || PAL[0].c, g = th.gold || PAL[0].g;
    var hf = th.headFont || HEAD_FONTS[0], bf = th.bodyFont || BODY_FONTS[0];
    HEAD_FONTS.concat(BODY_FONTS).forEach(loadFont);
    var pills = function (key, cur, opts) {
      return '<div class="seg" role="group">' + opts.map(function (o) { return '<button type="button" data-theme-key="' + key + '" data-theme-val="' + o[0] + '" aria-pressed="' + ((cur || 'normal') === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
    };
    return head('Apariencia', 'Colores y tipografías del sitio. Se aplican de inmediato para todos los visitantes.', '<button class="b" type="button" data-act="theme-reset" data-confirm="¿Restablecer?">Restablecer original</button>') +
      '<section class="card stack"><h2>Paletas</h2><div class="pals">' + PAL.map(function (p, i) {
        var on = p.m.toLowerCase() === m.toLowerCase() && p.c.toLowerCase() === c.toLowerCase() && p.g.toLowerCase() === g.toLowerCase();
        return '<button class="pal" type="button" data-pal="' + i + '" aria-pressed="' + on + '"><span><i style="background:' + p.m + '"></i><i style="background:' + p.c + '"></i><i style="background:' + p.g + '"></i></span><b>' + p.n + '</b><small>' + p.d + '</small></button>';
      }).join('') + '</div>' +
      '<h2 style="margin-top:8px">Colores a medida</h2><div class="colors">' +
      '<label><input type="color" data-color="maroon" value="' + m + '">Marca</label>' +
      '<label><input type="color" data-color="cream" value="' + c + '">Crema</label>' +
      '<label><input type="color" data-color="gold" value="' + g + '">Dorado</label></div></section>' +
      '<div class="grid2" style="margin-top:16px"><section class="card stack"><h2>Letra de títulos</h2><div class="fonts">' + HEAD_FONTS.map(function (f, i) {
        return '<button class="font" type="button" data-font="headFont" data-name="' + f + '" aria-pressed="' + (f === hf) + '" style="font-family:\'' + f + '\'">' + f + (i === 0 ? '<small>Original</small>' : '') + '</button>';
      }).join('') + '</div></section>' +
      '<section class="card stack"><h2>Letra de textos</h2><div class="fonts">' + BODY_FONTS.map(function (f, i) {
        return '<button class="font" type="button" data-font="bodyFont" data-name="' + f + '" aria-pressed="' + (f === bf) + '" style="font-family:\'' + f + '\';font-size:16px">' + f + (i === 0 ? '<small>Original</small>' : '') + '</button>';
      }).join('') + '</div></section></div>' +
      '<section class="card stack" style="margin-top:16px"><h2>Tamaños</h2>' +
      '<div class="field"><span>Texto de todo el sitio</span>' + pills('scale', th.scale, [['small', 'Pequeño'], ['normal', 'Normal'], ['large', 'Grande']]) + '</div>' +
      '<div class="field"><span>Texto de la carta</span>' + pills('menuScale', th.menuScale, [['small', 'Pequeño'], ['normal', 'Normal'], ['large', 'Grande']]) + '</div></section>';
  }
  function setTheme(patch) { Object.assign(D.theme, patch, { v: 2 }); track(saveTheme()).catch(function () {}); render(); }

  /* ==========================================================================
     USUARIOS
     ========================================================================== */
  function vUsuarios() {
    return head('Usuarios', 'Personas con acceso a este panel.') +
      '<section class="card stack"><h2>Con acceso</h2><div class="users">' + D.admins.map(function (a) {
        var me = a.user_id === S.id;
        return '<div class="user" data-user="' + esc(a.user_id) + '"><b>' + esc(a.username || '—') + (me ? ' <span class="muted">(usted)</span>' : '') + '</b>' +
          (me ? '' : '<span style="display:flex;gap:6px;flex-wrap:wrap"><button class="b b--sm" type="button" data-act="user-reset">Cambiar su contraseña</button><button class="b b--bad b--sm" type="button" data-act="user-del" data-confirm="¿Quitar acceso?">Quitar acceso</button></span>') + '</div>' +
          (resetFor === a.user_id ? '<form class="card stack" data-form="reset" style="margin:4px 0 8px"><p class="hint">Por seguridad, confirme primero su propia contraseña.</p>' +
            '<div class="grid2"><div class="field"><label for="rs-mine">Su contraseña actual</label><input id="rs-mine" type="password" autocomplete="current-password" required></div>' +
            '<div class="field"><label for="rs-new">Nueva contraseña para ' + esc(a.username) + '</label><input id="rs-new" type="password" autocomplete="new-password" minlength="8" required></div></div>' +
            '<div style="display:flex;gap:8px"><button class="b b--primary b--sm" type="submit">Guardar</button><button class="b b--ghost b--sm" type="button" data-act="user-reset-cancel">Cancelar</button></div></form>' : '');
      }).join('') + '</div></section>' +
      '<div class="grid2" style="margin-top:16px"><form class="card stack" data-form="mine"><h2>Cambiar mi contraseña</h2>' +
      '<div class="field"><label for="my-new">Nueva contraseña</label><input id="my-new" type="password" autocomplete="new-password" minlength="8" required></div>' +
      '<div class="field"><label for="my-new2">Repítala</label><input id="my-new2" type="password" autocomplete="new-password" minlength="8" required></div>' +
      '<div><button class="b b--primary" type="submit">Guardar</button></div></form>' +
      '<form class="card stack" data-form="create"><h2>Dar acceso a alguien</h2>' +
      '<div class="field"><label for="nu-u">Usuario</label><input id="nu-u" autocomplete="off" autocapitalize="none" placeholder="Ej.: maria" required></div>' +
      '<div class="field"><label for="nu-p">Contraseña</label><input id="nu-p" type="password" autocomplete="new-password" minlength="8" required></div>' +
      '<p class="hint">Mínimo 8 caracteres. Comparta el usuario y la contraseña con esa persona en privado.</p>' +
      '<div><button class="b b--primary" type="submit">Crear acceso</button></div></form></div>';
  }
  function loadAdmins() { return api('/rest/v1/admins?select=user_id,username&order=username').then(function (a) { D.admins = a || []; }); }

  /* ==========================================================================
     FOTOS: recorte y subida
     ========================================================================== */
  function cropImage(file, ratio, round) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onerror = function () { URL.revokeObjectURL(url); toast('No se pudo leer esa imagen.', true); resolve(null); };
      im.onload = function () {
        var fw = Math.min(360, window.innerWidth - 72), fh = Math.round(fw / ratio);
        var modal = document.createElement('div'); modal.className = 'modal';
        modal.innerHTML = '<div class="modal__box" role="dialog" aria-modal="true" aria-label="Ajustar foto"><h2 style="font-size:24px">Ajuste la foto</h2><p class="hint">Arrastre para mover y use la barra para acercar. Así se verá en el sitio.</p>' +
          '<div class="crop' + (round ? ' round' : '') + '" style="width:' + fw + 'px;height:' + fh + 'px"><img alt=""></div>' +
          '<input type="range" min="100" max="300" value="100" aria-label="Acercar">' +
          '<div style="display:flex;gap:8px"><button class="b" type="button" data-c="no" style="flex:1">Cancelar</button><button class="b b--primary" type="button" data-c="ok" style="flex:1">Usar esta foto</button></div></div>';
        document.body.appendChild(modal);
        var frame = $('.crop', modal), img = $('img', frame), zoom = $('input', modal);
        var base = Math.max(fw / im.width, fh / im.height), s = base, x = (fw - im.width * s) / 2, y = (fh - im.height * s) / 2, drag = null;
        var clamp = function () { x = Math.min(0, Math.max(fw - im.width * s, x)); y = Math.min(0, Math.max(fh - im.height * s, y)); };
        var draw = function () { clamp(); img.style.width = im.width * s + 'px'; img.style.height = im.height * s + 'px'; img.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
        img.src = url; draw();
        frame.addEventListener('pointerdown', function (e) { drag = { x: e.clientX - x, y: e.clientY - y }; frame.setPointerCapture(e.pointerId); });
        frame.addEventListener('pointermove', function (e) { if (!drag) return; x = e.clientX - drag.x; y = e.clientY - drag.y; draw(); });
        frame.addEventListener('pointerup', function () { drag = null; });
        zoom.addEventListener('input', function () { var ns = base * zoom.value / 100, cx = fw / 2 - x, cy = fh / 2 - y, r = ns / s; s = ns; x = fw / 2 - cx * r; y = fh / 2 - cy * r; draw(); });
        var close = function (v) { modal.remove(); URL.revokeObjectURL(url); resolve(v); };
        $('[data-c="no"]', modal).onclick = function () { close(null); };
        $('[data-c="ok"]', modal).onclick = function () {
          var OW = ratio >= 1 ? 1000 : 1200, OH = Math.round(OW / ratio), cv = document.createElement('canvas'), k = OW / fw;
          cv.width = OW; cv.height = OH;
          cv.getContext('2d').drawImage(im, x * k, y * k, im.width * s * k, im.height * s * k);
          cv.toBlob(function (b) { close(b); }, 'image/jpeg', .85);
        };
      };
      im.src = url;
    });
  }
  function upload(blob) {
    var name = 'f' + Date.now() + Math.random().toString(36).slice(2, 6) + '.jpg';
    return fresh().then(function () {
      return fetch(SB.url + '/storage/v1/object/fotos/' + name, { method: 'POST', headers: { apikey: SB.key, Authorization: 'Bearer ' + S.a, 'Content-Type': 'image/jpeg' }, body: blob });
    }).then(function (r) { if (!r.ok) throw new Error('subida'); return SB.url + '/storage/v1/object/public/fotos/' + name; });
  }

  /* ==========================================================================
     EVENTOS
     ========================================================================== */
  document.addEventListener('click', function (e) {
    if (!S) return;
    var t;
    if ((t = e.target.closest('[data-view]'))) return go(t.dataset.view);
    if ((t = e.target.closest('[data-res]'))) return resAction(t);
    if ((t = e.target.closest('[data-res-filter]'))) {
      resFilter = t.dataset.resFilter;
      var need = (resFilter === 'pasadas' || resFilter === 'todas') && !D.past.length;
      render(); if (need) loadReservas().then(render).catch(function () {});
      return;
    }
    if ((t = e.target.closest('[data-cat-move]'))) {
      e.preventDefault();
      var c = catOf(t), i = D.menu.indexOf(c), j = i + +t.dataset.catMove, o = D.menu[j]; if (!o) return;
      var p = c.position; c.position = o.position; o.position = p; if (c.position === o.position) { c.position = j; o.position = i; }
      D.menu.sort(function (a, b) { return a.position - b.position; });
      track(upsert([{ col: 'menu', id: c.id, position: c.position, data: rowOf(c) }, { col: 'menu', id: o.id, position: o.position, data: rowOf(o) }])).catch(function () {});
      return render();
    }
    if ((t = e.target.closest('[data-it-move]'))) {
      var cc = catOf(t), a = +t.closest('[data-j]').dataset.j, b2 = a + +t.dataset.itMove;
      if (!cc.items[b2]) return;
      var tmp = cc.items[a]; cc.items[a] = cc.items[b2]; cc.items[b2] = tmp;
      track(saveCat(cc)).catch(function () {}); return render();
    }
    if ((t = e.target.closest('[data-prod-move]'))) {
      var pp = prodOf(t), pi = D.shop.indexOf(pp), po = D.shop[pi + +t.dataset.prodMove]; if (!po) return;
      var q = pp.position; pp.position = po.position; po.position = q; if (pp.position === po.position) { pp.position = pi + +t.dataset.prodMove; po.position = pi; }
      D.shop.sort(function (x, y) { return x.position - y.position; });
      track(upsert([{ col: 'shop', id: pp.id, position: pp.position, data: rowOf(pp) }, { col: 'shop', id: po.id, position: po.position, data: rowOf(po) }])).catch(function () {});
      return render();
    }
    if ((t = e.target.closest('[data-pal]'))) { var pl = PAL[+t.dataset.pal]; return setTheme({ maroon: pl.m, cream: pl.c, gold: pl.g }); }
    if ((t = e.target.closest('[data-font]'))) { var fp = {}; fp[t.dataset.font] = t.dataset.name; return setTheme(fp); }
    if ((t = e.target.closest('[data-theme-key]'))) { var tp = {}; tp[t.dataset.themeKey] = t.dataset.themeVal; return setTheme(tp); }
    if (!(t = e.target.closest('[data-act]'))) return;
    var act = t.dataset.act;
    if (act === 'logout') return logout();
    if (act === 'res-refresh') { t.disabled = true; return loadReservas().then(function () { render(); toast('Reservas actualizadas'); }).catch(function () { t.disabled = false; toast('No se pudo actualizar.', true); }); }
    if (act === 'cat-add') {
      var nc = { id: 'c' + uid(), position: D.menu.length ? Math.max.apply(null, D.menu.map(function (m) { return m.position; })) + 1 : 0, name: 'Nueva categoría', emoji: '', items: [] };
      D.menu.push(nc); openCats[nc.id] = 1; track(saveCat(nc)).catch(function () {}); render();
      var ni = $('[data-cat="' + nc.id + '"] [data-cat-field="name"]'); if (ni) { ni.focus(); ni.select(); ni.scrollIntoView({ block: 'center' }); }
      return;
    }
    if (act === 'cat-del') {
      if (!armed(t)) return;
      var dc = catOf(t);
      return track(delRow('menu', dc.id)).then(function () { D.menu = D.menu.filter(function (m) { return m !== dc; }); toast('Categoría eliminada'); render(); }).catch(function () {});
    }
    if (act === 'it-add') {
      var ac = catOf(t); ac.items = ac.items || [];
      ac.items.push(ac.cols && ac.cols.length ? { n: '', v: ac.cols.map(function () { return ''; }) } : { n: '', d: '', p: '' });
      openCats[ac.id] = 1; track(saveCat(ac)).catch(function () {}); render();
      var rows = $$('[data-cat="' + ac.id + '"] .item'); var last = rows[rows.length - 1]; if (last) $('input', last).focus();
      return;
    }
    if (act === 'it-del') {
      if (!armed(t)) return;
      var dcat = catOf(t); dcat.items.splice(+t.closest('[data-j]').dataset.j, 1); track(saveCat(dcat)).catch(function () {}); return render();
    }
    if (act === 'prod-add') {
      var np = { id: 'p' + uid(), position: D.shop.length ? Math.max.apply(null, D.shop.map(function (x) { return x.position; })) + 1 : 0, name: '', price: '', desc: '', img: '', cat: '', opts: '', on: false, out: false };
      D.shop.push(np); track(saveProd(np)).catch(function () {}); render();
      var nn = $('[data-prod="' + np.id + '"] [data-p="name"]'); if (nn) { nn.focus(); nn.scrollIntoView({ block: 'center' }); }
      return;
    }
    if (act === 'prod-del') {
      if (!armed(t)) return;
      var dp = prodOf(t);
      return track(delRow('shop', dp.id)).then(function () { D.shop = D.shop.filter(function (x) { return x !== dp; }); toast('Producto eliminado'); render(); }).catch(function () {});
    }
    if (act === 'img-del') {
      if (!armed(t)) return;
      var key = t.dataset.img;
      return track(delRow('img', key)).then(function () { delete D.images[key]; render(); }).catch(function () {});
    }
    if (act === 'theme-reset') { if (!armed(t)) return; D.theme = { v: 2 }; track(saveTheme()).catch(function () {}); return render(); }
    if (act === 'user-reset') { resetFor = t.closest('[data-user]').dataset.user; render(); var f = $('#rs-mine'); if (f) f.focus(); return; }
    if (act === 'user-reset-cancel') { resetFor = null; return render(); }
    if (act === 'user-del') {
      if (!armed(t)) return;
      var who = t.closest('[data-user]').dataset.user;
      return track(api('/rest/v1/admins?user_id=eq.' + encodeURIComponent(who), { method: 'DELETE' })).then(loadAdmins).then(function () { toast('Acceso retirado'); render(); }).catch(function () {});
    }
  });

  document.addEventListener('toggle', function (e) {
    var d = e.target; if (d.matches && d.matches('details[data-cat]')) { if (d.open) openCats[d.dataset.cat] = 1; else delete openCats[d.dataset.cat]; }
  }, true);

  document.addEventListener('input', function (e) {
    if (!S) return;
    var t = e.target, c, p;
    if (t.matches('[data-res-q]')) { resQ = t.value.trim(); var pos = t.selectionStart; render(); var q = $('[data-res-q]'); q.focus(); try { q.setSelectionRange(pos, pos); } catch (x) {} return; }
    if (t.matches('[data-cat-field]')) {
      c = catOf(t); c[t.dataset.catField] = t.value;
      if (t.dataset.catField === 'name') { var h = t.closest('details').querySelector('summary h3'); h.textContent = t.value || 'Sin nombre'; }
      return later('menu:' + c.id, function () { return saveCat(c); });
    }
    if (t.matches('[data-it], [data-it-v]')) {
      c = catOf(t); var it = c.items[+t.closest('[data-j]').dataset.j];
      if (t.dataset.itV != null) { it.v = it.v || []; it.v[+t.dataset.itV] = t.value; } else it[t.dataset.it] = t.value;
      return later('menu:' + c.id, function () { return saveCat(c); });
    }
    if (t.matches('[data-p]') && t.type !== 'checkbox') {
      p = prodOf(t); p[t.dataset.p] = t.value;
      return later('shop:' + p.id, function () { return saveProd(p); });
    }
    if (t.matches('[data-t]') && t.type !== 'checkbox') { D.texts[t.dataset.t] = t.value; return later('texts', saveTexts); }
  });

  document.addEventListener('change', function (e) {
    if (!S) return;
    var t = e.target, c, p;
    // precios: formato $12.000 al terminar de escribir
    if (t.matches('[data-it="p"], [data-it-v]')) {
      c = catOf(t); var it = c.items[+t.closest('[data-j]').dataset.j], v = money(t.value); t.value = v;
      if (t.dataset.itV != null) it.v[+t.dataset.itV] = v; else it.p = v;
      return later('menu:' + c.id, function () { return saveCat(c); });
    }
    if (t.matches('[data-p="price"]')) { p = prodOf(t); p.price = money(t.value); t.value = p.price; return later('shop:' + p.id, function () { return saveProd(p); }); }
    if (t.matches('[data-p]') && t.type === 'checkbox') {
      p = prodOf(t); p[t.dataset.p] = t.checked;
      if (t.dataset.p === 'on' && t.checked && !p.name) toast('Escriba el nombre del producto para que aparezca en el sitio.', true);
      t.closest('.prod').classList.toggle('is-draft', !p.on);
      return track(saveProd(p)).catch(function () {});
    }
    if (t.matches('[data-t]') && t.type === 'checkbox') { D.texts[t.dataset.t] = t.checked; return track(saveTexts()).catch(function () {}); }
    if (t.matches('[data-color]')) { var cp = {}; cp[t.dataset.color] = t.value; return setTheme(cp); }
    if (t.matches('[data-photo]')) {
      var file = t.files && t.files[0], kind = t.dataset.photo; if (!file) return;
      var prod = kind === 'prod' ? prodOf(t) : null;
      t.value = '';
      cropImage(file, kind === 'about' ? 1 : 0.8, kind === 'about').then(function (blob) {
        if (!blob) return;
        setSaving('saving'); toast('Subiendo foto…');
        return upload(blob).then(function (url) {
          if (prod) { prod.img = url; return track(saveProd(prod)); }
          D.images[kind] = url; return track(upsert([{ col: 'img', id: kind, position: 0, data: { src: url } }]));
        }).then(function () { toast('Foto actualizada'); render(); });
      }).catch(function () { setSaving('bad'); toast('No se pudo subir la foto. Intente con otra imagen.', true); });
    }
  });

  // nota interna de una reserva: se guarda al salir del campo
  document.addEventListener('focusout', function (e) {
    var t = e.target; if (!S || !t.matches || !t.matches('[data-res-note]')) return;
    var r = findRes(t.closest('.res').dataset.id); var v = t.value.trim();
    if (r && (r.nota_interna || '') !== v) patchRes(r, { nota_interna: v || null }).catch(function () {});
  });

  document.addEventListener('submit', function (e) {
    var f = e.target; if (!S || !f.dataset.form) return;
    e.preventDefault();
    var btn = f.querySelector('[type=submit]');
    if (f.dataset.form === 'mine') {
      var a = $('#my-new').value, b = $('#my-new2').value;
      if (a.length < 8) return toast('La contraseña debe tener al menos 8 caracteres.', true);
      if (a !== b) return toast('Las contraseñas no coinciden.', true);
      btn.disabled = true;
      return fresh().then(function () { return fetch(SB.url + '/auth/v1/user', { method: 'PUT', headers: { apikey: SB.key, Authorization: 'Bearer ' + S.a, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: a }) }); })
        .then(function (r) { if (!r.ok) throw 0; f.reset(); toast('Su contraseña se actualizó.'); })
        .catch(function () { toast('No se pudo cambiar la contraseña.', true); }).then(function () { btn.disabled = false; });
    }
    if (f.dataset.form === 'reset') {
      var mine = $('#rs-mine').value, nw = $('#rs-new').value;
      if (nw.length < 8) return toast('La nueva contraseña debe tener al menos 8 caracteres.', true);
      btn.disabled = true;
      return api('/rest/v1/rpc/reset_admin_password', { method: 'POST', body: JSON.stringify({ target_user_id: resetFor, new_password: nw, my_current_password: mine }) })
        .then(function () { resetFor = null; toast('Contraseña actualizada.'); render(); })
        .catch(function (x) { btn.disabled = false; toast(String(x.message).indexOf('wrong_current_password') > -1 ? 'Su contraseña actual no es correcta.' : 'No se pudo cambiar la contraseña.', true); });
    }
    if (f.dataset.form === 'create') {
      var u = $('#nu-u').value.trim(), pw = $('#nu-p').value;
      if (slug(u).length < 2) return toast('Escriba un nombre de usuario.', true);
      if (pw.length < 8) return toast('La contraseña debe tener al menos 8 caracteres.', true);
      btn.disabled = true;
      return fetch(SB.url + '/auth/v1/signup', { method: 'POST', headers: { apikey: SB.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: slug(u) + '@' + DOMAIN, password: pw }) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw j; return j; }); })
        .then(function (j) { var id = (j.user && j.user.id) || j.id; return api('/rest/v1/admins', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: id, username: u }) }); })
        .then(loadAdmins).then(function () { toast('Acceso creado para ' + u + '.'); render(); })
        .catch(function (x) { btn.disabled = false; toast(String((x && (x.msg || x.message)) || '').indexOf('registered') > -1 ? 'Ese usuario ya existe.' : 'No se pudo crear el acceso.', true); });
    }
  });

  window.addEventListener('hashchange', function () { if (S && $('#main')) go(location.hash.slice(1)); });

  /* ---------- arranque ---------- */
  function start() {
    return loadAdmins().then(function () {
      if (!D.admins.some(function (a) { return a.user_id === S.id; })) throw new Error('sin acceso');
      shell();
      $('#main').innerHTML = '<div class="loading"><span class="spin"><i></i></span>Cargando…</div>';
      return Promise.all([loadContent(), loadReservas()]);
    }).then(function () {
      go(location.hash.slice(1) || 'reservas');
      clearInterval(pollTimer);
      pollTimer = setInterval(function () {
        if (document.hidden || !S) return;
        loadReservas().then(function () {
          var typing = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
          if (view === 'reservas' && !typing) render();
        }).catch(function () {});
      }, 60000);
    });
  }

  loadSession();
  if (S) start().catch(function (x) { logout(x && x.message === 'sin acceso' ? 'Este usuario no tiene acceso al panel.' : 'Ingrese de nuevo para continuar.'); });
  else renderLogin();
})();
