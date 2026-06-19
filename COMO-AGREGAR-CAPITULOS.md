# Cómo agregar capítulos al JSON (procedimiento rápido)

Probado con Dr. Stone en animeonline.ninja. Sirve para cualquier serie del mismo sitio.

## Resumen del flujo

Por cada capítulo hacen falta 3 datos: `post_id`, `embed_id` y las 3 fuentes
LAT (`embed_url` de ZOPLAYER, EARNVIDS, STREAMWISH). Se obtienen en 2 pasos.

## Paso 1 — post_id + embed_id (todo de una, desde animeonline)

Estando en cualquier página de **ww3.animeonline.ninja**, abrir la consola (F12)
y correr esto (ajustar el rango `n` y el slug de la serie):

```js
const slug = "dr-stone-science-future";   // <-- cambiar por la serie
const desde = 30, hasta = 34;              // <-- rango de capítulos
const out = [];
for (let n = desde; n <= hasta; n++) {
  const url = `https://ww3.animeonline.ninja/episodio/${slug}-cap-${n}/`;
  const html = await (await fetch(url, {cache:"no-store"})).text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const opt = doc.querySelector("[data-nume]");
  const post = opt?.getAttribute("data-post");
  const nume = opt?.getAttribute("data-nume") || "1";
  const type = opt?.getAttribute("data-type") || "tv";
  let embed_id = "";
  if (post) {
    const body = new URLSearchParams({action:"doo_player_ajax", post, nume, type});
    const j = await (await fetch("/wp-admin/admin-ajax.php",
      {method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body})).json();
    embed_id = (j.embed_url.match(/id=(\d+)/) || [])[1];
  }
  out.push({n, post, embed_id});
}
console.log(JSON.stringify(out));
```

Anotar el `post` y `embed_id` de cada capítulo.

## Paso 2 — las 3 fuentes LAT (una por embed)

Para cada `embed_id`, ir a `https://saidochesto.top/embed.php?id=EMBED_ID` y en la
consola correr:

```js
const div = document.querySelector('.OD_LAT');   // bloque de audio latino
JSON.stringify([...div.querySelectorAll('li[onclick]')].slice(0,3).map(li => {
  const u = (li.getAttribute('onclick').match(/go_to_player\(['"]([^'"]+)['"]/) || [])[1];
  return {
    servidor: li.querySelector('span,b').innerText.trim().toUpperCase(),
    host: new URL(u).host,
    embed_url: u
  };
}));
```

> Cambiar `.OD_LAT` por `.OD_SUB` (japonés) o `.OD_ES` (castellano) para otros idiomas.
> `.slice(0,3)` toma los 3 primeros servidores; sacarlo para traerlos todos.

## Paso 3 — armar el bloque del capítulo

Pegar cada capítulo dentro de `temporadas[].capitulos[]` con esta forma:

```json
{
  "numero": 34,
  "titulo": "Dr. Stone: Science Future Cap 34",
  "url": "https://ww3.animeonline.ninja/episodio/dr-stone-science-future-cap-34/",
  "post_id": "242880",
  "nume": "1",
  "type": "tv",
  "embed_id": "49115",
  "embed_page": "https://saidochesto.top/embed.php?id=49115",
  "inicio_seg": 0,
  "fin_seg": null,
  "fuentes": [
    {"idioma":"LAT","idioma_nombre":"Español latino","servidor":"ZOPLAYER","host":"gupload.xyz","descripcion":"...","embed_url":"..."},
    {"idioma":"LAT","idioma_nombre":"Español latino","servidor":"EARNVIDS","host":"filelions.top","descripcion":"...","embed_url":"..."},
    {"idioma":"LAT","idioma_nombre":"Español latino","servidor":"STREAMWISH","host":"streamwish.top","descripcion":"...","embed_url":"..."}
  ]
}
```

Mantener `capitulos` ordenado por `numero`.

### Campos opcionales por capítulo
- `inicio_seg`: segundo donde debe empezar la reproducción (saltea intro). 0 = desde el principio.
- `fin_seg`: segundo donde debe pasar al siguiente capítulo (saltea outro/avances).
  `null` = esperar al fin real del video.

Ejemplo: para saltar 90s de intro y cortar a los 1320s (22 min): `"inicio_seg": 90, "fin_seg": 1320`.

## Formato multi-serie (canal-tv/data.json)

El canal ahora soporta **varias series**. La estructura es:

```json
{
  "series": [
    { "serie": {"titulo":"Dr. Stone: Science Future","slug":"..."}, "temporadas": [ ... ] },
    { "serie": {"titulo":"Otra serie","slug":"..."}, "temporadas": [ ... ] }
  ],
  "metadata": { ... }
}
```

Cada elemento de `series` es una serie completa (igual que el JSON viejo de una
sola serie, pero metido dentro del array). El canal muestra un **selector de
serie** y, al elegir, carga sus capítulos. Reproduce solo audio **LAT**.

### Para AGREGAR UNA SERIE NUEVA
1. Conseguir el slug de la serie en animeonline (el de la URL del episodio).
2. Sacar sus capítulos con los Pasos 1–3 de arriba (cambiando `slug`).
3. Agregar un objeto nuevo `{ "serie": {...}, "temporadas": [...] }` al array `series`.

## Paso 4 — sincronizar el canal

Poner el JSON multi-serie en `canal-tv/data.json` y regenerar `canal-tv/data.js`:

```js
// data.js = el JSON multi-serie envuelto:
window.CANAL_DATA = { "series": [ ... ], "metadata": { ... } };
```

> El canal igual acepta el formato viejo (una sola serie sin `series`): lo
> envuelve solo. Pero conviene usar siempre `series: [...]`.

Subir `index.html`, `data.json` y `data.js` al repo de GitHub.

## Notas

- El `embed_id` y los `embed_url` son **estables** (no vencen como el stream
  directo .m3u8). Por eso sí conviene guardarlos.
- El canal hoy reproduce solo el idioma **LAT** y prioriza **STREAMWISH**
  (único servidor con userscript). Si STREAMWISH no carga, elegir otro en el
  selector.
- Para automatizar todo de una, se puede combinar el Paso 1 y 2 en un script,
  pero el Paso 2 necesita abrir cada `embed.php` (saidochesto bloquea fetch
  cross-origin desde animeonline).
