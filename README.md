# Amo Pijao Terraza — sitio web

Sitio oficial de **Amo Pijao Terraza**, café y terraza frente al parque principal de Pijao, Quindío.
Publicado en Vercel: <https://amopijaoterraza.vercel.app>

## Páginas

| URL          | Archivo          | Contenido                                                   |
|--------------|------------------|-------------------------------------------------------------|
| `/`          | `index.html`     | Portada, estado abierto/cerrado, creaciones de la casa      |
| `/carta`     | `carta.html`     | Carta por categorías (una a la vez) y buscador              |
| `/reservas`  | `reservas.html`  | Formulario: guarda la reserva en el panel y abre WhatsApp   |
| `/nosotros`  | `nosotros.html`  | Historia de la casa                                         |
| `/visitanos` | `visitanos.html` | Dirección, horario de la semana, mapa y contacto            |
| `/productos` | `productos.html` | Productos a la venta con pedido por WhatsApp (solo aparece si hay productos publicados) |
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

## Panel de administración (`/admin`)

Ingreso con usuario y contraseña. Secciones:

- **Reservas**: las solicitudes del sitio, agrupadas por día. Confirmar (abre WhatsApp con el
  mensaje de confirmación para el cliente), cancelar, marcar atendida, notas internas y eliminar.
  Se actualiza solo cada minuto y avisa cuando entra una reserva nueva.
- **Carta y precios**: categorías y productos, precios, descripciones y orden. Se guarda solo.
- **Productos**: tazas, camisetas, café, imanes, stickers… con foto, categoría, precio, opciones
  (por ejemplo "Grano, Molido" o "S, M, L") y los interruptores *Publicado* y *Agotado*.
  Si no hay ninguno publicado, la página Productos no aparece en el sitio.
- **Textos y avisos**: aviso superior, frase principal, historia, horario, dirección y teléfono.
- **Fotos**: portada y "Nuestra historia", con recorte antes de subir.
- **Apariencia**: paletas, colores, tipografías y tamaños.
- **Usuarios**: dar o quitar acceso, cambiar contraseñas.

Base de datos (Supabase): tablas `content`, `reservas` y `admins`, todas con RLS. El público solo
puede leer el contenido y crear reservas pendientes; todo lo demás exige ser administrador.

## Reservas

El formulario guarda la reserva en el panel, arma el mensaje y abre **WhatsApp**
(+57 310 433 7667) y además envía una copia por correo a través de Formspree
(`formspree.io/f/xrpbrlpw`). Si cambia el teléfono en el panel, todos los botones de llamada y
WhatsApp se actualizan solos.

## Probar en local

Vercel usa URLs limpias (`/carta` → `carta.html`). Para probar en local con esas URLs puedes usar
`npx vercel dev`, o abrir directamente `http://localhost:8000/carta.html` con:

```bash
python3 -m http.server 8000
```

---

Desarrollado por Santiago González.
