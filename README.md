# Amo Pijao Terraza — sitio web

Sitio oficial de **Amo Pijao Terraza**, café y terraza frente al parque principal de Pijao, Quindío.
Publicado en Vercel: <https://amopijaoterraza.vercel.app>

## Estructura

```
index.html            Página principal (contenido completo, funciona aunque falle el JavaScript)
admin.html            Panel de administración (textos, carta, tienda, fotos, colores) → Supabase
404.html              Página de "no encontrado"
assets/css/styles.css Estilos (tokens de color y tipografía al inicio del archivo)
assets/js/main.js     Navegación, estado "Abierto ahora", carta (índice + buscador), reservas
assets/js/cms.js      Lee lo guardado en el panel y actualiza la página (tiempo límite: 4 s)
assets/img/           Logo, íconos, ilustración principal e imagen para redes sociales
vercel.json           Caché, cabeceras de seguridad, URLs limpias (/admin)
robots.txt, sitemap.xml, site.webmanifest
```

No hay paso de compilación: Vercel publica los archivos tal cual en cada `git push`.

## Cómo se actualiza el contenido

1. **Desde el panel** (`/admin`): textos, horario, teléfono, aviso superior, carta y precios,
   productos de la tienda, fotos de portada y de "Nuestra historia", colores y tipografías.
   Los cambios se ven en la página sin volver a publicar.
2. **Desde el código**: el HTML trae una copia completa de la carta y los textos, que es lo que
   se muestra si el panel no responde. Si cambias precios solo en el panel, la página igual mostrará
   los del panel; conviene actualizar ambos de vez en cuando.

> ⚠️ El proyecto de Supabase (`amo-pijao-terraza`) estaba **pausado** al momento de esta
> revisión (los proyectos gratuitos se pausan tras una semana sin uso). Mientras esté pausado,
> el panel no guarda cambios y la página muestra el contenido del HTML.
> Se reactiva desde <https://supabase.com/dashboard/project/suvqsjloaoovaxjusini>.

## Fotos reales (recomendado)

La portada usa por ahora la ilustración «Yo ♥ Pijao». Para que el sitio se vea al nivel de las
redes sociales, sube fotos reales desde el panel → **Fotos**:

- **Portada**: la terraza con vista al parque, idealmente al atardecer (vertical 4:5).
- **Nuestra historia**: el local, el equipo o una bebida insignia (cuadrada).
- **Tienda**: productos sobre fondo limpio (cuadradas).

El panel recorta y comprime las fotos automáticamente.

## Reservas

El formulario arma un mensaje con los datos y abre **WhatsApp** (+57 310 433 7667) para que el
cliente lo envíe. En paralelo manda una copia por correo a través de Formspree
(`formspree.io/f/xrpbrlpw`). Si cambias el teléfono en el panel, todos los botones de llamada y
WhatsApp se actualizan solos.

## Dominio

Si se conecta un dominio propio, reemplaza `https://amopijaoterraza.vercel.app` en:
`index.html` (canonical, Open Graph y datos estructurados), `robots.txt` y `sitemap.xml`.

## Probar en local

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

---

Desarrollado por Santiago González.
