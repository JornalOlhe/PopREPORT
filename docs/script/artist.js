// Tela de perfil do artista.
'use strict';
let profileVersion = 0;
// Biografia: mostra só o primeiro parágrafo; o resto fica atrás de "Ler mais".
function bioHtml(data) {
  const text = String(data.bio?.text || '').trim();
  if (!text) return `<h2>Sobre ${esc(data.name)}</h2><p class="hint">Biografia indisponível.</p>`;
  const [first, ...rest] = text.split(/\n+/).filter(Boolean);
  const more = rest.join('\n');
  const link = data.bio.url ? `<a class="source" href="${esc(safeUrl(data.bio.url))}" target="_blank" rel="noopener">${esc(data.bio.source)} · Artigo original</a>` : '';
  return `<h2>Sobre ${esc(data.name)}</h2><p class="bio">${esc(first)}</p>${more ? `<details class="bio-more"><summary>Ler mais</summary><p class="bio">${esc(more)}</p></details>` : ''}${link}`;
}
async function loadArtist(id) {
    const version = ++profileVersion;
    const status = (text, error=false) => { $('#artistStatus').textContent=text; $('#artistStatus').classList.toggle('error',error); };
    $('#profile').replaceChildren(); status('Carregando perfil…');
    if (!/^(?:\d{1,16}|[A-Za-z0-9]{22})$/.test(id || '')) { status('Escolha um artista pela busca.',true); return; }
    try {
      const data = await api('/api/music/artist/'+id);
      if(version !== profileVersion) return;
      document.title = `${data.name} — PopReport`;
      $('#profile').innerHTML = `<section class="artist-hero">${photo(data,true)}<div><h1>${esc(data.name)}</h1><p>${Number(data.followers ?? data.fans ?? 0).toLocaleString('pt-BR')} ${data.source === 'Spotify' ? 'seguidores' : 'fãs'} · ${Number(data.albumCount || 0)} lançamentos</p><button class="pill" data-play="${esc(remember(data))}">Ouvir</button></div></section><div class="profile-layout"><section>${bioHtml(data)}<h2>Discografia</h2><div class="grid" id="discography">${data.albums.map(card).join('')}</div><p id="albumStatus" role="status">${data.albumsUnavailable ? 'Discografia temporariamente indisponível. Recarregue para tentar novamente.' : !data.albums.length ? 'Nenhum lançamento disponível.' : ''}</p><button class="pill" id="moreAlbums" ${data.hasMore?'':'hidden'}>Mais lançamentos</button></section><aside><h2>Mais ouvidas</h2><div class="tracks">${data.tracks.slice(0,5).map(row).join('')}</div>${!data.tracks.length?'<p class="hint">Seleção indisponível para este artista.</p>':''}</aside></div>`;
      let albumOffset = 0;
      $('#moreAlbums').onclick = async()=>{const b=$('#moreAlbums');b.disabled=true;try{const next=await api(`/api/music/artist/${id}?offset=${albumOffset+24}`);if(version!==profileVersion)return;if(next.albumsUnavailable)throw new Error('Não foi possível carregar mais lançamentos. Tente novamente.');albumOffset+=24;$('#discography').insertAdjacentHTML('beforeend',next.albums.map(card).join(''));b.hidden=!next.hasMore||albumOffset>=984;$('#albumStatus').textContent='';}catch(e){if(version===profileVersion)$('#albumStatus').textContent=e.message;}finally{b.disabled=false;}};
      status('');
    } catch(e) { if(version===profileVersion)status(e.message,true); }
}
