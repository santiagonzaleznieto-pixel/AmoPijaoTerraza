#!/usr/bin/env python3
"""Genera las páginas del sitio a partir de src/ y data/.

Uso:  python3 tools/build.py

- src/layout.html        plantilla común (encabezado, navegación, pie)
- src/pages/<pagina>.html contenido de cada página
- data/menu.json         carta por defecto (la que se ve si el panel no responde)

Escribe index.html, carta.html, reservas.html, nosotros.html, visitanos.html,
tienda.html y 404.html en la raíz del repositorio, que es lo que publica Vercel.
El marcado de la carta debe coincidir con APT.menuHTML en assets/js/main.js.
"""
import hashlib, html, json, re, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://amopijaoterraza.vercel.app'

NAV = [  # (página, texto, clave del panel, color de la puerta)
    ('carta', 'Carta', 'navMenu', 'var(--cafetal)'),
    ('reservas', 'Reservas', None, 'var(--anil)'),
    ('nosotros', 'Nosotros', 'navAbout', 'var(--teja)'),
    ('visitanos', 'Visítanos', 'navLoc', 'var(--mostaza)'),
    ('tienda', 'Tienda', 'navShop', 'var(--rosa)'),
]

PAGES = {
    'inicio': dict(out='index.html', path='/', title='Amo Pijao Terraza · Café y terraza en Pijao, Quindío',
                   og='Amo Pijao Terraza · Café en Pijao, Quindío',
                   desc='Café de especialidad, comida casera y bar en una terraza con la mejor vista cafetera de Pijao, Quindío. Abierto todos los días de 1:00 p.m. a 10:00 p.m.'),
    'carta': dict(out='carta.html', path='/carta', title='La carta · Amo Pijao Terraza',
                  desc='Carta completa con precios: café, aromáticas, bebidas frías, malteadas, postres, patacones, hamburguesas, cervezas y cócteles en Pijao, Quindío.'),
    'reservas': dict(out='reservas.html', path='/reservas', title='Reservas · Amo Pijao Terraza',
                     desc='Reserva tu mesa en la terraza de Amo Pijao, frente al parque principal de Pijao. Te confirmamos por WhatsApp.'),
    'nosotros': dict(out='nosotros.html', path='/nosotros', title='Nuestra historia · Amo Pijao Terraza',
                     desc='Un rincón para tomarse el café con calma en Pijao, Quindío, el primer pueblo Cittaslow de Latinoamérica.'),
    'visitanos': dict(out='visitanos.html', path='/visitanos', title='Cómo llegar · Amo Pijao Terraza',
                      desc='Cra. 4 #12-12, Pijao, Quindío. Horario, mapa, teléfono y WhatsApp de Amo Pijao Terraza.'),
    'tienda': dict(out='tienda.html', path='/tienda', title='Tienda · Amo Pijao Terraza',
                   desc='Recuerdos de Pijao hechos con amor. Pídelos por WhatsApp.'),
}

