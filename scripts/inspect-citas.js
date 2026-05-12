require('dotenv').config();
const m = require('mysql2/promise');
(async () => {
  const c = await m.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [r] = await c.query(
    `SELECT cl.nombre, cl.email, c.fecha_hora_inicio, c.created_at, c.meet_link
     FROM CITAS c JOIN CLIENTES cl ON c.cliente_id = cl.id
     ORDER BY c.created_at DESC LIMIT 8`
  );
  console.table(r);
  await c.end();
})();
