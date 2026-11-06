// Auxiliares compartilhados pelas telas: seletores, escape de HTML, URLs seguras, cartões e linhas de música.
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = value => {
  const raw = String(value ?? '').trim();
  const local = raw.replace(/^\.?\//, '');
  if (/^Imagens\/[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp|svg)$/i.test(local)) return local;
  try { const u = new URL(raw); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
};
const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const items = new Map();

function remember(x) { const key = `${x.kind}:${x.id}`; items.set(key, x); return key; }
function photo(x, portrait = false) { return `<img class="cover${portrait ? ' portrait' : ''}" src="${esc(safeUrl(x.image) || 'Imagens/fallback.svg')}" alt="${esc(x.name)}" loading="lazy" decoding="async" width="640" height="640">`; }
document.addEventListener('error', event => { if (event.target instanceof HTMLImageElement && !event.target.src.endsWith('/fallback.svg')) event.target.src = 'Imagens/fallback.svg'; }, true);
async function api(url, signal) {
  return PopReportAPI.request(url, { signal });
}
function play(x) { return `<button class="play" data-play="${esc(remember(x))}" aria-label="Ouvir ${esc(x.name)}">${playIcon}</button>`; }
function card(x) {
  if (x.kind === 'artist') return `<article class="card"><a href="./" data-artist="${esc(x.id)}">${photo(x,true)}<h3>${esc(x.name)}</h3></a><p>Artista</p></article>`;
  return `<article class="card"><div class="card-art">${photo(x)}${play(x)}</div><h3>${esc(x.name)}</h3><p>${artistLink(x)}</p>${x.releaseDate ? `<p>${esc(x.releaseDate.slice(0,4))}</p>` : ''}</article>`;
}
function artistLink(x) { return x.artistId ? `<a href="./" data-artist="${esc(x.artistId)}">${esc(x.artist || 'Ver artista')}</a>` : esc(x.artist || ''); }
// Converte uma linha salva (navegador ou Supabase) no formato usado pelos cards e pelo player.
function libraryItem(x) {
  const source = x.source || 'spotify';
  return { ...x, kind: 'track', name: x.track, id: x.externalId || x.spotifyId || x.id, source, spotifyUrl: source === 'spotify' ? (x.spotifyUrl || x.url || '') : '' };
}
function row(x, i) { return `<article class="track"><span class="number">${i + 1}</span>${photo(x)}<div class="track-info"><strong>${esc(x.name)}</strong><small>${artistLink(x)}${x.album ? ` · ${esc(x.album)}` : ''}${Number(x.duration) > 0 ? ` · ${Math.floor(x.duration/60)}:${String(Math.round(x.duration%60)).padStart(2,'0')}` : ''}</small></div>${play(x)}</article>`; }
