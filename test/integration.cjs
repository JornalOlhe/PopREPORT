const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const fs = require('node:fs');
if(fs.existsSync(path.join(root,'.env')))for(const line of fs.readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/)){
  const match=line.match(/^([A-Z_]+)=(.*)$/);if(match&&!(match[1] in process.env))process.env[match[1]]=match[2].replace(/^['"]|['"]$/g,'');
}
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
    const validTrackUrl='https://open.spotify.com/track/46rPcSaUj5jHxX60xWmsMD';
    const embed=await (await request('/api/embed?url='+encodeURIComponent('https://open.spotify.com/intl-pt/track/43iIQbw5hx986dUEZbr3eN?si=test'))).json();
    assert.equal(embed.url,'https://open.spotify.com/embed/track/43iIQbw5hx986dUEZbr3eN');
    assert.equal((await request('/api/spotify/track?url='+encodeURIComponent('https://open.spotify.com/track/short'))).status,400);
    assert.equal((await request('/api/spotify/track?url='+encodeURIComponent(validTrackUrl))).status,503);
    assert.equal((await request('/?screen=artist&id=12369444')).status,200);
    assert.equal((await request('/Imagens/fallback.svg')).status,200);
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
    const collection=await (await request('/api/collection')).json();assert.ok(collection.profile.name);assert.ok(collection.playlists.length);
    const playlistName='Verificação '+Date.now();
    const created=await request('/api/collection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'playlist',name:playlistName,description:'Playlist de verificação da integração'})});
    assert.equal(created.status,201);
    const playlist=(await created.json()).playlists.find(p=>p.name===playlistName);assert.ok(playlist);
    const duplicate=await request('/api/collection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'playlist',name:playlistName})});assert.equal(duplicate.status,409);
    const payload={artist:song.artist,track:song.track,spotifyUrl:song.spotifyUrl,playlistId:playlist.id};
    for(let i=0;i<2;i++)assert.equal((await request('/api/lista',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})).status,201);
    const updated=await (await request('/api/collection')).json();assert.deepEqual(updated.playlists.find(p=>p.id===playlist.id).songIds,[song.id]);
    assert.equal((await request('/api/lista',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,playlistId:4294967295})})).status,400);
    assert.ok(songs.some(s=>s.album&&s.genre));
    const connection=await require('mysql2/promise').createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'popreport'});
    try{await connection.execute('DELETE FROM playlist WHERE id=? AND nome=?',[playlist.id,playlistName]);}finally{await connection.end();}
    console.log('PASS: usuário, playlist, música, álbum, artista e gênero ligados; relação N:N sem duplicação');
  });
  await run({DB_PORT:'1'},async request=>{const state=await(await request('/api/db/status')).json();assert.equal(state.connected,false);assert.equal((await request('/api/lista')).status,503);assert.equal((await request('/')).status,200);console.log('PASS: falha do banco é explícita e não impede a home');});

  if(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET){
    await run({},async request=>{
      const searchResponse=await request('/api/music/search?'+new URLSearchParams({q:'Laufey',filter:'artist'}));
      assert.equal(searchResponse.status,200);
      const search=await searchResponse.json();
      assert.equal(search.source,'Spotify');
      const artist=search.artists.find(item=>/^[A-Za-z0-9]{22}$/.test(item.id));
      assert.ok(artist);
      assert.ok(artist.spotifyUrl?.startsWith('https://open.spotify.com/artist/'));
      const profileResponse=await request('/api/music/artist/'+artist.id);
      assert.equal(profileResponse.status,200);
      const profile=await profileResponse.json();
      assert.equal(profile.source,'Spotify');
      assert.equal(profile.id,artist.id);
      assert.ok(Array.isArray(profile.albums));
      assert.ok(Array.isArray(profile.tracks));
      const metadataResponse=await request('/api/spotify/track?url='+encodeURIComponent('https://open.spotify.com/track/46rPcSaUj5jHxX60xWmsMD'));
      assert.equal(metadataResponse.status,200);
      const metadata=await metadataResponse.json();
      assert.equal(metadata.source,'Spotify');
      assert.equal(metadata.spotifyId,'46rPcSaUj5jHxX60xWmsMD');
      assert.ok(metadata.track);
      assert.ok(metadata.artist);
      console.log('PASS: busca, perfil e metadados diretos do Spotify');
    });
  } else {
    console.log('SKIP: credenciais Spotify ausentes; testes diretos da Spotify Web API não executados');
  }

  console.log('Todos os testes de integração passaram.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
