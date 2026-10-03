const form = document.getElementById('musicForm');
const message = document.getElementById('formMessage');
const preview = document.getElementById('songPreview');
const previewName = document.getElementById('previewName');
const previewFrame = document.getElementById('previewFrame');
const spotifyInput = document.getElementById('spotifyUrl');
let metadataVersion = 0;

function setMessage(text, type = '') {
  message.textContent = text;
  message.className = 'form-message';
  if (type) message.classList.add(type);
}

async function hydrateFromSpotify() {
  const spotifyUrl = spotifyInput.value.trim();
  if (!spotifyUrl || PopReportAPI.staticMode) return;
  const version = ++metadataVersion;
  setMessage('Lendo os dados oficiais da faixa no Spotify…');
  try {
    const data = await PopReportAPI.request('/api/spotify/track?url=' + encodeURIComponent(spotifyUrl));
    if (version !== metadataVersion) return;
    document.getElementById('artist').value = data.artist || '';
    document.getElementById('track').value = data.track || '';
    document.getElementById('album').value = data.album || '';
    if (data.genre) document.getElementById('genre').value = data.genre;
    setMessage('Dados preenchidos diretamente pelo Spotify.', 'success');
  } catch (error) {
    if (version !== metadataVersion) return;
    setMessage(error.message || 'Não foi possível preencher automaticamente. Você ainda pode salvar preenchendo os campos.', 'error');
  }
}

spotifyInput.addEventListener('change', hydrateFromSpotify);
spotifyInput.addEventListener('paste', () => setTimeout(hydrateFromSpotify, 0));

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
