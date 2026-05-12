require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [n] = await c.query(
    `SELECT id, cita_id, canal, tipo, estado, LEFT(contenido,200) AS preview, enviado_at, created_at
     FROM NOTIFICACIONES
     WHERE canal='email'
     ORDER BY created_at DESC
     LIMIT 10`
  );
  console.log('--- last 10 email notifications ---');
  console.table(n);

  const [t] = await c.query(
    "SELECT canal, tipo_evento, LEFT(contenido,150) AS head FROM PLANTILLAS WHERE canal='email' AND tipo_evento='confirmacion'"
  );
  console.log('--- email/confirmacion template head ---');
  console.log(t[0].head);

  await c.end();
})();
