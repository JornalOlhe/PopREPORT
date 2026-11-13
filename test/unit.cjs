// Testes sem rede e sem MySQL: dados da Deezer e o Supabase são simulados.
// Fluxo coberto: artista (Laufey) → álbuns por data → faixa "From the Start" → playlist → botão +.
const assert = require('node:assert/strict');
const path = require('node:path');

const ARTIST = { id: 12369444, name: 'Laufey', picture_xl: 'https://cdn.test/laufey.jpg' };
const FTS = { id: 111, title: 'From the Start', duration: 170, preview: 'https://cdn.test/fts.mp3', explicit_lyrics: false, link: 'https://www.deezer.com/track/111', track_position: 3, artist: ARTIST };
const fixtures = {
  '/artist/12369444/albums': { data: [
    { id: 3, title: 'Bewitched', release_date: '2023-09-08', record_type: 'album', cover_xl: 'https://cdn.test/b.jpg' },
    { id: 1, title: 'Everything I Know About Love', release_date: '2021-08-27', record_type: 'album', cover_xl: 'https://cdn.test/e.jpg' },
    { id: 9, title: 'Bewitched', release_date: '2023-09-08', record_type: 'album' },
    { id: 5, title: 'Sem data', release_date: '', record_type: 'single' },
    { id: 2, title: 'Typical of Me', release_date: '2021-03-01', record_type: 'ep' }
  ] },
  '/album/1': { id: 1, title: 'Everything I Know About Love', release_date: '2021-08-27', cover_xl: 'https://cdn.test/e.jpg', nb_tracks: 2, artist: ARTIST, tracks: { data: [
    { id: 110, title: 'Fragile', duration: 200, preview: '', artist: ARTIST },
    FTS
  ] } },
  '/search/artist': { data: [ARTIST] }
};
const calls = [];
function fakeFetch(handlers) {
  return async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.hostname === 'api.deezer.com') {
      const body = fixtures[url.pathname];
      return { ok: Boolean(body), status: body ? 200 : 404, json: async () => body || {}, text: async () => JSON.stringify(body || {}) };
    }
    for (const [match, reply] of handlers) {
      if (match(url, init)) { const r = reply(url, init); return { ok: r.status < 400, status: r.status, json: async () => r.body, text: async () => (r.body === undefined ? '' : JSON.stringify(r.body)) }; }
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '{}' };
  };
}
function freshApp({ cloud }) {
  const store = new Map();
  globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  globalThis.location = { origin: 'https://app.test' };
  globalThis.POPREPORT_MODE = 'static';
  if (cloud) globalThis.POPREPORT_SUPABASE = { url: 'https://proj.supabase.co', key: 'sb_publishable_test' }; else delete globalThis.POPREPORT_SUPABASE;
  delete globalThis.PopReportCloud; delete globalThis.PopReportAPI;
  for (const file of ['api.js', 'cloud.js']) delete require.cache[path.resolve(__dirname, '../script', file)];
  globalThis.PopReportMusic = require('../script/music-data');
  require('../script/cloud.js');
  require('../script/api.js');
  return globalThis.PopReportAPI;
}
const post = (api, url, body) => api.request(url, { method: 'POST', body: JSON.stringify(body) });
function trackPayload(album, track, source = 'deezer') {
  return { source, trackId: track.id, track: track.name, durationMs: track.durationMs, explicit: track.explicit, trackNumber: track.trackNumber, url: track.url, artistId: String(ARTIST.id), artist: 'Laufey', artistImage: ARTIST.picture_xl, albumId: album.id, album: album.name, image: album.image, releaseDate: album.releaseDate };
}

