const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const ROOT = path.resolve(__dirname, '..');
function loadEnv() {
  for (const fileName of ['.env.local', '.env']) {
    const file = path.join(ROOT, fileName);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const value = line.trim();
      if (!value || value.startsWith('#')) continue;
      const i = value.indexOf('=');
      if (i < 1) continue;
      const key = value.slice(0, i).trim();
      const val = value.slice(i + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  }
}
loadEnv();

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'popreport.sql'), 'utf8');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });
  await connection.query(sql);
  await connection.end();
  console.log('Banco popreport criado/atualizado com sucesso.');
})().catch(err => {
  console.error('Falha ao preparar o banco:', err.message);
  process.exitCode = 1;
});
