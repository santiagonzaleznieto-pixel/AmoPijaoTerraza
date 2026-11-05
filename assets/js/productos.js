/* ==========================================================================
   Amo Pijao Terraza — página de productos
   Los productos vienen del panel (cms.js). Si no hay ninguno publicado, la
   página no se muestra: se vuelve al inicio. El pedido se arma en una bolsa
   y se envía completo por WhatsApp.
   ========================================================================== */
(function () {
  'use strict';
  var APT = window.APT;
  var root = document.querySelector('[data-shop]');
  if (!APT || !root) return;

  var $ = function (s, p) { return (p || document).querySelector(s); };
  var $$ = function (s, p) { return Array.prototype.slice.call((p || document).querySelectorAll(s)); };
  var esc = APT.esc;
  var grid = $('[data-shop-grid]', root), filters = $('[data-shop-filters]', root), errorBox = $('[data-shop-error]', root);
  var fab = $('[data-bag-open]'), bagEl = $('[data-bag]'), list = $('[data-bag-items]'), totalEl = $('[data-bag-total]'), countEl = $('[data-bag-count]');
  var KEY = 'apt-pedido';
  var CAT_ORDER = ['Café', 'Tazas', 'Camisetas', 'Imanes', 'Stickers'];
  var products = [], bag = [], lastFocus = null;

  var num = function (p) { var n = parseInt(String(p || '').replace(/[^\d]/g, ''), 10); return isNaN(n) ? 0 : n; };
  var money = function (n) { return '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  var opts = function (p) { return String(p.opts || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean); };

  /* ---------- bolsa (se recuerda en este navegador) ---------- */
  try { bag = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { bag = []; }
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify(bag)); } catch (e) {} };

  function renderBag() {
    var count = bag.reduce(function (a, it) { return a + it.qty; }, 0);
    var total = bag.reduce(function (a, it) { return a + it.qty * it.price; }, 0);
    countEl.textContent = count;
    fab.hidden = !count;
    totalEl.textContent = money(total);
    list.innerHTML = bag.length ? bag.map(function (it, i) {
      return '<li class="bag__item"><div><h3>' + esc(it.name) + '</h3>' + (it.opt ? '<small>' + esc(it.opt) + '</small>' : '') + '</div>' +
        '<span class="price">' + money(it.price * it.qty) + '</span>' +
        '<div class="row"><div class="qty"><button type="button" data-dec="' + i + '" aria-label="Quitar uno">−</button><output>' + it.qty + '</output><button type="button" data-inc="' + i + '" aria-label="Agregar uno">+</button></div>' +
        '<button class="bag__remove" type="button" data-del="' + i + '">Quitar</button></div></li>';
    }).join('') : '<li class="bag__empty">Su pedido está vacío.</li>';
    $('[data-bag-send]').disabled = !bag.length;
  }

  function openBag() {
    lastFocus = document.activeElement;
    document.documentElement.classList.add('bag-open');
    $('.bag__close', bagEl).focus();
  }
  function closeBag() {
    document.documentElement.classList.remove('bag-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  fab.addEventListener('click', openBag);
  $$('[data-bag-close]').forEach(function (b) { b.addEventListener('click', closeBag); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.documentElement.classList.contains('bag-open')) closeBag(); });
  list.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var i;
    if (b.dataset.inc != null) { i = +b.dataset.inc; bag[i].qty = Math.min(99, bag[i].qty + 1); }
    else if (b.dataset.dec != null) { i = +b.dataset.dec; bag[i].qty -= 1; if (bag[i].qty < 1) bag.splice(i, 1); }
    else if (b.dataset.del != null) { bag.splice(+b.dataset.del, 1); }
    save(); renderBag();
  });
  $('[data-bag-send]').addEventListener('click', function () {
    if (!bag.length) return;
    var name = $('#bag-nombre').value.trim();
    var total = bag.reduce(function (a, it) { return a + it.qty * it.price; }, 0);
    var msg = 'Buen día, quisiera hacer este pedido en Amo Pijao Terraza:\n\n' +
      bag.map(function (it) { return '• ' + it.qty + ' × ' + it.name + (it.opt ? ' (' + it.opt + ')' : '') + ' — ' + money(it.qty * it.price); }).join('\n') +
      '\n\nTotal estimado: ' + money(total) + (name ? '\nA nombre de: ' + name : '');
    var link = APT.waLink(msg);
    var win = window.open(link, '_blank');
    if (win) { try { win.opener = null; } catch (err) {} } else { window.location.href = link; }
    bag = []; save(); renderBag(); closeBag();
  });

  /* ---------- catálogo ---------- */
  function card(p) {
    var o = opts(p), out = !!p.out;
    var media = p.img
      ? '<img src="' + esc(p.img) + '" alt="' + esc(p.name) + '" loading="lazy" width="480" height="600">'
      : '<span class="placeholder"><img src="/assets/img/emblema-crema-96.webp" alt=""></span>';
    return '<article class="product' + (out ? ' is-out' : '') + '" data-cat="' + esc(p.cat || 'Otros') + '" data-id="' + esc(p.id) + '">' +
      '<div class="product__media">' + media + (out ? '<span class="product__badge">Agotado</span>' : '') + '</div>' +
      '<span class="label">' + esc(p.cat || 'De la casa') + '</span>' +
      '<h3>' + esc(p.name) + '</h3>' + (p.desc ? '<p>' + esc(p.desc) + '</p>' : '') +
      '<span class="product__price">' + esc(p.price ? APT.formatPrice(p.price) : 'Consultar') + '</span>' +
      (out ? '' : '<div class="product__buy">' +
        (o.length ? '<select aria-label="Opción de ' + esc(p.name) + '" data-opt>' + o.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') + '</select>' : '') +
        '<button class="btn btn--ghost" type="button" data-add>Agregar al pedido</button></div>') +
      '</article>';
  }

  function render(items) {
    products = items.filter(function (p) { return p && p.on && p.name; });
    if (!products.length) { window.location.replace('/'); return; }
    errorBox.hidden = true;
    var cats = [];
    products.forEach(function (p) { var c = p.cat || 'Otros'; if (cats.indexOf(c) < 0) cats.push(c); });
    cats.sort(function (a, b) {
      var ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'es');
    });
    filters.hidden = cats.length < 2;
    filters.innerHTML = '<button class="shop-filter" type="button" aria-pressed="true" data-filter="">Todos</button>' +
      cats.map(function (c) { return '<button class="shop-filter" type="button" aria-pressed="false" data-filter="' + esc(c) + '">' + esc(c) + '</button>'; }).join('');
    grid.innerHTML = products.map(card).join('');
    // retirar de la bolsa lo que ya no esté disponible
    bag = bag.filter(function (it) { return products.some(function (p) { return p.id === it.id && !p.out; }); });
    save(); renderBag();
  }

  filters.addEventListener('click', function (e) {
    var b = e.target.closest('[data-filter]'); if (!b) return;
    $$('[data-filter]', filters).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    $$('.product', grid).forEach(function (el) { el.classList.toggle('is-hidden', !!b.dataset.filter && el.dataset.cat !== b.dataset.filter); });
  });

  grid.addEventListener('click', function (e) {
    var b = e.target.closest('[data-add]'); if (!b) return;
    var el = b.closest('.product'), p = products.filter(function (x) { return x.id === el.dataset.id; })[0];
    if (!p) return;
    var sel = $('[data-opt]', el), opt = sel ? sel.value : '';
    var key = p.id + '|' + opt, found = bag.filter(function (it) { return it.key === key; })[0];
    if (found) found.qty = Math.min(99, found.qty + 1);
    else bag.push({ key: key, id: p.id, name: p.name, opt: opt, price: num(p.price), qty: 1 });
    save(); renderBag();
    fab.classList.remove('bump'); void fab.offsetWidth; fab.classList.add('bump');
    var original = b.textContent; b.textContent = 'Agregado'; b.disabled = true;
    setTimeout(function () { b.textContent = original; b.disabled = false; }, 1200);
  });

  function fail() {
    grid.innerHTML = ''; filters.hidden = true; errorBox.hidden = false;
  }
  $('[data-shop-retry]', root).addEventListener('click', function () { window.location.reload(); });

  renderBag();
  APT.onContent(function (data) { render(data.shop || []); }, fail);
})();
