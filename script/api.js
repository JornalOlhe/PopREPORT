(function (root) {
  'use strict';
  const staticMode = root.POPREPORT_MODE === 'static';
  const storageKey = 'popreport.saved.v1';
  const collectionKey = 'popreport.collection.v1';
  const idPattern = /^[A-Za-z0-9]{1,32}$/;

  // ---------- Armazenamento local (reserva quando o banco online não está ativo) ----------
  function collectionData() {
    try {
      const data = JSON.parse(localStorage.getItem(collectionKey) || 'null');
      if (data && typeof data.profile?.name === 'string' && Array.isArray(data.playlists)) return data;
      return { profile: { name: 'Visitante' }, playlists: [] };
    } catch { throw new Error('Não foi possível acessar sua coleção neste navegador.'); }
  }
  function saveCollection(data) {
    try { localStorage.setItem(collectionKey, JSON.stringify(data)); }
    catch { throw new Error('Não foi possível salvar neste navegador.'); }
  }
  function storedSongs() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return Array.isArray(value) ? value.filter(s => s && typeof s.id === 'string' && typeof s.artist === 'string' && typeof s.track === 'string').slice(0, 500) : [];
    } catch { throw new Error('Não foi possível acessar suas músicas neste navegador. Verifique se o armazenamento está permitido.'); }
  }
  const keyOf = id => (String(id).includes(':') ? String(id) : `spotify:${id}`);
  const localKeys = playlist => playlist.songIds.map(keyOf);

  function validTrack(input) {
    const t = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const text = (v, max) => String(v ?? '').trim().slice(0, max);
    const out = {
      source: t.source, trackId: String(t.trackId ?? ''), track: text(t.track, 200), artistId: String(t.artistId ?? ''), artist: text(t.artist, 160),
      albumId: String(t.albumId ?? ''), album: text(t.album, 200), image: text(t.image, 500), artistImage: text(t.artistImage, 500),
      releaseDate: /^\d{4}(-\d{2}(-\d{2})?)?$/.test(String(t.releaseDate || '')) ? String(t.releaseDate) : '', url: text(t.url, 500),
      durationMs: Math.max(0, Math.min(7200000, Math.round(Number(t.durationMs) || 0))), explicit: Boolean(t.explicit),
      trackNumber: Math.max(0, Math.min(999, Math.round(Number(t.trackNumber) || 1)))
    };
    if (!['deezer', 'spotify'].includes(out.source) || !out.track || !out.artist || !out.album) throw new Error('Dados da música incompletos.');
    if (![out.trackId, out.artistId, out.albumId].every(v => idPattern.test(v))) throw new Error('Identificação da música inválida.');
    for (const key of ['image', 'artistImage', 'url']) if (out[key] && !/^https:\/\//.test(out[key])) out[key] = '';
    return out;
  }
  const localStore = {
    async collection() { const data = collectionData(); return { ...data, playlists: data.playlists.map(p => ({ ...p, trackKeys: localKeys(p) })) }; },
    async profile(name) { const data = collectionData(); data.profile.name = name; saveCollection(data); },
    async playlist(name, description) {
      const data = collectionData();
      if (data.playlists.length >= 100) throw new Error('Limite da coleção atingido.');
      if (data.playlists.some(p => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('Você já tem uma playlist com esse nome.');
      data.playlists.push({ id: crypto.randomUUID(), name, description, songIds: [] });
      saveCollection(data);
    },
    async songs() { return storedSongs(); },
    async add(playlistId, track) {
      const data = collectionData();
      const playlist = data.playlists.find(p => String(p.id) === String(playlistId));
      if (!playlist) throw new Error('Escolha uma playlist da sua coleção.');
      if (playlist.songIds.length >= 500) throw new Error('Esta playlist atingiu o limite de 500 músicas.');
      const id = track.source === 'spotify' ? track.trackId : `${track.source}:${track.trackId}`;
      const existing = storedSongs().find(s => s.id === id);
      const item = { ...existing, id, source: track.source, externalId: track.trackId, artistId: track.artistId, artist: track.artist, track: track.track, album: track.album, image: track.image, duration: Math.round(track.durationMs / 1000), url: track.url, genre: existing?.genre || '', createdAt: existing?.createdAt || new Date().toISOString() };
      try { localStorage.setItem(storageKey, JSON.stringify([item, ...storedSongs().filter(s => s.id !== id)].slice(0, 500))); }
      catch { throw new Error('Não foi possível salvar neste navegador. Verifique se o armazenamento está permitido.'); }
      if (!playlist.songIds.includes(id)) { playlist.songIds.push(id); saveCollection(data); }
    }
  };
  const cloudStore = {
    collection: () => root.PopReportCloud.collection(),
    profile: name => root.PopReportCloud.saveProfile(name),
    playlist: (name, description) => root.PopReportCloud.createPlaylist(name, description),
    songs: () => root.PopReportCloud.songs(),
    add: (playlistId, track) => root.PopReportCloud.addTrack(playlistId, track)
  };
  let storePromise;
  function store() {
    storePromise ||= (async () => (root.PopReportCloud && await root.PopReportCloud.ready() ? { kind: 'cloud', ...cloudStore } : { kind: 'local', ...localStore }))();
    return storePromise;
  }

  function spotifyLink(raw) {
    try {
      const url = new URL(String(raw || '').trim());
      if (url.protocol !== 'https:' || !['open.spotify.com', 'www.open.spotify.com'].includes(url.hostname)) return null;
      const parts = url.pathname.split('/').filter(Boolean);
      if (/^intl-[a-z-]+$/.test(parts[0])) parts.shift();
      if (parts.length !== 2 || !['artist', 'album', 'track'].includes(parts[0]) || !/^[A-Za-z0-9]{22}$/.test(parts[1])) return null;
      return { type: parts[0], id: parts[1], canonical: `https://open.spotify.com/${parts[0]}/${parts[1]}` };
    } catch { return null; }
  }
  const pageOffset = url => {
    const offset = Number(url.searchParams.get('offset') || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 1000) throw new Error('Página inválida.');
    return offset;
  };
  async function staticRequest(raw, options) {
    const url = new URL(raw, location.origin);
    const albums = url.pathname.match(/^\/api\/music\/artist\/(\d{1,16})\/albums$/);
    const match = url.pathname.match(/^\/api\/music\/(artist|album|track)\/(\d{1,16})$/);
    if (url.pathname === '/api/music/search') {
      const q = (url.searchParams.get('q') || '').trim();
      const filter = url.searchParams.get('filter') || 'all';
      const offset = Number(url.searchParams.get('offset') || 0);
      if (q.length < 2 || q.length > 100 || !['all', 'artist', 'album', 'track'].includes(filter) || !Number.isInteger(offset) || offset < 0 || offset > 1000) throw new Error('Digite de 2 a 100 caracteres para buscar.');
      return root.PopReportMusic.search(q, filter, offset);
    }
    if (albums) return { albums: await root.PopReportMusic.discography(albums[1]), source: 'Deezer' };
    if (match) return root.PopReportMusic.detail(match[1], match[2], pageOffset(url));
    if (/^\/api\/resolve\/(artist|album|track)\/\d{1,16}$/.test(url.pathname)) return { spotifyUrl: null };
    if (url.pathname === '/api/embed') {
      const parsed = spotifyLink(url.searchParams.get('url'));
      if (!parsed) throw new Error('Link de artista, álbum ou faixa do Spotify inválido.');
      return { url: `https://open.spotify.com/embed/${parsed.type}/${parsed.id}`, canonical: parsed.canonical };
    }
    if (url.pathname === '/api/collection') {
      const db = await store();
      if (options.method === 'POST') {
        let input;
        try { input = JSON.parse(options.body); } catch { throw new Error('Dados inválidos.'); }
        const name = String(input?.name || '').trim();
        if (!name || name.length > (input?.action === 'profile' ? 100 : 120)) throw new Error('Preencha um nome dentro do limite permitido.');
        if (input.action === 'profile') await db.profile(name);
        else if (input.action === 'playlist') {
          const description = String(input.description || '').trim();
          if (description.length > 300) throw new Error('Use até 300 caracteres na descrição.');
          await db.playlist(name, description);
        } else throw new Error('Ação inválida.');
      }
      return db.collection();
    }
    if (url.pathname === '/api/lista') return (await store()).songs();
    if (url.pathname === '/api/playlist-tracks' && options.method === 'POST') {
      let input;
      try { input = JSON.parse(options.body); } catch { throw new Error('Não foi possível ler os dados enviados.'); }
      const track = validTrack(input?.track);
      await (await store()).add(input?.playlistId, track);
      return { ok: true, key: `${track.source}:${track.trackId}` };
    }
    throw new Error('Este conteúdo não está disponível.');
  }
  async function request(url, options = {}) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (staticMode) return staticRequest(url, options);
    const response = await fetch(url, options);
    let data;
    try { data = await response.json(); } catch { throw new Error('Não foi possível carregar este conteúdo. Tente novamente.'); }
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir esta ação. Tente novamente.');
    return data;
  }
  root.PopReportAPI = { request, staticMode, storage: () => (staticMode ? store().then(s => s.kind) : Promise.resolve('server')) };
  if (staticMode && typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', async () => {
    const kind = await root.PopReportAPI.storage();
    for (const note of document.querySelectorAll('[data-online-note]')) {
      note.textContent = kind === 'cloud'
        ? 'Suas playlists ficam no banco online do PopReport, ligadas a este navegador. Limpar os dados do site cria um novo perfil.'
        : 'Suas playlists ficam salvas neste navegador. O banco online ainda não está ativo; limpar os dados do site remove a coleção.';
      note.hidden = false;
    }
  });
})(globalThis);
