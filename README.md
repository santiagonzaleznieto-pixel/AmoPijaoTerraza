# Amo Pijao Terraza — sitio web

Sitio oficial de **Amo Pijao Terraza**, café y terraza frente al parque principal de Pijao, Quindío.
Publicado en Vercel: <https://amopijaoterraza.vercel.app>

## Páginas

| URL          | Archivo          | Contenido                                                   |
|--------------|------------------|-------------------------------------------------------------|
| `/`          | `index.html`     | Portada, estado abierto/cerrado, creaciones de la casa      |
| `/carta`     | `carta.html`     | Carta por categorías (una a la vez) y buscador              |
| `/reservas`  | `reservas.html`  | Formulario que arma la solicitud y abre WhatsApp            |
| `/nosotros`  | `nosotros.html`  | Historia de la casa                                         |
| `/visitanos` | `visitanos.html` | Dirección, horario de la semana, mapa y contacto            |
| `/tienda`    | `tienda.html`    | Productos publicados desde el panel                         |
| `/admin`     | `admin.html`     | Panel de administración (Supabase)                          |

## Diseño: "Noche en la terraza"

Identidad tomada del logo: vinotinto `#742B1E` y crema `#F2EAD6`, sobre un fondo espresso
casi negro, con dorado champaña `#BF9B62` solo en filetes y detalles. Tipografías Cormorant
Garamond (títulos) y Jost (texto y etiquetas). Piezas gráficas propias en `assets/img/`:
el logo y el emblema en crema para fondos oscuros, y el grabado de la torre de la iglesia.
Los colores y tipografías están como variables al inicio de `assets/css/styles.css`, y el
panel (`/admin` → Apariencia) puede cambiarlos.

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
