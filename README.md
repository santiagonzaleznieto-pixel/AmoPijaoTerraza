# Amo Pijao Terraza — sitio web

Sitio oficial de **Amo Pijao Terraza**, café y terraza frente al parque principal de Pijao, Quindío.
Publicado en Vercel: <https://amopijaoterraza.vercel.app>

## Páginas

| URL          | Archivo          | Fachada  | Contenido                                               |
|--------------|------------------|----------|---------------------------------------------------------|
| `/`          | `index.html`     | vinotinto | Portada, estado abierto/cerrado, puertas a cada sección |
| `/carta`     | `carta.html`     | verde    | Carta por categorías (una a la vez) y buscador          |
| `/reservas`  | `reservas.html`  | añil     | Formulario que arma la reserva y abre WhatsApp          |
| `/nosotros`  | `nosotros.html`  | teja     | Historia de la casa                                     |
| `/visitanos` | `visitanos.html` | mostaza  | Dirección, horario de la semana, mapa y contacto        |
| `/tienda`    | `tienda.html`    | rosa     | Productos publicados desde el panel                     |
| `/admin`     | `admin.html`     | —        | Panel de administración (Supabase)                      |

## Diseño: "Fachadas de Pijao"

Cada página es una fachada pintada de bahareque: banda de color arriba, zócalo oscuro al pie,
la baranda de madera de la terraza como separador, la placa de nomenclatura con la dirección
y puertas de colores para pasar de una sección a otra. Tipografías: Bricolage Grotesque
(letreros) e Instrument Sans (texto). Los colores están como variables al inicio de
`assets/css/styles.css`.

## Cómo editar

Las páginas HTML de la raíz **se generan**: no las edites a mano.

```
src/layout.html         Encabezado, navegación y pie comunes
src/pages/*.html        Contenido de cada página
data/menu.json          Carta por defecto (la que se ve si el panel no responde)
tools/build.py          Generador
```

Después de cambiar algo en `src/`, `data/` o en el CSS/JS, ejecuta:

```bash
python3 tools/build.py
```

y publica los archivos generados junto con tus cambios (Vercel sirve la raíz tal cual, sin
compilar). El generador también pone la versión de CSS y JS en las URLs para que los
visitantes reciban siempre la última.

## Panel de administración

Desde `/admin` se cambian textos, horario, teléfono, aviso superior, carta y precios, tienda,
fotos de portada y de "Nuestra historia", colores y tipografías. La página los aplica al
cargar (`assets/js/cms.js`, con un tiempo límite de 4 s: si el panel no responde, se ve el
contenido del HTML).

> ⚠️ El proyecto de Supabase (`amo-pijao-terraza`) estaba **pausado** al momento de esta
> revisión. Se reactiva desde <https://supabase.com/dashboard/project/suvqsjloaoovaxjusini>.

## Reservas

El formulario arma un mensaje con los datos y abre **WhatsApp** (+57 310 433 7667). En paralelo
manda una copia por correo a través de Formspree (`formspree.io/f/xrpbrlpw`).

## Probar en local

Vercel usa URLs limpias (`/carta` → `carta.html`). Para probar en local con esas URLs puedes usar
`npx vercel dev`, o abrir directamente `http://localhost:8000/carta.html` con:

```bash
python3 -m http.server 8000
```

---

Desarrollado por Santiago González.
