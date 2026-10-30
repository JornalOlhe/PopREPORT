const form = document.getElementById('musicForm');
const message = document.getElementById('formMessage');
const preview = document.getElementById('songPreview');
const previewName = document.getElementById('previewName');
const previewFrame = document.getElementById('previewFrame');
const spotifyInput = document.getElementById('spotifyUrl');
const identified = document.getElementById('identified');
const trackLink = /^https:\/\/(?:www\.)?open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/[A-Za-z0-9]{22}/;
let identifyTimer;
let metadataVersion = 0;

function setMessage(text, type = '') {
  message.textContent = text;
  message.className = 'form-message';
  if (type) message.classList.add(type);
}

async function hydrateFromSpotify() {
  const spotifyUrl = spotifyInput.value.trim();
  if (!spotifyUrl) return;
  const version = ++metadataVersion;
  form.setAttribute('aria-busy', 'true');
  setMessage('Identificando a música…');
  identified.className = 'identified loading';
  identified.innerHTML = '<span class="thumb"></span><div><span></span><span></span></div>';
  identified.hidden = false;
  try {
    const data = await PopReportAPI.request('/api/spotify/track?url=' + encodeURIComponent(spotifyUrl));
    if (version !== metadataVersion) return;
    for (const [id, value] of [['artist', data.artist], ['track', data.track], ['album', data.album], ['genre', data.genre]]) {
      if (value) document.getElementById(id).value = value;
    }
    const chips = String(data.genre || '').split(',').map(g => g.trim()).filter(Boolean).map(g => `<em>${esc(g)}</em>`).join('');
    identified.className = 'identified';
    identified.innerHTML = `<img src="${esc(safeUrl(data.image) || 'Imagens/fallback.svg')}" alt="" width="64" height="64"><div><strong>${esc(data.track)}</strong><span>${esc([data.artist, data.album].filter(Boolean).join(' · ') || 'Complete os campos abaixo')}</span><div class="chips">${chips}</div></div><b class="badge">${data.verified ? 'Identificado' : 'Sugestão'}</b>`;
    const missing = [!data.artist && 'artista', !data.album && 'álbum', !data.genre && 'gênero'].filter(Boolean);
    if (missing.length) setMessage(`Preenchi o que encontrei. Complete: ${missing.join(', ')}.`, 'success');
    else if (data.verified) setMessage(`Artista, álbum e gênero preenchidos (${data.source}).`, 'success');
    else setMessage(`Sugestão do ${data.source}. Confira o artista antes de salvar.`, 'success');
  } catch (error) {
    if (version !== metadataVersion) return;
    identified.hidden = true;
    setMessage(error.message || 'Não foi possível preencher automaticamente. Você ainda pode salvar preenchendo os campos.', 'error');
  } finally {
    if (version === metadataVersion) form.removeAttribute('aria-busy');
  }
}

spotifyInput.addEventListener('input', () => {
  metadataVersion++;
  clearTimeout(identifyTimer);
  if (!trackLink.test(spotifyInput.value.trim())) { identified.hidden = true; return; }
  identifyTimer = setTimeout(hydrateFromSpotify, 400);
});
spotifyInput.addEventListener('change', () => { clearTimeout(identifyTimer); if (trackLink.test(spotifyInput.value.trim())) hydrateFromSpotify(); });

form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const label = button.querySelector('span:first-child');
  const payload = {
    artist: document.getElementById('artist').value.trim(),
    track: document.getElementById('track').value.trim(),
    spotifyUrl: spotifyInput.value.trim(),
    album: document.getElementById('album').value.trim(),
    genre: document.getElementById('genre').value.trim(),
    playlistId: document.getElementById('playlistChoice').value || null
  };

  setMessage('');
  preview.hidden = true;

  if (!payload.artist || !payload.track || !payload.spotifyUrl) {
    setMessage('Preencha artista, música e o link da faixa no Spotify.', 'error');
    return;
  }

  button.disabled = true;
  label.textContent = 'Salvando música…';

  try {
    const data = await PopReportAPI.request('/api/lista', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    setMessage('Música salva na sua coleção.', 'success');
    toast('Música salva na sua coleção');
    previewName.textContent = `${data.track} — ${data.artist}${data.album ? ` • ${data.album}` : ''}`;
    previewFrame.src = data.embedUrl;
    preview.hidden = false;
    preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    setMessage(error instanceof TypeError ? 'Não foi possível salvar a música. Tente novamente.' : error.message, 'error');
  } finally {
    button.disabled = false;
    label.textContent = 'Salvar música';
  }
});
