// promo100-route.js — Promo "Fiat 0 km 100% financiado" (50 cupos) para Ruthina / compara-conejo.
//
// Califica SOLO con Banco de Córdoba (Bancor) y Banco Nación. Aprobado = aprueba en al menos uno.
// Al cliente nunca le llega ni el banco ni el monto: solo "aprobado" / "rechazado".
//
// Uso en server.js (después de crear `app` y el `pool` de Postgres):
//
//   const montarPromo100 = require('./promo100-route');
//   montarPromo100(app, {
//     pool,                                   // el pool de pg que ya usa Ruthina
//     consultarBanco: async (banco, cuit) => { // banco: 'bancor' | 'nacion'
//       // Conectar acá la consulta que ya usa Ruthina / Consulta Créditos para ese banco.
//       // Tiene que devolver { aprobado: true|false, monto?: number, detalle?: string }.
//     },
//     registrarPedido: async (pedido) => {    // opcional: para que aparezca en "Pedidos Bancos"
//       // pedido = { origen, cuit, dni, genero, auto, telefono, estado, bancos }
//     },
//     origenesPermitidos: ['https://promo-tutu-production.up.railway.app'] // dominio de la landing
//   });
//
// Endpoints (los que llama index.html):
//   POST /api/promo100/calificar   {cuit, auto, telefono, dni?, genero?, origen}
//        -> {estado: 'pendiente', id} | {estado: 'aprobado'|'rechazado'|'agotado'}
//   GET  /api/promo100/estado/:id  -> {estado, cuposRestantes}
//   GET  /api/promo100/cupos       -> {total, restantes}

const TOTAL_CUPOS = 50;
const BANCOS = ['bancor', 'nacion'];
const AUTOS = ['cronos', 'argo', 'strada'];
const TIEMPO_MAX_MS = 150000; // si un banco no responde en 2,5 min, cuenta como no aprobado

