const form = document.getElementById('musicForm');
const message = document.getElementById('formMessage');
const preview = document.getElementById('songPreview');
const previewName = document.getElementById('previewName');
const previewFrame = document.getElementById('previewFrame');

form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const label = button.querySelector('span:first-child');
  const payload = {
    artist: document.getElementById('artist').value.trim(),
    track: document.getElementById('track').value.trim(),
    spotifyUrl: document.getElementById('spotifyUrl').value.trim(),
    album: document.getElementById('album').value.trim(),
    genre: document.getElementById('genre').value.trim(),
    playlistId: document.getElementById('playlistChoice').value || null
  };

  message.textContent = '';
  message.className = 'form-message';
  preview.hidden = true;

  if (!payload.artist || !payload.track || !payload.spotifyUrl) {
    message.textContent = 'Preencha os três campos antes de salvar.';
    message.classList.add('error');
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

    message.textContent = 'Música salva na sua coleção.';
    message.classList.add('success');
    previewName.textContent = `${data.track} — ${data.artist}${data.album ? ` • ${data.album}` : ''}`;
    previewFrame.src = data.embedUrl;
    preview.hidden = false;
    preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    message.textContent = error instanceof TypeError ? 'Não foi possível salvar a música. Tente novamente.' : error.message;
    message.classList.add('error');
  } finally {
    button.disabled = false;
    label.textContent = 'Salvar música';
  }
});