(async () => {
  // ---- Catálogo (Deezer simulada) ----
  globalThis.fetch = fakeFetch([]);
  let api = freshApp({ cloud: false });
  const { albums } = await api.request('/api/music/artist/12369444/albums');
  assert.deepEqual(albums.map(a => a.name), ['Bewitched', 'Everything I Know About Love', 'Typical of Me', 'Sem data']);
  assert.deepEqual(albums.map(a => a.releaseDate), ['2023-09-08', '2021-08-27', '2021-03-01', '']);
  assert.equal(albums[0].artistId, '12369444');
  const asc = PopReportMusic.sortByRelease(albums, 'asc');
  assert.deepEqual(asc.map(a => a.releaseDate), ['2021-03-01', '2021-08-27', '2023-09-08', '']);
  const album = await api.request('/api/music/album/1');
  assert.equal(album.tracks.length, 2);
  const fts = album.tracks.find(t => t.name === 'From the Start');
  assert.equal(fts.source, 'deezer');
  assert.equal(fts.trackNumber, 3);
  assert.equal(fts.durationMs, 170000);
  assert.equal(fts.previewUrl, 'https://cdn.test/fts.mp3');
  assert.equal(album.tracks[0].previewUrl, '');
  const found = await api.request('/api/music/search?q=laufey&filter=artist');
  assert.equal(found.artists[0].image, 'https://cdn.test/laufey.jpg');
  console.log('PASS: artista com foto, álbuns por data de lançamento e faixas com prévia');

  // ---- Reserva local (sem banco online) ----
  let collection = await api.request('/api/collection');
  assert.deepEqual(collection.playlists, []);
  await assert.rejects(post(api, '/api/playlist-tracks', { playlistId: 'x', track: trackPayload(album, fts) }), /playlist/i);
  collection = await post(api, '/api/collection', { action: 'playlist', name: 'Tardes de jazz', description: '' });
  await assert.rejects(post(api, '/api/collection', { action: 'playlist', name: 'tardes de JAZZ' }), /já tem uma playlist/);
  const playlist = collection.playlists[0];
  const payload = trackPayload(album, fts);
  for (let i = 0; i < 2; i++) await post(api, '/api/playlist-tracks', { playlistId: playlist.id, track: payload });
  collection = await api.request('/api/collection');
  assert.deepEqual(collection.playlists[0].trackKeys, ['deezer:111']);
  assert.equal(collection.playlists[0].songIds.length, 1);
  const songs = await api.request('/api/lista');
  assert.equal(songs.length, 1);
  assert.equal(songs[0].track, 'From the Start');
  assert.equal(songs[0].source, 'deezer');
  assert.equal(songs[0].artistId, '12369444');
  for (const bad of [{ ...payload, source: 'other' }, { ...payload, trackId: '../x' }, { ...payload, track: ' ' }, { ...payload, album: '' }]) {
    await assert.rejects(post(api, '/api/playlist-tracks', { playlistId: playlist.id, track: bad }));
  }
  assert.equal(await api.storage(), 'local');
  // remover música e apagar playlist
  await post(api, '/api/collection', { action: 'removeTrack', playlistId: playlist.id, trackId: collection.playlists[0].songIds[0] });
  collection = await api.request('/api/collection');
  assert.equal(collection.playlists[0].songIds.length, 0);
  assert.equal((await api.request('/api/lista')).length, 0, 'música sem playlist some do navegador');
  await post(api, '/api/collection', { action: 'deletePlaylist', playlistId: playlist.id });
  assert.equal((await api.request('/api/collection')).playlists.length, 0);
  console.log('PASS: playlist criada antes; + adiciona a faixa uma única vez; dados inválidos rejeitados');

  // ---- Supabase (simulado): login anônimo, RPC e leitura ----
  const db = { playlists: [], links: [], rpc: [] };
  globalThis.fetch = fakeFetch([
    [(u, i) => u.pathname === '/auth/v1/token' && i.method === 'POST', () => ({ status: 200, body: { access_token: 'jwt-1', refresh_token: 'ref-1', expires_in: 3600 } })],
    [(u, i) => u.pathname === '/rest/v1/rpc/username_available', (u, i) => ({ status: 200, body: JSON.parse(i.body).p_name !== 'Ocupado' })],
    [(u, i) => u.pathname === '/auth/v1/signup' && i.method === 'POST', (u, i) => { const b = JSON.parse(i.body); return b.email === 'dup@x.com' ? { status: 200, body: { user: { identities: [] } } } : { status: 200, body: { access_token: 'jwt-1', refresh_token: 'ref-1', expires_in: 3600, user: { identities: [{}] } } }; }],
    [(u, i) => u.pathname === '/rest/v1/profiles' && i.method === 'GET', () => ({ status: 200, body: [] })],
    [(u, i) => u.pathname === '/rest/v1/playlists' && i.method === 'POST', (u, i) => { db.playlists.push({ id: 7, ...JSON.parse(i.body) }); return { status: 201 }; }],
    [(u, i) => u.pathname === '/rest/v1/playlists', () => ({ status: 200, body: db.playlists.map(p => ({ id: p.id, name: p.name, description: p.description })) })],
    [(u, i) => u.pathname === '/rest/v1/rpc/add_track_to_playlist', (u, i) => { db.rpc.push(JSON.parse(i.body)); db.links = [{ playlist_id: 7, track_id: 55, position: 1, added_at: '2026-10-30T12:00:00Z', tracks: { id: 55, source: 'deezer', external_id: '111', title: 'From the Start', duration_ms: 170000, url: 'https://www.deezer.com/track/111', albums: { title: 'Everything I Know About Love', image_url: 'https://cdn.test/e.jpg', release_date: '2021-08-27', artists: { name: 'Laufey', external_id: '12369444', image_url: null } } } }]; return { status: 200, body: 55 }; }],
    [(u, i) => u.pathname === '/rest/v1/playlist_tracks', () => ({ status: 200, body: db.links })],
    // LE6: views com JOIN
    [(u, i) => u.pathname === '/rest/v1/v_playlist_resumo', () => ({ status: 200, body: db.playlists.map(p => ({ playlist_id: p.id, name: p.name, description: p.description, total_faixas: db.links.length, duracao_ms: db.links.length * 170000, total_artistas: db.links.length })) })],
    [(u, i) => u.pathname === '/rest/v1/v_playlist_faixas', () => ({ status: 200, body: db.links.map(l => ({ playlist_id: l.playlist_id, position: l.position, added_at: l.added_at, track_id: l.tracks.id, source: l.tracks.source, external_id: l.tracks.external_id, title: l.tracks.title, duration_ms: l.tracks.duration_ms, url: l.tracks.url, album_titulo: l.tracks.albums.title, image_url: l.tracks.albums.image_url, artist_external_id: l.tracks.albums.artists.external_id, artista_nome: l.tracks.albums.artists.name })) })],
    [(u, i) => u.pathname === '/rest/v1/v_artista_catalogo', () => ({ status: 200, body: [{ id: 1, source: 'deezer', external_id: '12369444', name: 'Laufey', image_url: null, total_albuns: 1, total_faixas: 1, generos: 'Jazz pop' }] })]
  ]);
  api = freshApp({ cloud: true });
  assert.equal(await api.storage(), 'local', 'sem login, usa o navegador');
  await assert.rejects(PopReportCloud.signUp('Ocupado', 'a@x.com', 'senha1234'), /nome de usuário já está em uso/);
  await assert.rejects(PopReportCloud.signUp('Ana', 'dup@x.com', 'senha1234'), /e-mail já tem uma conta/);
  await assert.rejects(PopReportCloud.signUp('Ana', 'a@x.com', 'curta'), /8 a 72/);
  await assert.rejects(PopReportCloud.signUp('Ana', 'invalido', 'senha1234'), /E-mail inválido/);
  await PopReportCloud.signIn('a@x.com', 'senha1234');
  api = freshApp({ cloud: true }); // recarrega: a sessão fica guardada no navegador
  await globalThis.PopReportCloud.signIn('a@x.com', 'senha1234');
  assert.equal(await api.storage(), 'cloud');
  await post(api, '/api/collection', { action: 'playlist', name: 'Tardes de jazz', description: 'Calmas' });
  await post(api, '/api/playlist-tracks', { playlistId: 7, track: payload });
  const rpc = db.rpc[0];
  assert.equal(rpc.p_playlist_id, 7);
  assert.equal(rpc.p.trackId, '111');
  assert.equal(rpc.p.artist, 'Laufey');
  assert.equal(rpc.p.album, 'Everything I Know About Love');
  const rpcCall = calls.filter(c => c.url.pathname.endsWith('/rpc/add_track_to_playlist')).at(-1);
  assert.equal(rpcCall.init.headers.Authorization, 'Bearer jwt-1');
  assert.equal(rpcCall.init.headers.apikey, 'sb_publishable_test');
  collection = await api.request('/api/collection');
  assert.deepEqual(collection.playlists[0], { id: 7, name: 'Tardes de jazz', description: 'Calmas', songIds: [55], trackKeys: ['deezer:111'], totalTracks: 1, totalArtists: 1, durationMs: 170000 });
  assert.deepEqual(await api.request('/api/catalogo'), [{ id: '12369444', source: 'deezer', name: 'Laufey', image: '', albums: 1, tracks: 1, genres: 'Jazz pop' }]);
  const cloudSongs = await api.request('/api/lista');
  assert.deepEqual(cloudSongs.map(s => [s.id, s.track, s.artist, s.album, s.duration, s.source, s.externalId]), [[55, 'From the Start', 'Laufey', 'Everything I Know About Love', 170, 'deezer', '111']]);
  await post(api, '/api/collection', { action: 'removeTrack', playlistId: 7, trackId: 55 });
  const removal = calls.filter(c => c.url.pathname === '/rest/v1/playlist_tracks' && c.init.method === 'DELETE').at(-1);
  assert.equal(removal.url.search, '?playlist_id=eq.7&track_id=eq.55');
  await post(api, '/api/collection', { action: 'deletePlaylist', playlistId: 7 });
  assert.ok(calls.some(c => c.url.pathname === '/rest/v1/playlists' && c.url.search === '?id=eq.7' && c.init.method === 'DELETE'));
  console.log('PASS: Supabase — login por e-mail, criação de playlist, RPC de inclusão e leitura da coleção');

  // ---- importação das playlists criadas sem login ----
  localStorage.setItem('popreport.collection.v1', JSON.stringify({ profile: { name: 'Visitante' }, playlists: [{ id: 'l1', name: 'Tardes de jazz', description: '', songIds: ['deezer:111', 'velha'] }] }));
  localStorage.setItem('popreport.saved.v1', JSON.stringify([
    { id: 'deezer:111', source: 'deezer', externalId: '111', albumId: '9', artistId: '12369444', artist: 'Laufey', track: 'From the Start', album: 'Everything', image: 'https://cdn.test/e.jpg', duration: 170, url: '' },
    { id: 'velha', source: 'deezer', externalId: '5', artistId: '1', artist: 'X', track: 'Antiga', album: 'Y', image: '', duration: 10, url: '' }
  ]));
  const rpcBefore = db.rpc.length;
  assert.deepEqual(await api.importLocal(), { playlists: 1, tracks: 1, skipped: 1 });
  assert.equal(db.rpc.length, rpcBefore + 1);
  assert.equal(db.rpc.at(-1).p.albumId, '9');
  assert.equal(localStorage.getItem('popreport.collection.v1'), null, 'dados locais saem do navegador após importar');
  assert.deepEqual(await api.importLocal(), { playlists: 0, tracks: 0, skipped: 0 }, 'sem nada local, não faz nada');
  console.log('PASS: playlists criadas sem login são levadas para a conta ao entrar');

  // ---- Login anônimo desativado: volta ao armazenamento do navegador ----
  globalThis.fetch = fakeFetch([[(u) => u.pathname === '/auth/v1/token', () => ({ status: 400, body: { msg: 'Invalid login credentials' } })]]);
  api = freshApp({ cloud: true });
  await assert.rejects(PopReportCloud.signIn('a@x.com', 'errada123'), /incorretos/);
  assert.equal(await api.storage(), 'local');
  console.log('PASS: cadastro (nome/e-mail únicos) e login; sem login o app usa o navegador');
  console.log('Todos os testes unitários passaram.');
})().catch(error => { console.error(error); process.exitCode = 1; });
