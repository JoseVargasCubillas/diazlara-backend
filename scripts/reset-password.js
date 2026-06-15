const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

async function run() {
  const hash = await bcrypt.hash('Admin2024', 12);
  const conn = await mysql.createConnection({
    host: 'localhost', port: 3306,
    user: 'root', password: 'Jose120502@@',
    database: 'diazlara'
  });
  const [result] = await conn.execute(
    'UPDATE CONSULTORES SET password_hash = ? WHERE email = ?',
    [hash, 'contacto@diazlara.mx']
  );
  console.log('Filas actualizadas:', result.affectedRows);
  console.log('Hash guardado correctamente');
  await conn.end();
}
run().catch(console.error);
