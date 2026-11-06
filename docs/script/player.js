'use strict';
document.addEventListener('click', e => { const button = e.target.closest('[data-play]'); if (button) openPlayer(items.get(button.dataset.play)); });

// Player do catálogo: toca a prévia da fonte musical quando existir e, senão, o player oficial do Spotify.
$('#playerRoot').innerHTML = `<dialog id="player" aria-labelledby="playerTitle"><button class="close" aria-label="Fechar player">×</button><h2 id="playerTitle">Ouvir no PopReport</h2><div id="embed"></div><p id="playerMessage" role="status"></p><a id="spotifySearch" class="source" target="_blank" rel="noopener">Abrir no Spotify</a></dialog>`;
let playerVersion = 0;
const dialog = $('#player');
dialog.querySelector('.close').onclick = () => dialog.close();
function stopMedia() {
  $('#embed').querySelector('audio')?.pause();
  $('#embed').replaceChildren();
}
dialog.addEventListener('close', () => { playerVersion++; stopMedia(); });

async function playPreview(link, version = playerVersion) {
  const src = safeUrl(link);
  if (!src || version !== playerVersion || !dialog.open) return false;
  stopMedia();
  const audio = document.createElement('audio');
  audio.controls = true;
  audio.autoplay = true;
  audio.preload = 'metadata';
  audio.src = src;
  audio.setAttribute('aria-label', 'Prévia da música');
  audio.addEventListener('error', () => {
    if (version === playerVersion) $('#playerMessage').textContent = 'A prévia desta faixa não pôde ser carregada. Abra no Spotify para ouvir.';
  }, { once: true });
  $('#embed').append(audio);
  $('#playerMessage').textContent = 'Tocando a prévia disponível desta faixa.';
  audio.play().catch(() => {});
  return true;
}

async function embedLink(link, version = playerVersion) {
  const data = await api('/api/embed?url=' + encodeURIComponent(link));
  if (version !== playerVersion || !dialog.open) return;
  stopMedia();
  const frame = document.createElement('iframe');
  frame.title = 'Player oficial do Spotify';
  frame.src = data.url;
  frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
  $('#embed').append(frame);
  $('#spotifySearch').href = data.canonical;
  $('#spotifySearch').textContent = 'Abrir no Spotify';
  $('#playerMessage').textContent = 'Player oficial do Spotify.';
}

async function openPlayer(item) {
  const version = ++playerVersion;
  stopMedia();
  $('#playerMessage').textContent = '';
  $('#playerTitle').textContent = item?.name || 'Ouvir no PopReport';
  $('#spotifySearch').href = item?.spotifyUrl || ('https://open.spotify.com/search/' + encodeURIComponent(`${item?.name || ''} ${item?.artist || ''}`.trim()));
  $('#spotifySearch').textContent = item?.spotifyUrl ? 'Abrir no Spotify' : 'Encontrar no Spotify';
  dialog.showModal();

  if (!item) {
    $('#playerMessage').textContent = 'Escolha uma música do catálogo para ouvir a prévia.';
    return;
  }

  // Prévias da Deezer expiram: busca o link atualizado antes de tocar.
  if (item.source === 'deezer' && item.kind === 'track' && !item.previewUrl) {
    try { item.previewUrl = (await api('/api/music/track/' + encodeURIComponent(item.id))).previewUrl || ''; } catch { item.previewUrl = ''; }
    if (version !== playerVersion || !dialog.open) return;
  }
  if (item.previewUrl && await playPreview(item.previewUrl, version)) return;

  if (item.spotifyUrl) {
    try { await embedLink(item.spotifyUrl, version); }
    catch (e) { if (version === playerVersion) $('#playerMessage').textContent = e.message; }
    return;
  }

  $('#playerMessage').textContent = item.kind === 'track' ? 'Prévia indisponível para esta faixa. Você pode abri-la no Spotify.' : 'Abra este conteúdo no Spotify.';
}
