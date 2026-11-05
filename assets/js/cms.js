/* ==========================================================================
   Amo Pijao Terraza — conexión con el panel de administración (admin.html)
   Lee lo guardado en Supabase y actualiza textos, fotos, carta, tienda y
   apariencia. Si Supabase no responde, la página se queda con el contenido
   del HTML (que siempre está completo): nunca se bloquea ni parpadea.
   ========================================================================== */
(function () {
  'use strict';
  var APT = window.APT;
  if (!APT || !window.fetch) return;

  var SUPABASE_URL = 'https://suvqsjloaoovaxjusini.supabase.co';
  // Clave pública "anon": es segura en el navegador; la protección real son las políticas RLS de la tabla.
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1dnFzamxvYW9vdmF4anVzaW5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NTI0MDIsImV4cCI6MjEwNjEyODQwMn0.3HC7MK3TCSEIWkpgHApObsgo6a5oyUjMv_511AwG0iU';
  var TIMEOUT_MS = 4000;

  var $ = function (s, p) { return (p || document).querySelector(s); };
  var $$ = function (s, p) { return Array.prototype.slice.call((p || document).querySelectorAll(s)); };
  var esc = APT.esc;
  var lines = function (s) { return String(s || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean); };

  // Valores originales con los que se sembró el panel: si siguen iguales, se respeta el texto del sitio.
  var SEEDED = {
    tagline: '"Un menú hecho con amor"',
    navHome: 'Inicio', navAbout: 'Nosotros', navMenu: 'Menú', navLoc: 'Ubicación', navShop: 'Tienda',
    eyebrowAbout: 'Nuestra historia', eyebrowMenu: 'La Carta', eyebrowLoc: 'Visítanos', eyebrowShop: 'Tienda',
    menuTitle: 'Un menú hecho con amor', locTitle: 'En el centro de Pijao', shopTitle: 'Llévate un pedacito de Pijao',
    btnReserve: 'Reservar', btnMenu: 'Ver el menú', btnCall: 'Llamar', btnMaps: 'Ver en Google Maps →', heroBadge: 'YO ♥ PIJAO'
  };
  var changed = function (T, k) { var v = T[k]; return typeof v === 'string' && v.trim() && v.trim() !== (SEEDED[k] || '') ? v.trim() : null; };

  function setText(key, value) {
    if (!value) return;
    $$('[data-cms="' + key + '"]').forEach(function (el) {
      var mode = el.dataset.cmsMode;
      if (mode === 'lines') el.innerHTML = lines(value).map(esc).join('<br>');
      else if (mode === 'paragraphs') el.innerHTML = String(value).split(/\n\s*\n|\n/).map(function (p) { return p.trim(); }).filter(Boolean).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
      else el.textContent = value;
    });
  }

  /* ---------- color: tonos derivados del color principal y del fondo ---------- */
  var hex2rgb = function (h) { h = h.replace('#', ''); return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16) / 255; }); };
  var rgb2hex = function (c) { return '#' + c.map(function (v) { return Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0'); }).join(''); };
  function rgb2hsl(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2;
    if (mx !== mn) { var d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) {
    if (!s) return [l, l, l];
    var hue = function (p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    var q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
  }
  var withL = function (hex, l) { var c = hex2rgb(hex), x = rgb2hsl(c[0], c[1], c[2]); return rgb2hex(hsl2rgb(x[0], x[1], l)); };
  var shiftL = function (hex, d) { var c = hex2rgb(hex), x = rgb2hsl(c[0], c[1], c[2]); return rgb2hex(hsl2rgb(x[0], x[1], Math.max(0, Math.min(1, x[2] + d)))); };
  var isHex = function (h) { return /^#[0-9a-f]{6}$/i.test(h || ''); };

  function applyTheme(TH) {
    var r = document.documentElement.style;
    if (isHex(TH.maroon)) { r.setProperty('--brand', TH.maroon); r.setProperty('--brand-deep', withL(TH.maroon, .16)); }
    if (isHex(TH.cream)) {
      r.setProperty('--wall', TH.cream); r.setProperty('--wall-2', shiftL(TH.cream, -.05));
      var meta = $('meta[name="theme-color"]'); if (meta) meta.content = TH.cream;
    }
    if (isHex(TH.gold)) { r.setProperty('--mostaza', TH.gold); r.setProperty('--accent', TH.gold); }

    // tipografías permitidas por el panel
    var FONTS = {
      'Fraunces': 'Fraunces:opsz,wght@9..144,400..640', 'Playfair Display': 'Playfair+Display:wght@500;700', 'DM Serif Display': 'DM+Serif+Display',
      'Cormorant Garamond': 'Cormorant+Garamond:wght@500;600', 'Lora': 'Lora:wght@500;600', 'Libre Baskerville': 'Libre+Baskerville:wght@400;700',
      'Crimson Pro': 'Crimson+Pro:wght@500;600', 'Prata': 'Prata', 'Marcellus': 'Marcellus', 'Abril Fatface': 'Abril+Fatface', 'Bodoni Moda': 'Bodoni+Moda:wght@500;700',
      'Spectral': 'Spectral:wght@500;600', 'EB Garamond': 'EB+Garamond:wght@500;600', 'Domine': 'Domine:wght@500;600', 'Piazzolla': 'Piazzolla:wght@500;600', 'Zilla Slab': 'Zilla+Slab:wght@500;600',
      'Work Sans': 'Work+Sans:wght@400;500;600', 'Inter': 'Inter:wght@400;500;600', 'Nunito Sans': 'Nunito+Sans:wght@400;600', 'Poppins': 'Poppins:wght@400;500;600',
      'Mulish': 'Mulish:wght@400;600', 'Karla': 'Karla:wght@400;600', 'Rubik': 'Rubik:wght@400;500;600', 'Manrope': 'Manrope:wght@400;600', 'Sora': 'Sora:wght@400;600',
      'Jost': 'Jost:wght@400;500;600', 'Outfit': 'Outfit:wght@400;500;600', 'Figtree': 'Figtree:wght@400;500;600', 'Public Sans': 'Public+Sans:wght@400;500;600',
      'Albert Sans': 'Albert+Sans:wght@400;500;600', 'Plus Jakarta Sans': 'Plus+Jakarta+Sans:wght@400;500;600', 'Urbanist': 'Urbanist:wght@400;500;600'
    };
    var useFont = function (name, cssVar, fallback) {
      if (!name || !FONTS[name] || name === fallback) return;
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + FONTS[name] + '&display=swap';
      document.head.appendChild(l);
      r.setProperty(cssVar, '"' + name + '", ' + getComputedStyle(document.documentElement).getPropertyValue(cssVar));
    };
    useFont(TH.headFont, '--f-display', 'Bricolage Grotesque');
    useFont(TH.bodyFont, '--f-body', 'Instrument Sans');
    var scale = { small: '93.75%', large: '112.5%' }[TH.scale];
    if (scale) r.fontSize = scale;
  }

  /* ---------- tienda ---------- */
  function renderShop(items) {
    if (!items.length) return;
    $$('[data-shop-link]').forEach(function (a) { a.hidden = false; });
    var grid = $('[data-shop-grid]'), empty = $('[data-shop-empty]');
    if (!grid) return;
    if (empty) empty.hidden = true;
    grid.innerHTML = items.map(function (p) {
      var wa = APT.waLink('Hola, quiero pedir: ' + p.name);
      return '<article class="product' + (p.out ? ' is-out' : '') + '">' +
        (p.img ? '<img src="' + esc(p.img) + '" alt="' + esc(p.name) + '" loading="lazy" width="480" height="480">' : '') +
        '<h3>' + esc(p.name) + '</h3>' + (p.desc ? '<p>' + esc(p.desc) + '</p>' : '') +
        '<p class="product__price">' + esc(p.price) + (p.out ? ' · Agotado' : '') + '</p>' +
        (p.out ? '' : '<a class="btn btn--brand btn--sm" href="' + esc(wa) + '" target="_blank" rel="noopener">Pedir por WhatsApp</a>') +
        '</article>';
    }).join('');
  }

  /* ---------- carga ---------- */
  var ctrl = 'AbortController' in window ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);

  fetch(SUPABASE_URL + '/rest/v1/content?select=col,id,position,data&col=neq.meta&order=position', {
    headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON },
    signal: ctrl ? ctrl.signal : undefined
  })
    .then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (rows) {
      if (!Array.isArray(rows) || !rows.length) return;
      var row = function (col, id) { var x = rows.filter(function (r) { return r.col === col && r.id === id; })[0]; return (x && x.data) || {}; };
      var T = row('site', 'texts'), TH = row('site', 'theme');
      var images = {}, menu = [], shop = [];
      rows.forEach(function (r) {
        if (r.col === 'img' && r.data && r.data.src) images[r.id] = r.data.src;
        else if (r.col === 'menu') menu.push(r.data);
        else if (r.col === 'shop') shop.push(r.data);
      });

      // textos principales
      var tagline = changed(T, 'tagline'); if (tagline) setText('tagline', tagline.replace(/^["“«]+|["”»]+$/g, ''));
      ['lede', 'aboutTitle', 'aboutText'].forEach(function (k) { if (T[k] && String(T[k]).trim()) setText(k, String(T[k]).trim()); });
      if (T.address && T.address.trim()) { setText('address', T.address); setText('plaque', lines(T.address)[0].replace(/\./g, '').replace(/#\s*/, '# ')); }
      if (T.hours && T.hours.trim()) {
        setText('hours', T.hours);
        var parsed = APT.parseHours(T.hours);
        setText('hoursShort', parsed && parsed.daily ? 'Todos los días, ' + APT.fmtTime(parsed.open) + ' – ' + APT.fmtTime(parsed.close) : lines(T.hours).join(', '));
        APT.setHours(T.hours);
      }
      if (T.phone && T.phone.replace(/\D/g, '').length >= 10) {
        APT.setPhone(T.phone);
        $$('[data-phone-text]').forEach(function (el) { el.textContent = T.phone.trim(); });
      }
      // textos pequeños (solo si el administrador los cambió)
      ['navAbout', 'navMenu', 'navLoc', 'navShop', 'eyebrowAbout', 'eyebrowMenu', 'eyebrowLoc', 'eyebrowShop', 'menuTitle', 'locTitle', 'shopTitle', 'btnReserve', 'btnMenu', 'btnCall', 'btnMaps', 'heroBadge']
        .forEach(function (k) { var v = changed(T, k); if (v) setText(k, v); });
      if (T.noticeOn && T.notice) APT.showNotice(String(T.notice).trim());

      // fotos
      if (images.hero) {
        var h = $('[data-cms-img="hero"]');
        if (h) { h.src = images.hero; h.classList.add('is-photo'); h.alt = 'Amo Pijao Terraza'; }
      }
      if (images.about) {
        var a = $('[data-cms-img="about"]');
        if (a) { a.src = images.about; a.classList.add('is-photo'); a.alt = 'Amo Pijao Terraza'; }
      }

      applyTheme(TH);

      var cats = menu.filter(function (c) { return c && c.name && c.items && c.items.length; });
      if (cats.length) APT.renderMenu(cats, { scale: TH.menuScale });

      renderShop(shop.filter(function (p) { return p && p.on && p.name; }));
    })
    .catch(function () { /* sin conexión con el panel: se muestra el contenido del sitio tal cual */ });
})();
