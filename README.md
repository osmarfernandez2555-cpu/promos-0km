# Promos 0 km — Tutu Automotores

Landing de la promo **Fiat Cronos, Argo y Strada 100% financiados (50 cupos)**.
Califica con CUIT, o con DNI + género (calcula el CUIL), contra Ruthina usando solo Bancor y Banco Nación.

## Archivos
- `index.html` — la landing (formulario, resultados, cupos).
- `img/` — autos recortados de las placas, foto de portada y logo.
- `assets/` — estilos y scripts del sistema de diseño.
- `promo100-route.js` — rutas para sumar al server de Ruthina (compara-conejo). No corre acá.
- `package.json` — sirve la página estática en Railway.

## Publicar en Railway
1. New Project → Deploy from GitHub repo → `promos-0km`.
2. Railway detecta Node y corre `npm start` (sirve la carpeta con `serve`).
3. Settings → Networking → Generate Domain.

## Conectar con Ruthina
1. Copiar `promo100-route.js` al repo COMPARA-CONEJO y montarlo en `server.js`
   (instrucciones al principio del archivo): pasar `pool` y `consultarBanco(banco, cuit)`
   conectado a la consulta de Bancor y Nación que ya usa Consulta Créditos.
2. Poner en `origenesPermitidos` el dominio que generó Railway para esta landing.
3. En `index.html`, completar `data-api=""` del formulario con la URL de compara-conejo
   (por ejemplo `https://compara-conejo-production.up.railway.app`).

Mientras `data-api` esté vacío, el formulario muestra "No pudimos hacer la consulta ahora".

## Endpoints que usa la página
- `POST /api/promo100/calificar` → `{estado: pendiente|aprobado|rechazado|agotado, id?}`
- `GET /api/promo100/estado/:id`
- `GET /api/promo100/cupos` → `{total: 50, restantes}`

## Errores comunes
- **CORS bloqueado** en la consola: falta el dominio de la landing en `origenesPermitidos`.
- **Siempre "No pudimos hacer la consulta"**: `data-api` vacío, mal escrito o con `/` al final mal puesto; o el server de Ruthina no tiene las rutas montadas (probar abrir `<api>/api/promo100/cupos`).
- **429**: el mismo IP hizo más de 8 consultas en una hora (límite anti-abuso de la ruta).
