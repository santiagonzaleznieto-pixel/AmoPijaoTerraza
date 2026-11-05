/* ==========================================================================
   Amo Pijao Terraza — interacción del sitio
   Todo el contenido funciona sin JavaScript; este archivo solo lo mejora.
   Expone window.APT para que cms.js (panel de administración) pueda
   actualizar horario, teléfono y carta sin duplicar lógica.
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s, p) { return (p || document).querySelector(s); };
  var $$ = function (s, p) { return Array.prototype.slice.call((p || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var APT = window.APT = {
    phone: '573104337667',
    hours: { open: 13 * 60, close: 22 * 60, daily: true },
  };

  /* ---------- utilidades ---------- */
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var norm = function (s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  };
  var slug = function (s) { return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'categoria'; };
  APT.esc = esc; APT.norm = norm; APT.slug = slug;

  /** Hora actual en Colombia (America/Bogota), sin depender de la zona del visitante. */
  function bogotaNow() {
    var parts = {};
    try {
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    } catch (e) {
      var d = new Date(Date.now() - 5 * 3600e3); // UTC-5, Colombia no usa horario de verano
      parts = { year: d.getUTCFullYear(), month: String(d.getUTCMonth() + 1).padStart(2, '0'), day: String(d.getUTCDate()).padStart(2, '0'), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
    }
    return { date: parts.year + '-' + parts.month + '-' + parts.day, minutes: (+parts.hour % 24) * 60 + (+parts.minute) };
  }

  /** 790 → "1:10 p.m." */
  function fmtTime(min) {
    min = ((min % 1440) + 1440) % 1440;
    var h = Math.floor(min / 60), m = min % 60, h12 = h % 12 || 12;
    return h12 + ':' + String(m).padStart(2, '0') + (h < 12 ? ' a.m.' : ' p.m.');
  }
  var atTime = function (min) { return (Math.floor(((min % 1440) / 60)) % 12 === 1 ? 'a la ' : 'a las ') + fmtTime(min); };
  APT.fmtTime = fmtTime;

  /* ---------- horario y estado "abierto ahora" ---------- */
  /** Interpreta textos como "Todos los días\n1:00 p.m. – 10:00 p.m.", "13:00 - 22:00", "12 m. a 10 pm". */
  APT.parseHours = function (text) {
    var t = norm(text).replace(/\s+/g, ' ');
    var re = /(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|m\.?(?![a-z]))?/g, tok = [], m;
    while ((m = re.exec(t)) && tok.length < 2) {
      if (+m[1] > 24 || +(m[2] || 0) > 59) continue;
      tok.push({ h: +m[1], m: +(m[2] || 0), mer: m[3] ? m[3].charAt(0) : '' });
    }
    if (tok.length < 2) return null;
    // a = a.m., p = p.m., m = mediodía ("12 m."), '' = formato de 24 horas
    var toMin = function (x, mer) {
      var h = x.h;
      if (mer === 'm') h = 12;
      else if (mer === 'p') h = (h % 12) + 12;
      else if (mer === 'a') h = h % 12;
      return (h % 24) * 60 + x.m;
    };
    var o = tok[0], c = tok[1];
    var close = toMin(c, c.mer || (o.mer === 'p' && c.h < 12 ? 'p' : ''));
    var open = toMin(o, o.mer);
    // "1 – 10 p.m.": la apertura sin a.m./p.m. toma la del cierre si así queda antes del cierre
    if (!o.mer && o.h <= 12 && (c.mer === 'p' || c.mer === 'a')) {
      var guess = toMin(o, c.mer);
      if (guess < close) open = guess;
    }
    var hasDays = /(lunes|martes|miercoles|jueves|viernes|sabado|domingo|festivo)/.test(t);
    return { open: open, close: close <= open ? close + 1440 : close, daily: !hasDays || /todos/.test(t) };
  };

  function renderStatus() {
    var el = $('[data-status]'); if (!el) return;
    var txt = $('[data-status-text]', el), H = APT.hours;
    var put = function (st, h) { el.dataset.state = st; if (txt.innerHTML !== h) txt.innerHTML = h; };
    if (!H || !H.daily) { el.dataset.state = 'unknown'; return; }
    var now = bogotaNow().minutes, open = H.open, close = H.close;
    var isOpen = (now >= open && now < close) || (close > 1440 && now < close - 1440);
    if (isOpen) {
      var left = (close > 1440 && now < open ? close - 1440 : close) - now;
      put('open', left <= 45
        ? '<strong>Cierra pronto</strong> · ' + atTime(close)
        : '<strong>Abierto ahora</strong> · hasta ' + atTime(close).replace(/^a /, ''));
    } else {
      put('closed', '<strong>Cerrado</strong> · abre ' + (now < open ? 'hoy ' : 'mañana ') + atTime(open));
    }
  }
  APT.setHours = function (text) {
    var parsed = APT.parseHours(text);
    APT.hours = parsed || { daily: false };
    if (!parsed || !parsed.daily) { var t = $('[data-status-text]'); if (t) t.textContent = String(text).split('\n').map(function (s) { return s.trim(); }).filter(Boolean).join(' · '); }
    renderStatus(); buildTimeOptions();
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

  /* ---------- encabezado, navegación móvil y sección activa ---------- */
  var header = $('.site-header');
  var menuBtn = $('.menu-button'), mobileNav = $('#menu-movil');

  function setMobileNav(open) {
    if (!menuBtn || !mobileNav) return;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    mobileNav.hidden = !open;
  }
  if (menuBtn) {
    menuBtn.addEventListener('click', function () { setMobileNav(menuBtn.getAttribute('aria-expanded') !== 'true'); });
    mobileNav.addEventListener('click', function (e) { if (e.target.closest('a')) setMobileNav(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !mobileNav.hidden) { setMobileNav(false); menuBtn.focus(); } });
    window.matchMedia('(min-width: 901px)').addEventListener('change', function (e) { if (e.matches) setMobileNav(false); });
  }

  var actionBar = $('.action-bar'), hero = $('#inicio');
  var navLinks = $$('.nav a[href^="#"], .mobile-nav a[href^="#"]');
  var sections = ['nosotros', 'carta', 'reservas', 'tienda', 'ubicacion'];

  function onScroll() {
    var y = window.scrollY;
    if (header) header.classList.toggle('is-scrolled', y > 8);
    if (actionBar && hero) actionBar.classList.toggle('is-visible', y > hero.offsetHeight * .6);
    var mark = y + window.innerHeight * .35, current = '';
    sections.forEach(function (id) {
      var s = document.getElementById(id);
      if (s && !s.hidden && s.offsetTop <= mark) current = id;
    });
    navLinks.forEach(function (a) {
      if (a.getAttribute('href') === '#' + current) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    menuSpy();
  }
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () { ticking = false; onScroll(); });
  }, { passive: true });

  /* ---------- aparición suave al hacer scroll ---------- */
  var revealObserver = null;
  APT.reveal = function (els) {
    if (reduceMotion || !('IntersectionObserver' in window)) { els.forEach(function (el) { el.classList.add('is-visible'); }); return; }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-visible'); revealObserver.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -10% 0px', threshold: .08 });
    }
    els.forEach(function (el) { el.classList.add('reveal'); revealObserver.observe(el); });
  };
  APT.reveal($$('.reveal'));

  /* ==========================================================================
     Carta: índice de categorías, buscador y tres estilos (lista / pestañas / acordeón)
     ========================================================================== */
  var menu = $('[data-menu]');
  var menuState = { layout: 'list', cats: [], active: null };

  APT.formatPrice = function (p) { return String(p == null ? '' : p).trim().replace(/\/\s*(?=\d)/g, '/ $'); };

  /** Genera el HTML de la carta a partir de los datos del panel. */
  APT.menuHTML = function (cats) {
    var used = {};
    var chips = [], blocks = [];
    cats.forEach(function (c) {
      var id = slug(c.name); if (used[id]) id += '-' + (++used[id]); else used[id] = 1;
      var items = c.items || [];
      var n = items.length;
      chips.push('<a class="chip" href="#cat-' + id + '" data-cat-link="' + id + '">' + esc(c.name) + '</a>');
      var body;
      if (c.cols && c.cols.length) {
        body = '<div class="table-scroll"><table class="price-table"><thead><tr><th scope="col"><span class="visually-hidden">Producto</span></th>' +
          c.cols.map(function (x) { return '<th scope="col">' + esc(x) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          items.map(function (it) {
            return '<tr data-item><td>' + esc(it.n) + '</td>' + (it.v || []).map(function (v) { return '<td>' + esc(APT.formatPrice(v)) + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>';
      } else {
        body = '<ul class="dishes">' + items.map(function (it) {
          return '<li class="dish" data-item><div class="dish__row"><span class="dish__name">' + esc(it.n) + '</span><span class="dish__leader" aria-hidden="true"></span><span class="dish__price">' + esc(APT.formatPrice(it.p)) + '</span></div>' +
            (it.d ? '<p class="dish__desc">' + esc(it.d) + '</p>' : '') + '</li>';
        }).join('') + '</ul>';
      }
      blocks.push('<div class="menu-cat" id="cat-' + id + '" data-cat="' + id + '">' +
        '<div class="menu-cat__head"><h3>' + esc(c.name) + '</h3><span class="menu-cat__count">' + n + (n === 1 ? ' opción' : ' opciones') + '</span></div>' +
        (c.note ? '<p class="menu-cat__note">' + esc(c.note) + '</p>' : '') +
        '<div class="menu-cat__body">' + body + '</div></div>');
    });
    return { chips: chips.join(''), list: blocks.join('') };
  };

  /** Reemplaza la carta con datos nuevos (usado por el panel). */
  APT.renderMenu = function (cats, opts) {
    if (!menu || !cats || !cats.length) return;
    var html = APT.menuHTML(cats);
    $('[data-menu-chips]', menu).innerHTML = html.chips;
    $('[data-menu-list]', menu).innerHTML = html.list;
    var total = cats.reduce(function (a, c) { return a + (c.items || []).length; }, 0);
    menuState.totalText = total + ' productos en ' + cats.length + ' categorías';
    $('[data-menu-count]', menu).textContent = menuState.totalText;
    setupMenu((opts && opts.layout) || menuState.layout);
    if (opts && opts.scale) menu.style.fontSize = { small: '.92em', large: '1.1em' }[opts.scale] || '';
  };

  function setupMenu(layout) {
    if (!menu) return;
    menuState.layout = ({ tabs: 'tabs', accordion: 'accordion' })[layout] || 'list';
    menu.classList.remove('menu--tabs', 'menu--accordion', 'menu--list');
    menu.classList.add('menu--' + menuState.layout);
    menuState.cats = $$('[data-cat]', menu);
    menuState.chips = $$('[data-cat-link]', menu);
    if (!menuState.totalText) menuState.totalText = $('[data-menu-count]', menu).textContent;
    // índice de búsqueda: nombre + descripción + categoría, sin tildes
    menuState.cats.forEach(function (cat) {
      var cname = norm($('h3', cat).textContent);
      $$('[data-item]', cat).forEach(function (it) { it.dataset.search = norm(it.textContent) + ' ' + cname; });
      if (menuState.layout === 'accordion' && !$('.menu-cat__toggle', cat)) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'menu-cat__toggle';
        b.innerHTML = '<svg width="16" height="16" aria-hidden="true"><use href="#i-chevron"/></svg>';
        b.setAttribute('aria-label', 'Mostrar u ocultar ' + $('h3', cat).textContent);
        $('.menu-cat__head', cat).appendChild(b);
      }
    });
    if (menuState.layout === 'accordion') {
      menuState.cats.forEach(function (c, i) { setAccordion(c, i === 0); });
    }
    setActive(menuState.cats[0] && menuState.cats[0].dataset.cat, false);
    var q = $('[data-menu-search]', menu); if (q && q.value) filterMenu(q.value);
    updateToolbarHeight();
  }

  function setAccordion(cat, open) {
    cat.classList.toggle('is-open', open);
    var b = $('.menu-cat__toggle', cat); if (b) b.setAttribute('aria-expanded', String(open));
  }

  function setActive(id, scrollChip) {
    if (!id) return;
    menuState.active = id;
    menuState.chips.forEach(function (c) {
      var on = c.dataset.catLink === id;
      if (on) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current');
      if (on && scrollChip !== false) {
        var bar = c.parentNode;
        bar.scrollTo({ left: c.offsetLeft - bar.clientWidth / 2 + c.offsetWidth / 2, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    });
    if (menuState.layout === 'tabs') menuState.cats.forEach(function (c) { c.classList.toggle('is-active', c.dataset.cat === id); });
  }

  function menuSpy() {
    if (!menu || menuState.layout !== 'list' || menu.classList.contains('is-searching')) return;
    if (menuState.lockUntil && Date.now() < menuState.lockUntil) return; // desplazamiento por clic en curso
    var offset = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 72) + (menuState.toolbarH || 64) + 24;
    var current = null;
    menuState.cats.forEach(function (c) { if (!c.hidden && c.getBoundingClientRect().top - offset <= 0) current = c; });
    var id = (current || menuState.cats[0] || {}).dataset;
    if (id && id.cat !== menuState.active) setActive(id.cat);
  }

  function updateToolbarHeight() {
    var tb = $('.menu-toolbar', menu); if (!tb) return;
    menuState.toolbarH = tb.offsetHeight;
    menu.style.setProperty('--toolbar-h', tb.offsetHeight + 'px');
  }

  function filterMenu(raw) {
    var q = norm(raw), words = q.split(/\s+/).filter(Boolean), shown = 0;
    menu.classList.toggle('is-searching', !!q);
    menuState.cats.forEach(function (cat) {
      var visible = 0;
      $$('[data-item]', cat).forEach(function (it) {
        var ok = !q || words.every(function (w) { return it.dataset.search.indexOf(w) > -1; });
        it.hidden = !ok; if (ok) visible++;
      });
      cat.hidden = !!q && !visible;
      shown += visible;
      var chip = menuState.chips.filter(function (c) { return c.dataset.catLink === cat.dataset.cat; })[0];
      if (chip) chip.hidden = cat.hidden;
    });
    $('[data-menu-empty]', menu).hidden = !q || shown > 0;
    $('[data-menu-query]', menu).textContent = raw.trim();
    $('[data-menu-count]', menu).textContent = q ? (shown === 1 ? '1 resultado' : shown + ' resultados') : menuState.totalText;
    if (!q && menuState.layout === 'tabs') setActive(menuState.active || (menuState.cats[0] && menuState.cats[0].dataset.cat), false);
  }

  if (menu) {
    menu.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-cat-link]');
      if (chip) {
        var id = chip.dataset.catLink, cat = document.getElementById('cat-' + id);
        if (menuState.layout === 'tabs') {
          e.preventDefault(); setActive(id);
          var top = menu.getBoundingClientRect().top + window.scrollY - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 72);
          if (window.scrollY > top) window.scrollTo({ top: top, behavior: reduceMotion ? 'auto' : 'smooth' });
        } else if (cat) {
          e.preventDefault();
          if (menuState.layout === 'accordion') setAccordion(cat, true);
          var y = cat.getBoundingClientRect().top + window.scrollY - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 72) - (menuState.toolbarH || 64) - 8;
          menuState.lockUntil = Date.now() + 3000; menuState.lockY = Math.round(Math.min(y, document.documentElement.scrollHeight - window.innerHeight));
          window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
          setActive(id);
          history.replaceState(null, '', '#carta');
        }
        return;
      }
      if (menuState.layout === 'accordion') {
        var head = e.target.closest('.menu-cat__head');
        if (head) { var c = head.parentNode; setAccordion(c, !c.classList.contains('is-open')); }
      }
    });
    var searchInput = $('[data-menu-search]', menu), t;
    searchInput.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { filterMenu(searchInput.value); }, 90); });
    searchInput.addEventListener('keydown', function (e) { if (e.key === 'Escape') { searchInput.value = ''; filterMenu(''); } });
    window.addEventListener('resize', updateToolbarHeight);
    // se libera al llegar al destino (o si el usuario toma el control con la rueda / el dedo)
    window.addEventListener('scrollend', function () { if (Math.abs(window.scrollY - menuState.lockY) < 4) { menuState.lockUntil = 0; menuSpy(); } });
    ['wheel', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, function () { menuState.lockUntil = 0; }, { passive: true }); });
    setupMenu('list');
  }

  /* ==========================================================================
     Reservas: validación, mensaje de WhatsApp y copia por correo (Formspree)
     ========================================================================== */
  var form = $('#reserva-form');
  var timeSelect = form && $('[name="hora"]', form), dateInput = form && $('[name="fecha"]', form);

  function buildTimeOptions() {
    if (!timeSelect) return;
    var H = APT.hours && APT.hours.daily !== undefined && APT.hours.open != null ? APT.hours : { open: 13 * 60, close: 22 * 60 };
    var prev = timeSelect.value, now = bogotaNow(), isToday = dateInput && dateInput.value === now.date;
    var html = '<option value="">Elige una hora</option>';
    var last = Math.min(H.close - 60, 1410); // sin horarios después de medianoche (cambiarían el día)
    for (var m = H.open; m <= last; m += 30) {
      var past = isToday && m < now.minutes + 30;
      html += '<option value="' + fmtTime(m) + '"' + (past ? ' disabled' : '') + '>' + fmtTime(m) + (past ? ' (ya pasó)' : '') + '</option>';
    }
    timeSelect.innerHTML = html;
    if (prev && !$('option[value="' + prev + '"]:not([disabled])', timeSelect)) timeSelect.value = '';
    else timeSelect.value = prev;
  }

  function fieldError(input, msg) {
    var box = document.getElementById(input.getAttribute('aria-describedby'));
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (box) box.textContent = msg || '';
  }

  function validate() {
    var ok = true, first = null;
    var checks = [
      ['nombre', function (v) { return v.trim().length >= 2 ? '' : 'Escribe tu nombre.'; }],
      ['telefono', function (v) { return v.replace(/\D/g, '').length >= 7 ? '' : 'Escribe un número de contacto válido.'; }],
      ['fecha', function (v) { return !v ? 'Elige la fecha.' : v < bogotaNow().date ? 'Elige una fecha de hoy en adelante.' : ''; }],
      ['hora', function (v) { return v ? '' : 'Elige la hora.'; }],
    ];
    checks.forEach(function (c) {
      var input = form.elements[c[0]], msg = c[1](input.value);
      fieldError(input, msg);
      if (msg) { ok = false; first = first || input; }
    });
    if (first) first.focus();
    return ok;
  }

  function addDays(iso, n) {
    var p = iso.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.toISOString().slice(0, 10);
  }

  function prettyDate(iso) {
    try {
      var p = iso.split('-');
      return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12)).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    } catch (e) { return iso; }
  }

  if (form) {
    var today = bogotaNow().date;
    dateInput.min = today;
    dateInput.value = today;
    buildTimeOptions();
    if (!$('option[value]:not([value=""]):not([disabled])', timeSelect)) { dateInput.value = addDays(today, 1); buildTimeOptions(); }
    dateInput.addEventListener('change', buildTimeOptions);
    ['nombre', 'telefono', 'fecha', 'hora'].forEach(function (n) {
      form.elements[n].addEventListener('input', function () { if (this.getAttribute('aria-invalid') === 'true') fieldError(this, ''); });
      form.elements[n].addEventListener('change', function () { if (this.getAttribute('aria-invalid') === 'true') fieldError(this, ''); });
    });

    var success = $('[data-reserve-success]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate()) return;
      var d = Object.fromEntries(new FormData(form));
      var personas = form.elements.personas.selectedOptions[0].textContent;
      var msg = 'Hola, quiero reservar una mesa en Amo Pijao Terraza:\n\n' +
        '• Nombre: ' + d.nombre.trim() + '\n' +
        '• Celular: ' + d.telefono.trim() + '\n' +
        '• Fecha: ' + prettyDate(d.fecha) + '\n' +
        '• Hora: ' + d.hora + '\n' +
        '• Personas: ' + personas +
        (d.notas && d.notas.trim() ? '\n• Notas: ' + d.notas.trim() : '');
      var link = waLink(msg);

      // 1) WhatsApp: se abre en el mismo gesto del usuario para que el navegador no lo bloquee
      // (sin 'noopener' en window.open, porque con él siempre devuelve null y no sabríamos si se bloqueó)
      var win = window.open(link, '_blank');
      if (win) { try { win.opener = null; } catch (err) {} }
      // 2) copia por correo al negocio (no bloquea al visitante si falla)
      var endpoint = form.dataset.endpoint;
      if (endpoint && window.fetch) {
        fetch(endpoint, {
          method: 'POST', keepalive: true,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(Object.assign({ _subject: 'Nueva reserva · ' + d.nombre.trim() + ' · ' + d.fecha + ' ' + d.hora }, d))
        }).catch(function () {});
      }
      $('[data-reserve-wa]', success).href = link;
      form.hidden = true; success.hidden = false; success.focus();
      if (!win) window.location.href = link; // si el navegador bloqueó la ventana, abrir en la misma pestaña
    });

    $('[data-reserve-again]').addEventListener('click', function () {
      form.reset(); dateInput.value = bogotaNow().date; buildTimeOptions();
      if (!$('option[value]:not([value=""]):not([disabled])', timeSelect)) { dateInput.value = addDays(bogotaNow().date, 1); buildTimeOptions(); }
      success.hidden = true; form.hidden = false; form.elements.nombre.focus();
    });
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

  /* ---------- varios ---------- */
  $$('[data-year]').forEach(function (el) { el.textContent = bogotaNow().date.slice(0, 4); });
  renderStatus();
  setInterval(renderStatus, 60 * 1000);
  onScroll();
})();