JSON_LD = {
    "@context": "https://schema.org", "@type": "CafeOrCoffeeShop",
    "name": "Amo Pijao Terraza", "alternateName": "Amo Pijao Café",
    "description": "Café de especialidad, comida casera y bar en una terraza con vista al parque principal de Pijao, Quindío.",
    "url": SITE + "/", "logo": SITE + "/assets/img/logo-512.png", "image": SITE + "/assets/img/og-image.jpg",
    "telephone": "+573104337667", "priceRange": "$", "currenciesAccepted": "COP",
    "servesCuisine": ["Café", "Colombiana", "Comida rápida"], "acceptsReservations": SITE + "/reservas",
    "hasMenu": SITE + "/carta",
    "address": {"@type": "PostalAddress", "streetAddress": "Carrera 4 #12-12", "addressLocality": "Pijao",
                "addressRegion": "Quindío", "addressCountry": "CO"},
    "geo": {"@type": "GeoCoordinates", "latitude": 4.3337591, "longitude": -75.7038204},
    "openingHoursSpecification": [{"@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        "opens": "13:00", "closes": "22:00"}],
    "sameAs": ["https://www.instagram.com/amopijaocafe", "https://www.tiktok.com/@amopijaoterraza"],
}

esc = lambda s: html.escape(str(s or ''), quote=True).replace('&#x27;', '&#39;')


def norm(s):
    return ''.join(c for c in unicodedata.normalize('NFD', str(s)) if unicodedata.category(c) != 'Mn').lower().strip()


def slug(s):
    return re.sub(r'^-+|-+$', '', re.sub(r'[^a-z0-9]+', '-', norm(s))) or 'categoria'


def price(p):
    return re.sub(r'/\s*(?=\d)', '/ $', str(p or '').strip())


def menu_html(cats, ind='        '):
    used, tabs, panels = {}, [], []
    for c in cats:
        cid = slug(c['name'])
        if cid in used:
            used[cid] += 1; cid += '-%d' % used[cid]
        else:
            used[cid] = 1
        items = c.get('items', []); n = len(items)
        tabs.append(f'{ind}<a class="cat" href="#cat-{cid}" role="tab" id="tab-{cid}" aria-controls="cat-{cid}" aria-selected="false" data-cat-link="{cid}"><span>{esc(c["name"])}</span><span class="cat__n">{n}</span></a>')
        if c.get('cols'):
            body = ('<div class="table-scroll"><table class="price-table"><thead><tr><th scope="col"><span class="visually-hidden">Producto</span></th>'
                    + ''.join(f'<th scope="col">{esc(x)}</th>' for x in c['cols']) + '</tr></thead><tbody>'
                    + ''.join(f'\n{ind}    <tr data-item><td>{esc(it["n"])}</td>' + ''.join(f'<td>{esc(price(v))}</td>' for v in it.get('v', [])) + '</tr>' for it in items)
                    + f'\n{ind}  </tbody></table></div>')
        else:
            body = ('<ul class="dishes">'
                    + ''.join(f'\n{ind}    <li class="dish" data-item><div class="dish__row"><span class="dish__name">{esc(it["n"])}</span><span class="dish__leader" aria-hidden="true"></span><span class="dish__price">{esc(price(it.get("p")))}</span></div>'
                              + (f'<p class="dish__desc">{esc(it["d"])}</p>' if it.get('d') else '') + '</li>' for it in items)
                    + f'\n{ind}  </ul>')
        panels.append(f'{ind}<section class="menu-cat" id="cat-{cid}" role="tabpanel" aria-labelledby="tab-{cid}" data-cat="{cid}">\n'
                      f'{ind}  <div class="menu-panel__head"><h2>{esc(c["name"])}</h2><span class="label">{n} {"opción" if n == 1 else "opciones"}</span></div>\n'
                      + (f'{ind}  <p class="menu-panel__note">{esc(c["note"])}</p>\n' if c.get('note') else '')
                      + f'{ind}  {body}\n{ind}</section>')
    return '\n'.join(tabs), '\n'.join(panels)


def nav_html(current, mobile=False):
    out = []
    for page, text, key, color in NAV:
        attrs = f'href="/{page}"'
        if key: attrs += f' data-cms="{key}"'
        if page == 'tienda': attrs += ' data-shop-link hidden'
        if page == current: attrs += ' aria-current="page"'
        if mobile:
            out.append(f'      <a class="mobile-nav__link" style="--c:{color}" {attrs}>{text}</a>')
        else:
            out.append(f'      <a {attrs}>{text}</a>')
    return '\n'.join(out)


def main():
    layout = (ROOT / 'src/layout.html').read_text(encoding='utf-8')
    cats = json.loads((ROOT / 'data/menu.json').read_text(encoding='utf-8'))
    tabs, panels = menu_html(cats)
    total = sum(len(c.get('items', [])) for c in cats)
    version = hashlib.sha1(b''.join((ROOT / f).read_bytes() for f in
                                    ['assets/css/styles.css', 'assets/js/main.js', 'assets/js/cms.js'])).hexdigest()[:8]

    def render(page, meta, content, head_extra=''):
        out = layout
        for k, v in {'TITLE': meta['title'], 'DESCRIPTION': meta['desc'], 'OG_TITLE': meta.get('og', meta['title']),
                     'SITE': SITE, 'PATH': meta['path'], 'PAGE': page, 'VERSION': version,
                     'NAV': nav_html(meta.get('nav', page)), 'NAV_MOBILE': nav_html(meta.get('nav', page), True),
                     'HEAD_EXTRA': head_extra, 'CONTENT': content.rstrip()}.items():
            out = out.replace('{{' + k + '}}', v)
        assert '{{' not in out, re.findall(r'\{\{\w+\}\}', out)
        return out

    for page, meta in PAGES.items():
        content = (ROOT / f'src/pages/{page}.html').read_text(encoding='utf-8')
        content = content.replace('{{MENU_TABS}}', tabs).replace('{{MENU_PANELS}}', panels).replace('{{MENU_TOTAL}}', str(total))
        extra = ''
        if page == 'inicio':
            extra = ('<link rel="preload" as="image" href="/assets/img/yo-amo-pijao.webp" type="image/webp">\n'
                     '<script type="application/ld+json">' + json.dumps(JSON_LD, ensure_ascii=False) + '</script>')
        (ROOT / meta['out']).write_text(render(page, meta, content, extra), encoding='utf-8')
        print('ok', meta['out'])

    notfound = '''<section class="facade" aria-labelledby="page-title">
  <div class="wrap">
    <div>
      <span class="label">Error 404</span>
      <h1 id="page-title">Esta puerta no abre</h1>
      <p class="facade__lede">La página que buscas no existe o cambió de dirección. La carta y la terraza siguen aquí.</p>
      <div class="hero__ctas"><a class="btn btn--on-page" href="/">Ir al inicio</a><a class="btn btn--on-page-line" href="/carta">Ver la carta</a></div>
    </div>
    <div class="windows" aria-hidden="true"><span class="window"><i></i><i></i></span><span class="window"><i></i><i></i></span></div>
  </div>
</section>'''
    (ROOT / '404.html').write_text(render('nosotros', dict(path='/', title='Página no encontrada · Amo Pijao Terraza',
                                                           desc='Esta página no existe.', nav=''), notfound,
                                          '<meta name="robots" content="noindex">'), encoding='utf-8')
    print('ok 404.html · versión', version)


if __name__ == '__main__':
    main()
