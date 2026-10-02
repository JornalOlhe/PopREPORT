(function (root) {
  'use strict';
  const staticMode = root.POPREPORT_MODE === 'static';
  const storageKey = 'popreport.saved.v1';
  const collectionKey = 'popreport.collection.v1';
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
  function storedSongs() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (!Array.isArray(value)) return [];
      return value.filter(song => song && typeof song.artist === 'string' && typeof song.track === 'string' && spotifyLink(song.spotifyUrl)?.type === 'track').slice(0, 500);
    } catch { throw new Error('Não foi possível acessar suas músicas neste navegador. Verifique se o armazenamento está permitido.'); }
  }
  async function staticRequest(raw, options) {
    const url = new URL(raw, location.origin);
    const match = url.pathname.match(/^\/api\/music\/(artist|album|track)\/(\d{1,16})$/);
    if (url.pathname === '/api/music/search') {
      const q = (url.searchParams.get('q') || '').trim();
      const filter = url.searchParams.get('filter') || 'all';
      const offset = Number(url.searchParams.get('offset') || 0);
      if (q.length < 2 || q.length > 100 || !['all','artist','album','track'].includes(filter) || !Number.isInteger(offset) || offset < 0 || offset > 1000) throw new Error('Digite de 2 a 100 caracteres para buscar.');
      return root.PopReportMusic.search(q, filter, offset);
    }
    if (match) {
      const offset = Number(url.searchParams.get('offset') || 0);
      if (!Number.isInteger(offset) || offset < 0 || offset > 1000) throw new Error('Página inválida.');
      return root.PopReportMusic.detail(match[1], match[2], offset);
    }
    if (/^\/api\/resolve\/(artist|album|track)\/\d{1,16}$/.test(url.pathname)) return { spotifyUrl: null };
    if (url.pathname === '/api/embed') {
      const parsed = spotifyLink(url.searchParams.get('url'));
      if (!parsed) throw new Error('Cole um link de artista, álbum ou faixa do Spotify.');
      return { url: `https://open.spotify.com/embed/${parsed.type}/${parsed.id}`, canonical: parsed.canonical };
    }
    if (url.pathname === '/api/collection') {
      const data = collectionData();
      if (options.method !== 'POST') return data;
      let input;
      try { input = JSON.parse(options.body); } catch { throw new Error('Dados inválidos.'); }
      const name = String(input?.name || '').trim();
      if (!name || name.length > (input?.action === 'profile' ? 100 : 120)) throw new Error('Preencha um nome dentro do limite permitido.');
      if (input.action === 'profile') data.profile.name = name;
      else if (input.action === 'playlist') {
        const description = String(input.description || '').trim();
        if (description.length > 300 || data.playlists.length >= 100) throw new Error('Limite da coleção atingido.');
        if (data.playlists.some(p => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('Você já tem uma playlist com esse nome.');
        data.playlists.push({ id: crypto.randomUUID(), name, description, songIds: [] });
      } else throw new Error('Ação inválida.');
      saveCollection(data); return data;
    }
    if (url.pathname === '/api/lista') {
      if (options.method !== 'POST') return storedSongs();
      let input;
      try { input = JSON.parse(options.body); } catch { throw new Error('Não foi possível ler os dados enviados.'); }
      const artist = String(input?.artist || '').trim(), track = String(input?.track || '').trim();
      const parsed = spotifyLink(input?.spotifyUrl);
      if (!artist || !track || artist.length > 120 || track.length > 180 || parsed?.type !== 'track') throw new Error('Preencha artista, música e um link válido de faixa do Spotify.');
      const album = String(input.album || '').trim(), genre = String(input.genre || '').trim();
      if (album.length > 180 || genre.length > 80) throw new Error('Álbum ou gênero ultrapassou o limite permitido.');
      const collection = collectionData();
      const playlist = input.playlistId ? collection.playlists.find(p => p.id === input.playlistId) : null;
      if (input.playlistId && !playlist) throw new Error('Escolha uma playlist da sua coleção.');
      const songs = storedSongs();
      const existing = songs.find(song => song.spotifyId === parsed.id);
      const item = { ...existing, id: parsed.id, spotifyId: parsed.id, artist, track, album: album || existing?.album || '', genre: genre || existing?.genre || '', spotifyUrl: parsed.canonical, embedUrl: `https://open.spotify.com/embed/track/${parsed.id}`, createdAt: existing?.createdAt || new Date().toISOString() };
      const next = [item, ...songs.filter(song => song.spotifyId !== parsed.id)].slice(0, 500);
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { throw new Error('Não foi possível salvar neste navegador. Verifique se o armazenamento está permitido.'); }
      if (playlist && !playlist.songIds.includes(parsed.id)) { playlist.songIds.push(parsed.id); saveCollection(collection); }
      return item;
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
  root.PopReportAPI = { request, staticMode };
  if (staticMode) document.addEventListener('DOMContentLoaded', () => {
    for (const note of document.querySelectorAll('[data-online-note]')) note.hidden = false;
  });
})(globalThis);
