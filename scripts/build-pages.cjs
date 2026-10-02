const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs');
const files = ['index.html','artist.html','library.html','form.html','app.css','script/app.js','script/form.js','script/api.js','script/music-data.js','Imagens/fallback.svg'];
const csp = "default-src 'self'; script-src 'self' https://api.deezer.com; connect-src 'self' https://pt.wikipedia.org; img-src 'self' https:; frame-src https://open.spotify.com; media-src 'self' blob:; object-src 'none'; base-uri 'self'";
for (const file of files) {
  const target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (file.endsWith('.html')) {
    const html = fs.readFileSync(path.join(root, file), 'utf8').replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`);
    fs.writeFileSync(target, html);
  } else fs.copyFileSync(path.join(root, file), target);
}
fs.writeFileSync(path.join(output,'script/runtime-config.js'), "window.POPREPORT_MODE = 'static';\n");
fs.writeFileSync(path.join(output,'.nojekyll'), '');
console.log('GitHub Pages pronto em docs/. Nenhuma credencial, SQL ou código do servidor foi copiado.');
