(function (root) {
  'use strict';
  const staticMode = root.POPREPORT_MODE === 'static';
  const storageKey = 'popreport.saved.v1';
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
    if (url.pathname === '/api/lista') {
      if (options.method !== 'POST') return storedSongs();
      let input;
      try { input = JSON.parse(options.body); } catch { throw new Error('Não foi possível ler os dados enviados.'); }
      const artist = String(input?.artist || '').trim(), track = String(input?.track || '').trim();
      const parsed = spotifyLink(input?.spotifyUrl);
      if (!artist || !track || artist.length > 120 || track.length > 180 || parsed?.type !== 'track') throw new Error('Preencha artista, música e um link válido de faixa do Spotify.');
      const songs = storedSongs();
      const item = { id: parsed.id, spotifyId: parsed.id, artist, track, spotifyUrl: parsed.canonical, embedUrl: `https://open.spotify.com/embed/track/${parsed.id}`, createdAt: new Date().toISOString() };
      const next = [item, ...songs.filter(song => song.spotifyId !== parsed.id)].slice(0, 500);
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { throw new Error('Não foi possível salvar neste navegador. Verifique se o armazenamento está permitido.'); }
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
