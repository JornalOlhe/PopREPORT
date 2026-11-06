// Confere a sintaxe de todos os .js/.cjs do projeto (novos arquivos entram sozinhos).
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = ['script', 'scripts', 'test'].flatMap(dir => fs.readdirSync(path.join(root, dir)).filter(f => /\.c?js$/.test(f)).map(f => path.join(root, dir, f)));
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log(`Sintaxe OK em ${files.length} arquivos.`);
