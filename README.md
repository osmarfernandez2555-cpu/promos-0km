# Promos 0 km — Tutu Automotores

Landing de la promo **Fiat Cronos, Argo y Strada 100% financiados (cupos limitados)**.
Califica con CUIT, o con DNI + género (calcula el CUIL), contra Ruthina usando solo Bancor y Banco Nación.

## Archivos
- `index.html` — la landing (formulario, resultados, cupos).
- `img/` — autos recortados de las placas, foto de portada y logo.
- `assets/` — estilos y scripts del sistema de diseño.
- `package.json` — sirve la página estática en Railway.

## Publicar en Railway
1. New Project → Deploy from GitHub repo → `promos-0km`.
2. Railway detecta Node y corre `npm start` (sirve la carpeta con `serve`).
3. Settings → Networking → Generate Domain.

## Conexión con Ruthina
La landing llama a `https://compara-conejo-production.up.railway.app` (atributo `data-api` del formulario en `index.html`).
Las rutas están en el repo COMPARA-CONEJO, archivo `promo100.js`:
- Cada consulta abre un pedido en "Pedidos Bancos" con origen `promo-100`.
- La consulta automática de Ruthina lo resuelve usando **solo Bancor y Nación**.
- Entra a la promo solo si Bancor o Nación aprueban **más de $ 6.000.000** (variable `PROMO100_MONTO_MIN` en compara-conejo). Si aprueban menos o rechazan, la landing pide probar con otro DNI.
- Si los bancos no contestan a tiempo, o aprueban sin informar monto, la landing dice "Recibimos tus datos" y un asesor lo revisa.

Los cupos se muestran como "limitados" (estrategia comercial): no se cuentan ni se descuentan.

Variable opcional en Railway (compara-conejo): `PROMO100_MAX_POR_IP` (8).

En Ruthina, Pedidos Bancos → pestaña **🔷 Promos 0km** muestra el volumen, los que califican y los rechazados (`GET /api/promo100/resumen`).

## Endpoints que usa la página
- `POST /api/promo100/calificar` → `{estado: pendiente, id}`
- `GET /api/promo100/estado/:id` → `{estado: pendiente|aprobado|rechazado|revision}`

## Errores comunes
- **Siempre "No pudimos hacer la consulta"**: abrir `https://compara-conejo-production.up.railway.app/api/promo100/estado/1`; si responde `Cannot GET`, compara-conejo no tiene la última versión desplegada (con la versión nueva responde `No existe` o un estado).
- **Muchos "Recibimos tus datos"**: las sesiones de Bancor o Nación en Consulta Créditos están cerradas (ver el estado en Pedidos Bancos).
- **429**: el mismo IP hizo más de 8 consultas en una hora (límite anti-abuso de la ruta).
