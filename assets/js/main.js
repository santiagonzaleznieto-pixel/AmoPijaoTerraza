/* ==========================================================================
   Amo Pijao Terraza — interacción del sitio (todas las páginas)
   El contenido de cada página está completo en el HTML; este archivo lo
   mejora. Expone window.APT para que cms.js (panel de administración) pueda
   actualizar horario, teléfono y carta sin duplicar lógica.
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s, p) { return (p || document).querySelector(s); };
  var $$ = function (s, p) { return Array.prototype.slice.call((p || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var APT = window.APT = { phone: '573104337667', hours: { open: 13 * 60, close: 22 * 60, daily: true } };

  /* ---------- utilidades ---------- */
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); };
  var slug = function (s) { return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'categoria'; };
  APT.esc = esc; APT.norm = norm; APT.slug = slug;

  var headerOffset = function () {
    var h = $('.site-header');
    return h ? h.getBoundingClientRect().height : 70;
  };

  /** Hora actual en Colombia (America/Bogota), sin depender de la zona del visitante. */
  function bogotaNow() {
    var parts = {};
    try {
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short'
      }).formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    } catch (e) {
      var d = new Date(Date.now() - 5 * 3600e3); // UTC-5, Colombia no usa horario de verano
      parts = { year: d.getUTCFullYear(), month: String(d.getUTCMonth() + 1).padStart(2, '0'), day: String(d.getUTCDate()).padStart(2, '0'),
        hour: d.getUTCHours(), minute: d.getUTCMinutes(), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] };
    }
    return {
      date: parts.year + '-' + parts.month + '-' + parts.day,
      minutes: (+parts.hour % 24) * 60 + (+parts.minute),
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
    };
  }

  /** 790 → "1:10 p.m." */
  function fmtTime(min) {
    min = ((min % 1440) + 1440) % 1440;
    var h = Math.floor(min / 60), m = min % 60, h12 = h % 12 || 12;
    return h12 + ':' + String(m).padStart(2, '0') + (h < 12 ? ' a.m.' : ' p.m.');
  }
  var atTime = function (min) { return (Math.floor((min % 1440) / 60) % 12 === 1 ? 'a la ' : 'a las ') + fmtTime(min); };
  APT.fmtTime = fmtTime;

  /* ---------- horario y estado "abierto ahora" ---------- */
  /** Interpreta "Todos los días\n1:00 p.m. – 10:00 p.m.", "13:00 - 22:00", "12 m. a 10 pm"… */
  APT.parseHours = function (text) {
    var t = norm(text).replace(/\s+/g, ' ');
    var re = /(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|m\.?(?![a-z]))?/g, tok = [], m;
    while ((m = re.exec(t)) && tok.length < 2) {
      if (+m[1] > 24 || +(m[2] || 0) > 59) continue;
      tok.push({ h: +m[1], m: +(m[2] || 0), mer: m[3] ? m[3].charAt(0) : '' });
    }
    if (tok.length < 2) return null;
    var toMin = function (x, mer) {
      var h = x.h;
      if (mer === 'm') h = 12; else if (mer === 'p') h = (h % 12) + 12; else if (mer === 'a') h = h % 12;
      return (h % 24) * 60 + x.m;
    };
    var o = tok[0], c = tok[1];
    var close = toMin(c, c.mer || (o.mer === 'p' && c.h < 12 ? 'p' : ''));
    var open = toMin(o, o.mer);
    if (!o.mer && o.h <= 12 && (c.mer === 'p' || c.mer === 'a')) { var g = toMin(o, c.mer); if (g < close) open = g; }
    var hasDays = /(lunes|martes|miercoles|jueves|viernes|sabado|domingo|festivo)/.test(t);
    return { open: open, close: close <= open ? close + 1440 : close, daily: !hasDays || /todos/.test(t) };
  };

  function renderStatus() {
    var H = APT.hours;
    $$('[data-status]').forEach(function (el) {
      var txt = $('[data-status-text]', el);
      var put = function (st, h) { el.dataset.state = st; if (txt.innerHTML !== h) txt.innerHTML = h; };
      if (!H || !H.daily) { el.dataset.state = 'unknown'; return; }
      var now = bogotaNow().minutes, open = H.open, close = H.close;
      var isOpen = (now >= open && now < close) || (close > 1440 && now < close - 1440);
      if (isOpen) {
        var left = (close > 1440 && now < open ? close - 1440 : close) - now;
        put('open', left <= 45 ? '<strong>Cierra pronto</strong> · ' + atTime(close) : '<strong>Abierto ahora</strong> · hasta ' + atTime(close).replace(/^a /, ''));
      } else {
        put('closed', '<strong>Cerrado</strong> · abre ' + (now < open ? 'hoy ' : 'mañana ') + atTime(open));
      }
    });
  }

  function renderHoursTable() {
    var table = $('[data-hours-table]'); if (!table) return;
    var H = APT.hours;
    table.hidden = !(H && H.daily);
    if (table.hidden) return;
    var range = fmtTime(H.open) + ' – ' + fmtTime(H.close);
    var today = bogotaNow().weekday;
    $$('tr[data-day]', table).forEach(function (tr) {
      $('td', tr).textContent = range;
      tr.classList.toggle('is-today', +tr.dataset.day === today);
    });
  }

  APT.setHours = function (text) {
    var parsed = APT.parseHours(text);
    APT.hours = parsed || { daily: false };
    if (!parsed || !parsed.daily) {
      var line = String(text).split('\n').map(function (s) { return s.trim(); }).filter(Boolean).join(' · ');
      $$('[data-status-text]').forEach(function (t) { t.textContent = line; });
    }
    renderStatus(); renderHoursTable(); buildTimeOptions();
  };

  /* ---------- teléfono / WhatsApp ---------- */
  APT.setPhone = function (digits) {
    digits = String(digits || '').replace(/\D/g, '');
    if (digits.length === 10) digits = '57' + digits;
    if (digits.length < 11) return;
    APT.phone = digits;
    $$('[data-tel]').forEach(function (a) { a.href = 'tel:+' + digits; });
    $$('[data-wa]').forEach(function (a) { a.href = a.href.replace(/wa\.me\/\d+/, 'wa.me/' + digits); });
  };
  var waLink = function (msg) { return 'https://wa.me/' + APT.phone + '?text=' + encodeURIComponent(msg); };
  APT.waLink = waLink;

  /* ---------- navegación móvil ---------- */
  var toggle = $('.menu-toggle'), mobileNav = $('#menu-movil');
  function setMobileNav(open) {
    if (!toggle || !mobileNav) return;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    mobileNav.hidden = !open;
  }
  if (toggle && mobileNav) {
    toggle.addEventListener('click', function () { setMobileNav(toggle.getAttribute('aria-expanded') !== 'true'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !mobileNav.hidden) { setMobileNav(false); toggle.focus(); } });
    window.matchMedia('(min-width: 901px)').addEventListener('change', function (e) { if (e.matches) setMobileNav(false); });
  }

  /* ---------- aviso superior ---------- */
  APT.showNotice = function (text) {
    var n = $('#aviso'); if (!n || !text) return;
    var key = 'apt-notice:' + text;
    try { if (sessionStorage.getItem(key)) return; } catch (e) {}
    $('[data-notice-text]', n).textContent = text;
    n.hidden = false;
    $('.notice__close', n).onclick = function () { n.hidden = true; try { sessionStorage.setItem(key, '1'); } catch (e) {} };
  };

  /* ==========================================================================
     Carta: una categoría a la vez, buscador en toda la carta
     ========================================================================== */
  var menu = $('[data-menu]');
  var search = $('#menu-search');
  var M = { tabs: [], panels: [], active: null };

  APT.formatPrice = function (p) { return String(p == null ? '' : p).trim().replace(/\/\s*(?=\d)/g, '/ $'); };

  /** HTML de la carta a partir de los datos del panel (mismo marcado que tools/build.py). */
  APT.menuHTML = function (cats) {
    var used = {}, tabs = [], panels = [];
    cats.forEach(function (c) {
      var id = slug(c.name); if (used[id]) id += '-' + (++used[id]); else used[id] = 1;
      var items = c.items || [], n = items.length, body;
      tabs.push('<a class="cat" href="#cat-' + id + '" role="tab" id="tab-' + id + '" aria-controls="cat-' + id + '" aria-selected="false" data-cat-link="' + id + '"><span>' + esc(c.name) + '</span><span class="cat__n">' + n + '</span></a>');
      if (c.cols && c.cols.length) {
        body = '<div class="table-scroll"><table class="price-table"><thead><tr><th scope="col"><span class="visually-hidden">Producto</span></th>' +
          c.cols.map(function (x) { return '<th scope="col">' + esc(x) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          items.map(function (it) { return '<tr data-item><td>' + esc(it.n) + '</td>' + (it.v || []).map(function (v) { return '<td>' + esc(APT.formatPrice(v)) + '</td>'; }).join('') + '</tr>'; }).join('') +
          '</tbody></table></div>';
      } else {
        body = '<ul class="dishes">' + items.map(function (it) {
          return '<li class="dish" data-item><div class="dish__row"><span class="dish__name">' + esc(it.n) + '</span><span class="dish__leader" aria-hidden="true"></span><span class="dish__price">' + esc(APT.formatPrice(it.p)) + '</span></div>' +
            (it.d ? '<p class="dish__desc">' + esc(it.d) + '</p>' : '') + '</li>';
        }).join('') + '</ul>';
      }
      panels.push('<section class="menu-cat" id="cat-' + id + '" role="tabpanel" aria-labelledby="tab-' + id + '" data-cat="' + id + '">' +
        '<div class="menu-panel__head"><h2>' + esc(c.name) + '</h2><span class="label">' + n + (n === 1 ? ' opción' : ' opciones') + '</span></div>' +
        (c.note ? '<p class="menu-panel__note">' + esc(c.note) + '</p>' : '') + body + '</section>');
    });
    return { tabs: tabs.join(''), panels: panels.join('') };
  };

  APT.renderMenu = function (cats, opts) {
    if (!menu || !cats || !cats.length) return;
    var h = APT.menuHTML(cats);
    $('[data-menu-cats]', menu).innerHTML = h.tabs;
    $('[data-menu-panels]', menu).innerHTML = h.panels;
    var total = cats.reduce(function (a, c) { return a + (c.items || []).length; }, 0);
    var lbl = $('.page-carta .facade .label'); if (lbl) lbl.textContent = total + ' productos · precios en pesos colombianos';
    if (opts && opts.scale) menu.style.fontSize = { small: '.94em', large: '1.08em' }[opts.scale] || '';
    setupMenu();
  };

  function setupMenu() {
    M.tabs = $$('[data-cat-link]', menu);
    M.panels = $$('[data-cat]', menu);
    M.panels.forEach(function (p) {
      var cname = norm($('h2', p).textContent);
      $$('[data-item]', p).forEach(function (it) { it.dataset.search = norm(it.textContent) + ' ' + cname; });
    });
    var fromHash = location.hash.replace(/^#cat-/, '');
    var first = M.panels.some(function (p) { return p.dataset.cat === fromHash; }) ? fromHash : (M.panels[0] && M.panels[0].dataset.cat);
    M.active = first;
    if (search && search.value.trim()) filterMenu(search.value); else select(first, {});
  }

  function select(id, opt) {
    if (!id) return;
    opt = opt || {};
    M.active = id;
    var idx = 0;
    M.tabs.forEach(function (t, i) {
      var on = t.dataset.catLink === id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on) { idx = i; if (opt.focus) t.focus({ preventScroll: true }); centerTab(t); }
    });
    M.panels.forEach(function (p) {
      p.hidden = p.dataset.cat !== id;
      $$('[data-item]', p).forEach(function (it) { it.hidden = false; });
    });
    // anterior / siguiente
    var prev = $('[data-prev]', menu), next = $('[data-next]', menu);
    var pT = M.tabs[idx - 1], nT = M.tabs[idx + 1];
    prev.hidden = !pT; next.hidden = !nT;
    if (pT) { $('b', prev).textContent = $('span', pT).textContent; prev.dataset.go = pT.dataset.catLink; }
    if (nT) { $('b', next).textContent = $('span', nT).textContent; next.dataset.go = nT.dataset.catLink; }
    if (opt.hash) history.replaceState(null, '', '#cat-' + id);
    if (opt.scroll) {
      var bar = $('[data-menu-cats]', menu), cs = getComputedStyle(bar);
      var stickyBar = cs.display === 'flex' ? bar.offsetHeight : 0; // en móvil la barra de categorías es fija arriba
      var top = $('.menu-panel', menu).getBoundingClientRect().top + window.scrollY - headerOffset() - stickyBar - 16;
      if (window.scrollY > top) window.scrollTo({ top: top, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }

  function centerTab(t) {
    var bar = t.parentNode;
    if (bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollTo({ left: t.offsetLeft - bar.clientWidth / 2 + t.offsetWidth / 2, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function filterMenu(raw) {
    var q = norm(raw), words = q.split(/\s+/).filter(Boolean), shown = 0;
    var results = $('[data-menu-results]', menu), empty = $('[data-menu-empty]', menu);
    menu.classList.toggle('is-searching', !!q);
    if (!q) {
      results.hidden = true; empty.hidden = true;
      M.tabs.forEach(function (t) { t.hidden = false; });
      select(M.active || (M.panels[0] && M.panels[0].dataset.cat), {});
      return;
    }
    M.panels.forEach(function (p) {
      var visible = 0;
      $$('[data-item]', p).forEach(function (it) {
        var ok = words.every(function (w) { return it.dataset.search.indexOf(w) > -1; });
        it.hidden = !ok; if (ok) visible++;
      });
      p.hidden = !visible; shown += visible;
      var tab = document.getElementById('tab-' + p.dataset.cat);
      if (tab) { tab.hidden = !visible; tab.setAttribute('aria-selected', 'false'); }
    });
    results.hidden = !shown;
    results.textContent = (shown === 1 ? '1 resultado' : shown + ' resultados') + ' para «' + raw.trim() + '»';
    empty.hidden = shown > 0;
    $('[data-menu-query]', menu).textContent = raw.trim();
  }

  if (menu) {
    menu.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-cat-link]');
      if (tab) {
        e.preventDefault();
        if (search && search.value) { search.value = ''; menu.classList.remove('is-searching'); $('[data-menu-results]', menu).hidden = true; $('[data-menu-empty]', menu).hidden = true; M.tabs.forEach(function (t) { t.hidden = false; }); }
        select(tab.dataset.catLink, { hash: true, scroll: true });
        return;
      }
      var pager = e.target.closest('[data-prev], [data-next]');
      if (pager && pager.dataset.go) select(pager.dataset.go, { hash: true, scroll: true, focus: true });
    });
    menu.addEventListener('keydown', function (e) {
      var tab = e.target.closest('[data-cat-link]'); if (!tab) return;
      var list = M.tabs.filter(function (t) { return !t.hidden; }), i = list.indexOf(tab), to = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = list[(i + 1) % list.length];
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = list[(i - 1 + list.length) % list.length];
      else if (e.key === 'Home') to = list[0];
      else if (e.key === 'End') to = list[list.length - 1];
      if (to) { e.preventDefault(); select(to.dataset.catLink, { hash: true, focus: true }); }
    });
    if (search) {
      var timer;
      search.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { filterMenu(search.value); }, 90); });
      search.addEventListener('keydown', function (e) { if (e.key === 'Escape') { search.value = ''; filterMenu(''); } });
    }
    window.addEventListener('hashchange', function () {
      var id = location.hash.replace(/^#cat-/, '');
      if (M.panels.some(function (p) { return p.dataset.cat === id; })) select(id, {});
    });
    setupMenu();
  }

  /* ==========================================================================
     Reservas
     ========================================================================== */
  var form = $('#reserva-form');
  var timeSelect = form && form.elements.hora, dateInput = form && form.elements.fecha;

  function addDays(iso, n) {
    var p = iso.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.toISOString().slice(0, 10);
  }

  function buildTimeOptions() {
    if (!timeSelect) return;
    var H = APT.hours && APT.hours.open != null ? APT.hours : { open: 13 * 60, close: 22 * 60 };
    var prev = timeSelect.value, now = bogotaNow(), isToday = dateInput.value === now.date;
    var html = '<option value="">Elige una hora</option>', last = Math.min(H.close - 60, 1410);
    for (var m = H.open; m <= last; m += 30) {
      var past = isToday && m < now.minutes + 30;
      html += '<option value="' + fmtTime(m) + '"' + (past ? ' disabled' : '') + '>' + fmtTime(m) + (past ? ' (ya pasó)' : '') + '</option>';
    }
    timeSelect.innerHTML = html;
    timeSelect.value = prev && $('option[value="' + prev + '"]:not([disabled])', timeSelect) ? prev : '';
  }
  var hasFreeTime = function () { return !!$('option[value]:not([value=""]):not([disabled])', timeSelect); };
  function resetDate() {
    var today = bogotaNow().date;
    dateInput.min = today; dateInput.value = today; buildTimeOptions();
    if (!hasFreeTime()) { dateInput.value = addDays(today, 1); buildTimeOptions(); }
  }

  function fieldError(input, msg) {
    var box = document.getElementById(input.getAttribute('aria-describedby'));
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (box) box.textContent = msg || '';
  }

  function validate() {
    var first = null;
    [['nombre', function (v) { return v.trim().length >= 2 ? '' : 'Escribe tu nombre.'; }],
     ['telefono', function (v) { return v.replace(/\D/g, '').length >= 7 ? '' : 'Escribe un número de contacto válido.'; }],
     ['fecha', function (v) { return !v ? 'Elige la fecha.' : v < bogotaNow().date ? 'Elige una fecha de hoy en adelante.' : ''; }],
     ['hora', function (v) { return v ? '' : 'Elige la hora.'; }]
    ].forEach(function (c) {
      var input = form.elements[c[0]], msg = c[1](input.value);
      fieldError(input, msg);
      if (msg && !first) first = input;
    });
    if (first) first.focus();
    return !first;
  }

  function prettyDate(iso) {
    try { var p = iso.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12)).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); }
    catch (e) { return iso; }
  }

  if (form) {
    resetDate();
    dateInput.addEventListener('change', buildTimeOptions);
    ['nombre', 'telefono', 'fecha', 'hora'].forEach(function (n) {
      var el = form.elements[n];
      ['input', 'change'].forEach(function (ev) { el.addEventListener(ev, function () { if (el.getAttribute('aria-invalid') === 'true') fieldError(el, ''); }); });
    });
    var success = $('[data-reserve-success]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate()) return;
      var d = Object.fromEntries(new FormData(form));
      var msg = 'Hola, quiero reservar una mesa en Amo Pijao Terraza:\n\n' +
        '• Nombre: ' + d.nombre.trim() + '\n• Celular: ' + d.telefono.trim() + '\n• Fecha: ' + prettyDate(d.fecha) +
        '\n• Hora: ' + d.hora + '\n• Personas: ' + (d.personas || '2 personas') +
        (d.notas && d.notas.trim() ? '\n• Notas: ' + d.notas.trim() : '');
      var link = waLink(msg);
      // WhatsApp en el mismo gesto del usuario (sin 'noopener', que hace que window.open devuelva null)
      var win = window.open(link, '_blank');
      if (win) { try { win.opener = null; } catch (err) {} }
      // copia por correo al negocio; si falla, no afecta al visitante
      if (form.dataset.endpoint && window.fetch) {
        fetch(form.dataset.endpoint, {
          method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(Object.assign({ _subject: 'Nueva reserva · ' + d.nombre.trim() + ' · ' + d.fecha + ' ' + d.hora }, d))
        }).catch(function () {});
      }
      $('[data-reserve-wa]', success).href = link;
      form.hidden = true; success.hidden = false; success.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      if (!win) window.location.href = link;
    });
    $('[data-reserve-again]').addEventListener('click', function () {
      form.reset(); resetDate();
      success.hidden = true; form.hidden = false; form.elements.nombre.focus();
    });
  }

  /* ---------- varios ---------- */
  $$('[data-year]').forEach(function (el) { el.textContent = bogotaNow().date.slice(0, 4); });
  renderStatus(); renderHoursTable();
  setInterval(function () { renderStatus(); renderHoursTable(); }, 60 * 1000);
})();
