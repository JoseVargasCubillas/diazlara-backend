require('dotenv').config();
const m = require('mysql2/promise');
(async () => {
  const c = await m.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  console.log('--- ALL CITAS (last 15) ---');
  const [r] = await c.query(
    `SELECT cl.nombre, cl.email, c.fecha_hora_inicio, c.created_at, c.estado, c.meet_link
     FROM CITAS c JOIN CLIENTES cl ON c.cliente_id = cl.id
     ORDER BY c.created_at DESC LIMIT 15`
  );
  console.table(r);

  console.log('\n--- LEADS_EN_ESPERA con nombre Maur* ---');
  const [l] = await c.query(
    `SELECT id, nombre, email, estado, created_at, updated_at FROM LEADS_EN_ESPERA WHERE nombre LIKE '%Maur%' OR email LIKE '%Maur%' OR email LIKE '%maur%'`
  );
  console.table(l);

  console.log('\n--- CLIENTES con nombre Maur* ---');
  const [cl] = await c.query(
    `SELECT id, nombre, email, created_at FROM CLIENTES WHERE nombre LIKE '%Maur%' OR email LIKE '%maur%'`
  );
  console.table(cl);

  await c.end();
})();
