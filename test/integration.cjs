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
    const embed=await (await request('/api/embed?url='+encodeURIComponent('https://open.spotify.com/intl-pt/track/43iIQbw5hx986dUEZbr3eN?si=test'))).json();
    assert.equal(embed.url,'https://open.spotify.com/embed/track/43iIQbw5hx986dUEZbr3eN');
    assert.equal((await request('/api/spotify/track?url='+encodeURIComponent('https://open.spotify.com/track/46rPcSaUj5jHxX60xWmsMD'))).status,404);
    assert.equal((await request('/?screen=artist&id=12369444')).status,200);
    assert.equal((await request('/Imagens/fallback.svg')).status,200);
    const post=(body,headers={})=>request('/api/playlist-tracks',{method:'POST',headers:{'Content-Type':'application/json',...headers},body});
    assert.equal((await post('{}',{Origin:'https://evil.example'})).status,403);
    assert.equal((await post('{}')).status,400);
    assert.equal((await post('null')).status,400);
    assert.equal((await post('x'.repeat(70000))).status,413);
    assert.equal((await request('/api/lista',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,404);
    console.log('PASS: parâmetros, links e origem de gravação validados');
    for(const [q,filter,key] of [['Coldplay','artist','artists'],['Abbey Road','album','albums'],['From The Start','track','tracks']]) {
      const r=await request('/api/music/search?'+new URLSearchParams({q,filter}));assert.equal(r.status,200);const data=await r.json();assert.ok(data[key].length>0);assert.equal(data.source,'Deezer');
    }
    const profile=await (await request('/api/music/artist/12369444')).json();
    assert.equal(profile.name,'Laufey');assert.ok(profile.albums.length);assert.ok(profile.tracks.length);assert.ok(profile.bio?.url);
    const page2=await (await request('/api/music/artist/12369444?offset=24')).json();assert.ok(page2.albums.length);assert.notEqual(page2.albums[0].id,profile.albums[0].id);
    console.log('PASS: busca de banda/álbum/música, perfil, biografia e paginação sem Spotify');
    const albumsResponse=await request('/api/music/artist/12369444/albums');assert.equal(albumsResponse.status,200);
    const {albums}=await albumsResponse.json();assert.ok(albums.length>1);
    const dates=albums.map(a=>a.releaseDate).filter(Boolean);assert.deepEqual(dates,[...dates].sort().reverse());
    const album=await (await request('/api/music/album/'+albums.find(a=>a.totalTracks>0).id)).json();
    const track=album.tracks[0];assert.equal(track.source,'deezer');assert.ok(track.previewUrl);
    console.log('PASS: álbuns do artista em ordem de lançamento e faixas com prévia');
    const collection=await (await request('/api/collection')).json();assert.ok(collection.profile.name);
    const playlistName='Verificação '+Date.now();
    const created=await request('/api/collection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'playlist',name:playlistName,description:'Playlist de verificação da integração'})});
    assert.equal(created.status,201);
    const playlist=(await created.json()).playlists.find(p=>p.name===playlistName);assert.ok(playlist);
    const duplicate=await request('/api/collection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'playlist',name:playlistName})});assert.equal(duplicate.status,409);
    const payload={playlistId:playlist.id,track:{source:'deezer',trackId:track.id,track:track.name,durationMs:track.durationMs,explicit:track.explicit,trackNumber:track.trackNumber,url:track.url,artistId:'12369444',artist:'Laufey',artistImage:album.image,albumId:album.id,album:album.name,image:album.image,releaseDate:album.releaseDate}};
    for(let i=0;i<2;i++)assert.equal((await post(JSON.stringify(payload))).status,201);
    assert.equal((await post(JSON.stringify({...payload,playlistId:4294967295}))).status,400);
    assert.equal((await post(JSON.stringify({...payload,track:{...payload.track,source:'other'}}))).status,400);
    assert.equal((await post(JSON.stringify({...payload,track:{...payload.track,trackId:'../x'}}))).status,400);
    const updated=(await (await request('/api/collection')).json()).playlists.find(p=>p.id===playlist.id);
    assert.equal(updated.songIds.length,1);assert.deepEqual(updated.trackKeys,['deezer:'+track.id]);
    const songs=await (await request('/api/lista')).json();
    const saved=songs.find(s=>s.id===updated.songIds[0]);assert.ok(saved);assert.equal(saved.source,'deezer');assert.equal(saved.externalId,track.id);assert.equal(saved.artist,'Laufey');assert.equal(saved.spotifyUrl,'');
    const connection=await require('mysql2/promise').createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'popreport'});
    try{await connection.execute('DELETE FROM playlist WHERE id=? AND nome=?',[playlist.id,playlistName]);}finally{await connection.end();}
    console.log('PASS: playlist → faixa (+) identificada no banco (artista, álbum, música); repetição não duplica');
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
      const discography=await (await request(`/api/music/artist/${artist.id}/albums`)).json();
      assert.equal(discography.source,'Spotify');
      assert.ok(Array.isArray(discography.albums));
      console.log('PASS: busca, perfil e álbuns diretos do Spotify');
    });
  } else {
    console.log('SKIP: credenciais Spotify ausentes; testes diretos da Spotify Web API não executados');
  }

  console.log('Todos os testes de integração passaram.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
