const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.TEST_PORT || 3118);
async function run(extra, callback) {
  const child = spawn(process.execPath, ['server.js'], { cwd:root, windowsHide:true, env:{...process.env, PORT:String(port), ...extra}, stdio:'ignore' });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready=false;
    for(let i=0;i<100;i++) { try {const r=await fetch(base);if(r.ok){ready=true;break;}} catch {} await new Promise(r=>setTimeout(r,100)); }
    assert.ok(ready,'Servidor iniciou');
    await callback(async (url, opts)=>fetch(base+url,opts));
  } finally { const stopped=new Promise(r=>child.once('exit',r));child.kill();await stopped; }
}
(async()=>{
  // Proves the basic application does not require a Spotify subscription or key.
  await run({ SPOTIFY_CLIENT_ID:'', SPOTIFY_CLIENT_SECRET:'' },async request=>{
    const state=await (await request('/api/status')).json();
    assert.equal(state.spotify.configured,false);
    assert.equal(state.database.connected,true);
    console.log('PASS: MySQL conectado e Spotify opcional desativado');
    for(const file of ['/.env','/server.js','/music.js','/database/popreport.sql','/node_modules/mysql2/package.json','/%2eenv','/script/../server.js']) assert.equal((await request(file)).status,404,file);
    console.log('PASS: arquivos privados bloqueados');
    for(const query of ['q=x','q=abc&filter=invalid','q=abc&offset=-1','q=abc&offset=1.5','q='+ 'x'.repeat(101)]) assert.equal((await request('/api/music/search?'+query)).status,400);
    for(const link of ['https://evil.example/track/43iIQbw5hx986dUEZbr3eN','http://open.spotify.com/track/43iIQbw5hx986dUEZbr3eN','https://open.spotify.com/track/short','javascript:alert(1)']) assert.equal((await request('/api/embed?url='+encodeURIComponent(link))).status,400);
    const embed=await (await request('/api/embed?url='+encodeURIComponent('https://open.spotify.com/intl-pt/track/43iIQbw5hx986dUEZbr3eN?si=test'))).json();
    assert.equal(embed.url,'https://open.spotify.com/embed/track/43iIQbw5hx986dUEZbr3eN');
    assert.equal((await request('/api/lista',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:'{}'})).status,403);
    assert.equal((await request('/api/lista',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);
    assert.equal((await request('/api/lista',{method:'POST',headers:{'Content-Type':'application/json'},body:'null'})).status,400);
    assert.equal((await request('/api/lista',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(70000)})).status,413);
    console.log('PASS: parâmetros, links e origem de gravação validados');
    for(const [q,filter,key] of [['Coldplay','artist','artists'],['Abbey Road','album','albums'],['From The Start','track','tracks']]) {
      const r=await request('/api/music/search?'+new URLSearchParams({q,filter}));assert.equal(r.status,200);const data=await r.json();assert.ok(data[key].length>0);assert.equal(data.source,'Deezer');
    }
    const profile=await (await request('/api/music/artist/12369444')).json();
    assert.equal(profile.name,'Laufey');assert.ok(profile.albums.length);assert.ok(profile.tracks.length);assert.ok(profile.bio?.url);
    const page2=await (await request('/api/music/artist/12369444?offset=24')).json();assert.ok(page2.albums.length);assert.notEqual(page2.albums[0].id,profile.albums[0].id);
    console.log('PASS: busca de banda/álbum/música, perfil, biografia e paginação sem Spotify');
    const songs=await (await request('/api/lista')).json();assert.ok(songs.length);
    const song=songs.find(s=>/^[a-zA-Z0-9]{22}$/.test(s.spotifyId));assert.ok(song);
    const result=await request('/api/lista',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({artist:song.artist,track:song.track,spotifyUrl:song.spotifyUrl})});
    assert.equal(result.status,201);const saved=await result.json();assert.equal(saved.album,song.album);assert.equal(saved.id,song.id);
    console.log('PASS: cadastro idempotente sem API preserva metadados existentes');
  });
  await run({DB_PORT:'1'},async request=>{const state=await(await request('/api/db/status')).json();assert.equal(state.connected,false);assert.equal((await request('/api/lista')).status,503);assert.equal((await request('/')).status,200);console.log('PASS: falha do banco é explícita e não impede a home');});
  console.log('Todos os testes de integração passaram.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
