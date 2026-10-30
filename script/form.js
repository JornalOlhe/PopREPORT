// Criar playlist e adicionar músicas: playlist → artista → álbum → faixas (+).
// Depende dos auxiliares globais de app.js ($, esc, photo, safeUrl, playIcon) e de PopReportAPI.
(function () {
  'use strict';
  const pauseIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
  const plusIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>';
  const checkIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 16.2-3.7-3.7L4.4 14l5.1 5.1L20 8.6l-1.4-1.4z"/></svg>';
  const send = (url, body) => PopReportAPI.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const fmt = s => (Number(s) > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');
  const say = (el, text, kind = '') => { el.textContent = text; el.classList.toggle('error', kind === 'error'); el.classList.toggle('success', kind === 'success'); };

  const B = { playlists: [], activeId: null, artist: null, albums: [], dir: 'desc', album: null, tracks: [], keys: new Set(), adding: new Set(), queue: false, playing: -1 };
  const versions = { search: 0, albums: 0, album: 0 };
  const artistsById = new Map();
  const audio = new Audio();
  audio.preload = 'none';

  const active = () => B.playlists.find(p => String(p.id) === String(B.activeId));
  const reveal = el => { el.hidden = false; el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); };

  function renderSteps() {
    const stage = !B.activeId ? 'playlist' : !B.artist ? 'artist' : !B.album ? 'album' : 'tracks';
    const order = ['playlist', 'artist', 'album', 'tracks'];
    document.querySelectorAll('#builderSteps li').forEach(li => {
      const index = order.indexOf(li.dataset.step);
      li.classList.toggle('is-current', li.dataset.step === stage);
      li.classList.toggle('is-done', index < order.indexOf(stage));
      if (li.dataset.step === stage) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    $('#stepArtist').hidden = !B.activeId;
    $('#stepAlbums').hidden = !B.artist;
    $('#stepTracks').hidden = !B.album;
  }

  // ---------- 1 · Playlist ----------
  function renderPicker() {
    const picker = $('#playlistPicker');
    picker.hidden = !B.playlists.length;
    picker.innerHTML = B.playlists.map((p, i) => `<button type="button" class="chip" role="radio" aria-checked="${String(p.id) === String(B.activeId)}" data-playlist="${i}">${esc(p.name)} <span>${(p.trackKeys || []).length}</span></button>`).join('');
    $('#activePlaylistName').textContent = active()?.name || '';
    B.keys = new Set(active()?.trackKeys || []);
  }
  async function refresh() {
    const data = await PopReportAPI.request('/api/collection');
    B.playlists = data.playlists || [];
    if (!active()) B.activeId = B.playlists.length ? B.playlists[B.playlists.length - 1].id : null;
    renderPicker();
    renderSteps();
  }
  $('#playlistPicker').addEventListener('click', e => {
    const chip = e.target.closest('[data-playlist]');
    if (!chip) return;
    B.activeId = B.playlists[Number(chip.dataset.playlist)].id;
    renderPicker();
    renderTracks();
    renderSteps();
  });
  $('#newPlaylistForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const message = $('#newPlaylistMessage');
    const button = form.querySelector('button');
    const name = $('#newPlaylistName').value.trim();
    button.disabled = true;
    say(message, 'Criando playlist…');
    try {
      await send('/api/collection', { action: 'playlist', name, description: $('#newPlaylistDescription').value.trim() });
      await refresh();
      B.activeId = B.playlists.find(p => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())?.id ?? B.activeId;
      renderPicker();
      renderSteps();
      form.reset();
      say(message, `Playlist “${name}” criada. Agora escolha o artista.`, 'success');
      reveal($('#stepArtist'));
      $('#artistQuery').focus({ preventScroll: true });
    } catch (error) { say(message, error.message, 'error'); }
    finally { button.disabled = false; }
  });

  // ---------- 2 · Artista ----------
  const artistCard = a => `<article class="card"><button type="button" class="card-pick" data-artist="${esc(a.id)}">${photo(a, true)}<h3>${esc(a.name)}</h3></button><p>${a.source === 'spotify' ? 'Spotify' : 'Deezer'} · Ver álbuns</p></article>`;
  $('#artistSearchForm').addEventListener('submit', async e => {
    e.preventDefault();
    const q = $('#artistQuery').value.trim();
    const status = $('#artistStatusMsg');
    const version = ++versions.search;
    if (q.length < 2) return say(status, 'Digite pelo menos 2 caracteres.', 'error');
    say(status, 'Buscando artistas…');
    $('#artistResults').setAttribute('aria-busy', 'true');
    try {
      const data = await PopReportAPI.request('/api/music/search?' + new URLSearchParams({ q, filter: 'artist', offset: 0 }));
      if (version !== versions.search) return;
      artistsById.clear();
      data.artists.forEach(a => artistsById.set(String(a.id), a));
      $('#artistResults').innerHTML = data.artists.map(artistCard).join('');
      say(status, data.artists.length ? `${data.artists.length} artistas para “${q}”. Escolha um.` : 'Nenhum artista encontrado. Tente outro nome.');
    } catch (error) { if (version === versions.search) say(status, error.message, 'error'); }
    finally { if (version === versions.search) $('#artistResults').setAttribute('aria-busy', 'false'); }
  });
  $('#artistResults').addEventListener('click', e => {
    const pick = e.target.closest('[data-artist]');
    if (pick && artistsById.has(pick.dataset.artist)) chooseArtist(artistsById.get(pick.dataset.artist));
  });
  $('#changeArtist').addEventListener('click', () => {
    stopAudio();
    B.artist = null; B.album = null; B.albums = []; B.tracks = [];
    renderSteps();
    reveal($('#stepArtist'));
    $('#artistQuery').focus({ preventScroll: true });
  });

  // ---------- 3 · Álbuns (por data de lançamento) ----------
  const albumMeta = a => [a.releaseDate ? a.releaseDate.slice(0, 4) : '', ({ single: 'Single', ep: 'EP', album: 'Álbum' })[String(a.recordType).toLowerCase()] || '', a.totalTracks ? `${a.totalTracks} faixa${a.totalTracks === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  const albumCard = (a, i) => `<article class="card"><button type="button" class="card-pick" data-album="${i}">${photo(a)}<h3>${esc(a.name)}</h3></button><p>${esc(albumMeta(a))}</p></article>`;
  const skeletons = n => Array.from({ length: n }, () => '<div class="card skeleton" aria-hidden="true"><div class="cover"></div><h3>&nbsp;</h3></div>').join('');
  function renderAlbums() {
    const list = PopReportMusic.sortByRelease(B.albums, B.dir);
    B.shown = list;
    $('#albumGrid').innerHTML = list.map(albumCard).join('');
    $('#sortAlbums').textContent = B.dir === 'desc' ? 'Mais recentes primeiro' : 'Mais antigos primeiro';
    $('#sortAlbums').setAttribute('aria-pressed', String(B.dir === 'asc'));
  }
  async function chooseArtist(artist) {
    stopAudio();
    B.artist = artist; B.album = null; B.tracks = []; B.albums = [];
    const version = ++versions.albums;
    $('#pickedArtist').innerHTML = `${photo(artist, true)}<div><p class="hint">Artista</p><strong>${esc(artist.name)}</strong></div>`;
    $('#albumGrid').innerHTML = skeletons(8);
    say($('#albumsStatus'), 'Carregando álbuns…');
    renderSteps();
    reveal($('#stepAlbums'));
    try {
      const data = await PopReportAPI.request(`/api/music/artist/${encodeURIComponent(artist.id)}/albums`);
      if (version !== versions.albums) return;
      B.albums = data.albums;
      renderAlbums();
      say($('#albumsStatus'), data.albums.length ? `${data.albums.length} lançamentos, do mais recente ao mais antigo. Escolha um para ver as faixas.` : 'Nenhum lançamento disponível para este artista.');
    } catch (error) { if (version === versions.albums) { $('#albumGrid').replaceChildren(); say($('#albumsStatus'), error.message, 'error'); } }
  }
  $('#sortAlbums').addEventListener('click', () => { B.dir = B.dir === 'desc' ? 'asc' : 'desc'; renderAlbums(); });
  $('#albumGrid').addEventListener('click', e => {
    const pick = e.target.closest('[data-album]');
    if (pick && B.shown?.[Number(pick.dataset.album)]) chooseAlbum(B.shown[Number(pick.dataset.album)]);
  });

  // ---------- 4 · Faixas (prévia + botão +) ----------
  function stopAudio() { audio.pause(); audio.removeAttribute('src'); B.playing = -1; B.queue = false; markPlaying(); }
  function markPlaying() {
    document.querySelectorAll('#trackList .track').forEach((el, i) => {
      const on = i === B.playing;
      el.classList.toggle('is-playing', on);
      const btn = el.querySelector('[data-preview]');
      if (btn) { btn.innerHTML = on ? pauseIcon : playIcon; btn.setAttribute('aria-label', `${on ? 'Pausar' : 'Ouvir prévia de'} ${B.tracks[i].name}`); }
    });
    const albumBtn = $('#playAlbum');
    if (albumBtn) albumBtn.textContent = B.queue && B.playing >= 0 ? 'Pausar prévia do álbum' : 'Ouvir prévia do álbum';
  }
  function playIndex(i, queue = false) {
    const track = B.tracks[i];
    if (!track?.previewUrl) { say($('#tracksStatus'), `Prévia indisponível para “${track?.name || 'esta faixa'}”. Você ainda pode adicioná-la com o +.`); return false; }
    if (B.playing === i && !audio.paused) { audio.pause(); B.playing = -1; B.queue = false; markPlaying(); return true; }
    B.playing = i; B.queue = queue;
    audio.src = safeUrl(track.previewUrl);
    audio.play().catch(() => { say($('#tracksStatus'), 'Não foi possível tocar a prévia agora.', 'error'); B.playing = -1; markPlaying(); });
    markPlaying();
    return true;
  }
  audio.addEventListener('ended', () => {
    const next = B.queue ? B.tracks.findIndex((t, i) => i > B.playing && t.previewUrl) : -1;
    if (next >= 0) playIndex(next, true); else { B.playing = -1; B.queue = false; markPlaying(); }
  });
  audio.addEventListener('error', () => { if (B.playing >= 0) { say($('#tracksStatus'), 'A prévia desta faixa não pôde ser carregada.', 'error'); B.playing = -1; B.queue = false; markPlaying(); } });

  const keyOf = t => `${t.source}:${t.id}`;
  function trackRow(t, i) {
    const added = B.keys.has(keyOf(t));
    return `<article class="track" style="--i:${Math.min(i, 14)}"><span class="number">${t.trackNumber || i + 1}</span><div class="track-info"><strong>${esc(t.name)}</strong><small>${esc([fmt(t.duration), t.explicit ? 'Explícita' : '', t.previewUrl ? '' : 'Sem prévia'].filter(Boolean).join(' · '))}</small></div><button type="button" class="play" data-preview="${i}" aria-label="Ouvir prévia de ${esc(t.name)}" ${t.previewUrl ? '' : 'disabled'}>${playIcon}</button><button type="button" class="add-btn${added ? ' is-added' : ''}" data-add="${i}" aria-label="${added ? `${esc(t.name)} já está em ${esc(active()?.name || 'a playlist')}` : `Adicionar ${esc(t.name)} a ${esc(active()?.name || 'a playlist')}`}" ${added ? 'disabled' : ''}>${added ? checkIcon : plusIcon}</button></article>`;
  }
  function renderTracks() {
    if (!B.album) return;
    $('#trackList').innerHTML = B.tracks.map(trackRow).join('');
    const pending = B.tracks.filter(t => !B.keys.has(keyOf(t))).length;
    $('#addAllTracks').disabled = !pending;
    $('#addAllTracks').textContent = pending ? `Adicionar todas (${pending})` : 'Todas já adicionadas';
    markPlaying();
  }
  async function chooseAlbum(album) {
    stopAudio();
    const version = ++versions.album;
    B.album = album; B.tracks = [];
    $('#albumPreview').innerHTML = `${photo(album)}<div><p class="hint">${esc(albumMeta(album))}</p><h3>${esc(album.name)}</h3><p>${esc(B.artist.name)}</p><button type="button" class="pill" id="playAlbum" disabled>Ouvir prévia do álbum</button><div id="albumEmbed"></div></div>`;
    $('#trackList').innerHTML = skeletons(0) + '<div class="skeleton line"></div><div class="skeleton line"></div><div class="skeleton line"></div>';
    say($('#tracksStatus'), 'Carregando faixas…');
    renderSteps();
    reveal($('#stepTracks'));
    try {
      const data = await PopReportAPI.request(`/api/music/album/${encodeURIComponent(album.id)}`);
      if (version !== versions.album) return;
      B.tracks = data.tracks.map(t => ({ ...t, source: t.source || album.source || B.artist.source || 'deezer' }));
      B.album = { ...album, ...data, tracks: undefined, image: data.image || album.image };
      renderTracks();
      const playable = B.tracks.some(t => t.previewUrl);
      const albumBtn = $('#playAlbum');
      albumBtn.disabled = !playable && !B.album.spotifyUrl;
      albumBtn.onclick = async () => {
        if (playable) { if (B.queue && B.playing >= 0) { audio.pause(); B.playing = -1; B.queue = false; markPlaying(); } else playIndex(B.tracks.findIndex(t => t.previewUrl), true); return; }
        try {
          const embed = await PopReportAPI.request('/api/embed?url=' + encodeURIComponent(B.album.spotifyUrl));
          $('#albumEmbed').innerHTML = `<iframe title="Prévia do álbum no Spotify" src="${esc(embed.url)}" height="152" allow="autoplay; encrypted-media" loading="lazy"></iframe>`;
        } catch (error) { say($('#tracksStatus'), error.message, 'error'); }
      };
      say($('#tracksStatus'), `${B.tracks.length} faixas. Use ▶ para ouvir a prévia e + para adicionar à playlist “${active()?.name || ''}”.`);
    } catch (error) { if (version === versions.album) { $('#trackList').replaceChildren(); say($('#tracksStatus'), error.message, 'error'); } }
  }
  $('#backToAlbums').addEventListener('click', () => { stopAudio(); B.album = null; B.tracks = []; renderSteps(); reveal($('#stepAlbums')); });

  function payload(t, i) {
    const artist = B.artist, album = B.album;
    return {
      source: t.source, trackId: String(t.id), track: t.name, durationMs: t.durationMs || Math.round(Number(t.duration || 0) * 1000), explicit: Boolean(t.explicit), trackNumber: t.trackNumber || i + 1, url: t.url || t.spotifyUrl || '',
      artistId: String(artist.id), artist: artist.name, artistImage: artist.image || '', albumId: String(album.id), album: album.name, image: album.image || '', releaseDate: album.releaseDate || ''
    };
  }
  async function addTrack(i) {
    const t = B.tracks[i], playlist = active();
    if (!t || !playlist || B.adding.has(i) || B.keys.has(keyOf(t))) return false;
    B.adding.add(i);
    const button = document.querySelector(`#trackList [data-add="${i}"]`);
    button?.classList.add('is-busy');
    if (button) button.disabled = true;
    try {
      await send('/api/playlist-tracks', { playlistId: playlist.id, track: payload(t, i) });
      B.keys.add(keyOf(t));
      playlist.trackKeys = [...B.keys];
      const fresh = document.querySelector(`#trackList [data-add="${i}"]`);
      if (fresh) { fresh.className = 'add-btn is-added just-added'; fresh.innerHTML = checkIcon; fresh.disabled = true; fresh.setAttribute('aria-label', `${t.name} já está em ${playlist.name}`); }
      renderPicker();
      say($('#tracksStatus'), `“${t.name}” adicionada a “${playlist.name}”.`, 'success');
      const pending = B.tracks.filter(x => !B.keys.has(keyOf(x))).length;
      $('#addAllTracks').disabled = !pending;
      $('#addAllTracks').textContent = pending ? `Adicionar todas (${pending})` : 'Todas já adicionadas';
      return true;
    } catch (error) {
      if (button) { button.disabled = false; button.classList.remove('is-busy'); }
      say($('#tracksStatus'), error instanceof TypeError ? 'Não foi possível salvar a música. Tente novamente.' : error.message, 'error');
      return false;
    } finally { B.adding.delete(i); }
  }
  $('#trackList').addEventListener('click', e => {
    const preview = e.target.closest('[data-preview]');
    if (preview) return void playIndex(Number(preview.dataset.preview));
    const add = e.target.closest('[data-add]');
    if (add) addTrack(Number(add.dataset.add));
  });
  $('#addAllTracks').addEventListener('click', async () => {
    const button = $('#addAllTracks');
    button.disabled = true;
    const todo = B.tracks.map((t, i) => i).filter(i => !B.keys.has(keyOf(B.tracks[i])));
    let done = 0;
    for (const i of todo) {
      say($('#tracksStatus'), `Adicionando ${done + 1} de ${todo.length}…`);
      if (!await addTrack(i)) { button.disabled = false; return; }
      done++;
    }
    say($('#tracksStatus'), `${done} faixa${done === 1 ? '' : 's'} adicionada${done === 1 ? '' : 's'} a “${active()?.name}”.`, 'success');
  });

  window.PopReportBuilder = {
    async open() {
      try { await refresh(); say($('#newPlaylistMessage'), B.playlists.length ? '' : 'Crie sua primeira playlist para liberar a busca de artistas.'); }
      catch (error) { say($('#newPlaylistMessage'), error.message, 'error'); }
      renderTracks();
    },
    close() { stopAudio(); }
  };
  if (history.state?.screen === 'form') PopReportBuilder.open();
})();