module.exports = function montarPromo100(app, opts) {
  const { pool, consultarBanco, registrarPedido, origenesPermitidos = [] } = opts;
  if (!pool || typeof consultarBanco !== 'function') {
    throw new Error('promo100: faltan pool o consultarBanco');
  }

  // --- tabla -------------------------------------------------------------
  const listo = pool.query(`
    CREATE TABLE IF NOT EXISTS promo100_solicitudes (
      id          SERIAL PRIMARY KEY,
      cuit        VARCHAR(11) NOT NULL,
      dni         VARCHAR(8),
      genero      CHAR(1),
      auto        VARCHAR(10) NOT NULL,
      telefono    VARCHAR(30) NOT NULL,
      estado      VARCHAR(12) NOT NULL DEFAULT 'pendiente',
      bancos      JSONB,
      creado      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS promo100_cuit ON promo100_solicitudes (cuit);
  `).catch(e => console.error('promo100: no se pudo crear la tabla', e));

  // --- CORS solo para la landing -----------------------------------------
  app.use('/api/promo100', (req, res, next) => {
    const o = req.headers.origin;
    if (o && (origenesPermitidos.length === 0 || origenesPermitidos.includes(o))) {
      res.setHeader('Access-Control-Allow-Origin', o);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // --- límite simple por IP (evita que usen la landing para consultar CUITs en masa)
  const hits = new Map();
  const limitar = (req, res, next) => {
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    const ahora = Date.now();
    const lista = (hits.get(ip) || []).filter(t => ahora - t < 3600000);
    if (lista.length >= 8) return res.status(429).json({ error: 'Demasiadas consultas, probá más tarde.' });
    lista.push(ahora); hits.set(ip, lista); next();
  };

  // --- helpers -------------------------------------------------------------
  const cuitValido = c => {
    if (!/^\d{11}$/.test(c)) return false;
    const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const s = w.reduce((a, x, i) => a + x * Number(c[i]), 0);
    let dv = 11 - (s % 11); if (dv === 11) dv = 0; if (dv === 10) dv = 9;
    return dv === Number(c[10]);
  };

  async function aprobadosHastaAhora() {
    const r = await pool.query(`SELECT COUNT(DISTINCT cuit)::int AS n FROM promo100_solicitudes WHERE estado = 'aprobado'`);
    return r.rows[0].n;
  }
  const restantes = async () => Math.max(0, TOTAL_CUPOS - await aprobadosHastaAhora());

  const conTiempo = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r({ aprobado: false, detalle: 'sin respuesta' }), ms))]);

  async function procesar(id, datos) {
    const resultados = {};
    await Promise.all(BANCOS.map(async banco => {
      try {
        const r = await conTiempo(Promise.resolve(consultarBanco(banco, datos.cuit)), TIEMPO_MAX_MS);
        resultados[banco] = { aprobado: !!(r && r.aprobado), monto: r && r.monto || null, detalle: r && r.detalle || null };
      } catch (e) {
        resultados[banco] = { aprobado: false, detalle: 'error: ' + (e.message || e) };
      }
    }));
    let estado = BANCOS.some(b => resultados[b].aprobado) ? 'aprobado' : 'rechazado';
    if (estado === 'aprobado' && await restantes() <= 0) estado = 'agotado';
    await pool.query(`UPDATE promo100_solicitudes SET estado = $1, bancos = $2 WHERE id = $3`, [estado, resultados, id]);
    if (typeof registrarPedido === 'function') {
      registrarPedido({ origen: 'Landing promo 100% financiado', ...datos, estado, bancos: resultados })
        .catch(e => console.error('promo100: registrarPedido', e));
    }
  }

  // --- rutas ---------------------------------------------------------------
  app.get('/api/promo100/cupos', async (req, res) => {
    try { await listo; res.json({ total: TOTAL_CUPOS, restantes: await restantes() }); }
    catch (e) { res.status(500).json({ error: 'cupos' }); }
  });

  app.post('/api/promo100/calificar', limitar, async (req, res) => {
    try {
      await listo;
      const b = req.body || {};
      const cuit = String(b.cuit || '').replace(/\D/g, '');
      const auto = String(b.auto || '').toLowerCase();
      const telefono = String(b.telefono || '').trim().slice(0, 30);
      const dni = b.dni ? String(b.dni).replace(/\D/g, '').slice(0, 8) : null;
      const genero = b.genero === 'F' || b.genero === 'M' ? b.genero : null;
      if (!cuitValido(cuit) || !AUTOS.includes(auto) || telefono.replace(/\D/g, '').length < 8) {
        return res.status(400).json({ error: 'Datos inválidos' });
      }
      if (await restantes() <= 0) return res.json({ estado: 'agotado' });

      // mismo CUIT consultado en las últimas 24 h: se devuelve ese resultado sin volver a los bancos
      const prev = await pool.query(
        `SELECT id, estado FROM promo100_solicitudes WHERE cuit = $1 AND creado > now() - interval '24 hours' ORDER BY id DESC LIMIT 1`, [cuit]);
      if (prev.rows[0]) {
        const p = prev.rows[0];
        if (p.estado === 'pendiente') return res.json({ estado: 'pendiente', id: p.id });
        return res.json({ estado: p.estado === 'agotado' ? 'agotado' : p.estado });
      }

      const ins = await pool.query(
        `INSERT INTO promo100_solicitudes (cuit, dni, genero, auto, telefono) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [cuit, dni, genero, auto, telefono]);
      const id = ins.rows[0].id;
      procesar(id, { cuit, dni, genero, auto, telefono }).catch(async e => {
        console.error('promo100: procesar', e);
        await pool.query(`UPDATE promo100_solicitudes SET estado = 'error' WHERE id = $1`, [id]).catch(() => {});
      });
      res.json({ estado: 'pendiente', id });
    } catch (e) {
      console.error('promo100: calificar', e);
      res.status(500).json({ error: 'calificar' });
    }
  });

  app.get('/api/promo100/estado/:id', async (req, res) => {
    try {
      const r = await pool.query(`SELECT estado FROM promo100_solicitudes WHERE id = $1`, [Number(req.params.id) || 0]);
      if (!r.rows[0]) return res.status(404).json({ error: 'no existe' });
      res.json({ estado: r.rows[0].estado, cuposRestantes: await restantes() });
    } catch (e) {
      res.status(500).json({ error: 'estado' });
    }
  });
};
