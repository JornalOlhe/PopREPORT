'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = s => { try { const u = new URL(s); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const items = new Map();
const originalPath=location.pathname;
const originalQuery=new URLSearchParams(location.search);
const appAddress=originalPath.replace(/[^/]*\.html$/, '') || '/';
const entryScreen=({ 'artist.html':'artist','library.html':'library','form.html':'form' })[originalPath.split('/').pop()] || 'discover';
const entryState=history.state?.screen ? history.state : {screen:entryScreen,id:originalQuery.get('id'),q:originalQuery.get('q')||'',filter:originalQuery.get('filter')||'all'};
history.replaceState(entryState,'',appAddress);
function showScreen(state,focus=true){
  const screen=['discover','artist','library','form'].includes(state?.screen)?state.screen:'discover';
  document.querySelectorAll('[data-screen-view]').forEach(s=>s.hidden=s.dataset.screenView!==screen);
  document.querySelectorAll('nav [data-screen]').forEach(a=>{if(a.dataset.screen===screen)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  document.title=({discover:'Descobrir',artist:'Artista',library:'Sua coleção',form:'Adicionar música'})[screen]+' — popreport';
  if(dialog.open)dialog.close();
  $('#previewFrame').removeAttribute('src'); $('#songPreview').hidden=true;
  if(screen==='artist')loadArtist(state.id); else profileVersion++;
  if(screen==='library'||screen==='form')loadLibrary();
  if(screen==='discover')loadRecent();
  if(focus){$('#main').focus({preventScroll:true});window.scrollTo({top:0});}
}
document.addEventListener('click',e=>{
  if(e.target.closest('a.skip')){e.preventDefault();$('#main').focus();return;}
  const link=e.target.closest('a[data-screen],a[data-artist]');
  if(!link||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button)return;
  e.preventDefault();
  const state={...history.state,screen:link.dataset.artist?'artist':link.dataset.screen,id:link.dataset.artist||null};
  history.pushState(state,'',appAddress);showScreen(state);
});
window.addEventListener('popstate',()=>showScreen(history.state));

function remember(x) { const key = `${x.kind}:${x.id}`; items.set(key, x); return key; }
function photo(x, portrait = false) { return `<img class="cover${portrait ? ' portrait' : ''}" src="${esc(safeUrl(x.image) || 'Imagens/fallback.svg')}" alt="${esc(x.name)}" loading="lazy" width="640" height="640">`; }
document.addEventListener('error', event => { if (event.target instanceof HTMLImageElement && !event.target.src.endsWith('/fallback.svg')) event.target.src = 'Imagens/fallback.svg'; }, true);
async function api(url, signal) {
  return PopReportAPI.request(url, { signal });
}
function play(x) { return `<button class="play" data-play="${esc(remember(x))}" aria-label="Ouvir ${esc(x.name)}">${playIcon}</button>`; }
function card(x) {
  if (x.kind === 'artist') return `<article class="card"><a href="./" data-artist="${esc(x.id)}">${photo(x,true)}<h3>${esc(x.name)}</h3></a><p>Artista · Ver perfil</p></article>`;
  return `<article class="card"><div class="card-art">${photo(x)}${play(x)}</div><h3>${esc(x.name)}</h3><p>${artistLink(x)}</p>${x.releaseDate ? `<p>${esc(x.releaseDate.slice(0,4))}</p>` : ''}</article>`;
}
function artistLink(x) { return x.artistId ? `<a href="./" data-artist="${esc(x.artistId)}">${esc(x.artist || 'Ver artista')}</a>` : esc(x.artist || ''); }
function row(x, i) { return `<article class="track"><span class="number">${i + 1}</span>${photo(x)}<div class="track-info"><strong>${esc(x.name)}</strong><small>${artistLink(x)}${x.album ? ` · ${esc(x.album)}` : ''}${x.genre ? ` · ${esc(x.genre)}` : ''}${Number(x.duration) > 0 ? ` · ${Math.floor(x.duration/60)}:${String(x.duration%60).padStart(2,'0')}` : ''}</small></div>${play(x)}</article>`; }
function status(text, error = false) { $('#status').textContent = text; $('#status').classList.toggle('error',error); }
document.addEventListener('click', e => { const button = e.target.closest('[data-play]'); if (button) openPlayer(items.get(button.dataset.play)); });

// Native dialog provides focus trapping, Escape and focus restoration.
$('#playerRoot').innerHTML = `<dialog id="player" aria-labelledby="playerTitle"><button class="close" aria-label="Fechar player">×</button><h2 id="playerTitle">Ouvir no PopReport</h2><p class="hint">Player oficial do Spotify. A reprodução completa depende da sua conta, região e das regras do Spotify; pode ser limitada a uma prévia.</p><div id="embed"></div><p id="playerMessage" role="status"></p><a id="spotifySearch" class="source" target="_blank" rel="noopener">Encontrar no Spotify</a><form id="embedForm"><label for="spotifyLink">Link do Spotify</label><input id="spotifyLink" type="url" required placeholder="https://open.spotify.com/track/…"><button class="primary">Abrir player oficial</button></form><details><summary>Ouvir um arquivo próprio ou licenciado</summary><p class="hint">O arquivo fica apenas neste navegador. Use áudio próprio, domínio público ou uma licença compatível.</p><label><input type="checkbox" id="rights"> Tenho os direitos ou a licença para usar este áudio.</label><label for="audioFile">Arquivo de áudio</label><input id="audioFile" type="file" accept="audio/*" disabled><audio id="localAudio" controls hidden></audio><p id="audioMessage" role="status" class="hint"></p></details></dialog>`;
let playerVersion = 0, audioUrl;
const dialog = $('#player');
dialog.querySelector('.close').onclick = () => dialog.close();
function stopMedia() { $('#embed').replaceChildren(); $('#localAudio').pause(); $('#localAudio').removeAttribute('src'); $('#localAudio').hidden = true; if (audioUrl) URL.revokeObjectURL(audioUrl); audioUrl = null; }
dialog.addEventListener('close', () => { playerVersion++; stopMedia(); });
async function embedLink(link, version = playerVersion) {
  const data = await api('/api/embed?url=' + encodeURIComponent(link));
  if (version !== playerVersion || !dialog.open) return;
  stopMedia();
  const frame = document.createElement('iframe');
  frame.title = 'Player oficial do Spotify'; frame.src = data.url;
  frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
  $('#embed').append(frame);
  $('#spotifyLink').value = data.canonical;
  $('#spotifySearch').href = data.canonical;
  $('#spotifySearch').textContent = 'Abrir no Spotify';
  $('#playerMessage').textContent = 'Se o player não carregar, abra o link no Spotify.';
}
async function openPlayer(item) {
  const version = ++playerVersion;
  stopMedia(); $('#spotifyLink').value = ''; $('#playerMessage').textContent = '';
  $('#rights').checked = false; $('#audioFile').disabled = true; $('#audioFile').value = ''; $('#audioMessage').textContent = '';
  $('#playerTitle').textContent = item?.name || 'Ouvir no PopReport';
  $('#spotifySearch').href = 'https://open.spotify.com/search/' + encodeURIComponent(`${item?.name || ''} ${item?.artist || ''}`.trim());
  $('#spotifySearch').textContent = 'Encontrar no Spotify';
  dialog.showModal();
  if (item?.spotifyUrl) { try { await embedLink(item.spotifyUrl, version); } catch(e) { $('#playerMessage').textContent = e.message; } return; }
  if (!item) return;
  $('#playerMessage').textContent = 'Procurando um link correspondente no Spotify…';
  try {
    const data = await api(`/api/resolve/${item.kind}/${encodeURIComponent(item.id)}`);
    if (version !== playerVersion || !dialog.open) return;
    if (data.spotifyUrl) await embedLink(data.spotifyUrl, version);
    else $('#playerMessage').textContent = 'Abra “Encontrar no Spotify”, copie o link em Compartilhar e cole abaixo.';
  } catch { if(version === playerVersion) $('#playerMessage').textContent = 'Cole um link do Spotify para abrir o player.'; }
}
$('#embedForm').onsubmit = async e => { e.preventDefault(); ++playerVersion; try { await embedLink($('#spotifyLink').value); } catch(error) { $('#playerMessage').textContent = error.message; } };
$('#rights').onchange = () => { $('#audioFile').disabled = !$('#rights').checked; if (!$('#rights').checked) stopMedia(); };
$('#audioFile').onchange = () => {
  const file = $('#audioFile').files[0];
  if (!file || !$('#rights').checked) return;
  if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|flac)$/i.test(file.name)) { $('#audioMessage').textContent = 'Escolha um arquivo de áudio.'; return; }
  ++playerVersion; stopMedia(); audioUrl = URL.createObjectURL(file); $('#localAudio').src = audioUrl; $('#localAudio').hidden = false; $('#audioMessage').textContent = file.name;
};
$('#localAudio').onerror = () => { $('#audioMessage').textContent = 'O navegador não conseguiu reproduzir este formato. Tente MP3 ou WAV.'; };
$('#directPlayer')?.addEventListener('click', () => openPlayer());

if ($('#searchForm')) {
  let filter = 'all', offset = 0, controller, generation = 0, combined = {artists:[],albums:[],tracks:[]};
  const initial = new URLSearchParams({q:history.state?.q || '',filter:history.state?.filter || 'all'});
  $('#query').value = initial.get('q') || '';
  filter = ['all','artist','album','track'].includes(initial.get('filter')) ? initial.get('filter') : 'all';
  function filters() { document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.filter === filter))); }
  filters();
  async function search(more = false) {
    controller?.abort(); const current = ++generation; controller = new AbortController();
    const q = $('#query').value.trim();
    if (q.length < 2) { $('#results').replaceChildren(); $('#more').hidden = true; status('Digite pelo menos 2 caracteres.'); return; }
    if (!more) { offset = 0; combined = {artists:[],albums:[],tracks:[]}; $('#results').replaceChildren(); }
    $('#more').hidden = true; $('#results').setAttribute('aria-busy','true'); status('Buscando artistas, álbuns e músicas…');
    history.replaceState({ ...history.state, q, filter },'', appAddress);
    try {
      const data = await api('/api/music/search?' + new URLSearchParams({q,filter,offset}), controller.signal);
      if (current !== generation) return;
      for (const key of ['artists','albums','tracks']) { const unique = new Map([...combined[key],...data[key]].map(x=>[x.id,x])); combined[key] = [...unique.values()]; }
      $('#results').innerHTML = ['artists','albums','tracks'].map(key => combined[key].length ? `<section><h2>${{artists:'Artistas',albums:'Álbuns',tracks:'Músicas'}[key]}</h2><div class="${key==='tracks'?'tracks':'grid'}">${combined[key].map(key==='tracks'?row:card).join('')}</div></section>` : '').join('');
      const count = Object.values(combined).reduce((n,a)=>n+a.length,0);
      status(count ? `${count} resultados para “${q}”${data.source ? ` · ${data.source}` : ''}` : 'Nenhum resultado. Tente outro nome ou filtro.');
      $('#more').hidden = !data.hasMore || offset >= 996;
    } catch(e) { if (current === generation && e.name !== 'AbortError') { status(e.message,true); if (more) offset = Math.max(0,offset-12); } }
    finally { if(current === generation) $('#results').setAttribute('aria-busy','false'); }
  }
  $('#searchForm').onsubmit = e=>{e.preventDefault();search();};
  $('#query').addEventListener('input',()=>{controller?.abort();generation++;$('#more').hidden=true;$('#results').setAttribute('aria-busy','false');status('Pressione Buscar para atualizar os resultados.');});
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;filters();search();});
  $('#more').onclick=()=>{offset+=12;search(true);};
  document.addEventListener('keydown', e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#query').focus();}});
  if ($('#query').value) search();
}
let profileVersion = 0;
async function loadArtist(id) {
    const version = ++profileVersion;
    const status = (text, error=false) => { $('#artistStatus').textContent=text; $('#artistStatus').classList.toggle('error',error); };
    $('#profile').replaceChildren(); status('Carregando perfil…');
    if (!/^(?:\d{1,16}|[A-Za-z0-9]{22})$/.test(id || '')) { status('Escolha um artista pela busca.',true); return; }
    try {
      const data = await api('/api/music/artist/'+id);
      if(version !== profileVersion) return;
      document.title = `${data.name} — PopReport`;
      $('#profile').innerHTML = `<section class="artist-hero">${photo(data,true)}<div><p>Artista</p><h1>${esc(data.name)}</h1><p>${Number(data.followers ?? data.fans ?? 0).toLocaleString('pt-BR')} seguidores${data.source ? ` · Dados do ${esc(data.source)}` : ''} · ${Number(data.albumCount || 0)} lançamentos</p><button class="pill" data-play="${esc(remember(data))}">Ouvir no Spotify</button></div></section><div class="profile-layout"><section><h2>Sobre ${esc(data.name)}</h2><p class="bio">${esc(data.bio?.text || 'Biografia indisponível. Explore a discografia e as músicas abaixo.')}</p>${data.bio ? `<a class="source" href="${esc(safeUrl(data.bio.url))}" target="_blank" rel="noopener">${esc(data.bio.source)} · Ler artigo original</a>`:''}<h2>Discografia</h2><p class="hint">Álbuns e singles.</p><div class="grid" id="discography">${data.albums.map(card).join('')}</div><p id="albumStatus" role="status">${data.albumsUnavailable ? 'Discografia temporariamente indisponível. Recarregue para tentar novamente.' : !data.albums.length ? 'Nenhum lançamento disponível.' : ''}</p><button class="pill" id="moreAlbums" ${data.hasMore?'':'hidden'}>Mais lançamentos</button></section><aside><h2>Mais ouvidas</h2><p class="hint">Popular no ${esc(data.source || 'Spotify')}.</p><div class="tracks">${data.tracks.map(row).join('')}</div>${!data.tracks.length?'<p class="hint">Seleção indisponível para este artista.</p>':''}</aside></div>`;
      let albumOffset = 0;
      $('#moreAlbums').onclick = async()=>{const b=$('#moreAlbums');b.disabled=true;try{const next=await api(`/api/music/artist/${id}?offset=${albumOffset+24}`);if(version!==profileVersion)return;if(next.albumsUnavailable)throw new Error('Não foi possível carregar mais lançamentos. Tente novamente.');albumOffset+=24;$('#discography').insertAdjacentHTML('beforeend',next.albums.map(card).join(''));b.hidden=!next.hasMore||albumOffset>=984;$('#albumStatus').textContent='';}catch(e){if(version===profileVersion)$('#albumStatus').textContent=e.message;}finally{b.disabled=false;}};
      status(data.source ? `Perfil carregado do ${data.source}.` : '');
    } catch(e) { if(version===profileVersion)status(e.message,true); }
}
let collectionVersion=0;
let recentVersion=0;
async function loadRecent(){
  const version=++recentVersion;
  try{
    const songs=await api('/api/lista');
    if(version!==recentVersion)return;
    $('#recentSongs').innerHTML=songs.slice(0,4).map((x,i)=>row({...x,kind:'track',name:x.track,id:x.spotifyId||x.id},i)).join('');
    $('#recentCollection').hidden=!songs.length;
  }catch{$('#recentCollection').hidden=true;}
}
async function loadLibrary() {
  const version=++collectionVersion;
  const status=(text,error=false)=>{ $('#libraryStatus').textContent=text; $('#libraryStatus').classList.toggle('error',error); };
  status('Carregando sua coleção…');
  try {
    const [songs,collection]=await Promise.all([api('/api/lista'),api('/api/collection')]);
    if(version!==collectionVersion)return;
    $('#displayName').value=collection.profile.name;
    const options=collection.playlists.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    const current=$('#playlistFilter').value || history.state?.playlistId || '';
    $('#playlistFilter').innerHTML='<option value="">Todas as músicas</option>'+options;
    if(collection.playlists.some(p=>String(p.id)===current))$('#playlistFilter').value=current;
    const chosen=$('#playlistChoice').value;
    $('#playlistChoice').innerHTML='<option value="">Sem playlist</option>'+options;
    if(collection.playlists.some(p=>String(p.id)===chosen))$('#playlistChoice').value=chosen;
    function render(){
      const playlist=collection.playlists.find(p=>String(p.id)===$('#playlistFilter').value);
      if(history.state?.screen==='library')history.replaceState({...history.state,playlistId:$('#playlistFilter').value},'',appAddress);
      const selected=playlist?playlist.songIds.map(id=>songs.find(s=>String(s.id)===String(id))).filter(Boolean):songs;
      $('#playlistSummary').textContent=playlist?.description || '';
      $('#collectionTitle').textContent=playlist?.name || 'Sua coleção';
      $('#library').innerHTML=`<div class="tracks">${selected.map((x,i)=>row({...x,kind:'track',name:x.track,id:x.spotifyId||x.id},i)).join('')}</div>`;
      status(selected.length?`${selected.length} música${selected.length===1?'':'s'}.`:'Nenhuma música aqui ainda. Use Adicionar música.');
    }
    $('#playlistFilter').onchange=render; render();
  }catch(e){if(version===collectionVersion)status(e.message,true);}
}
async function collectionSubmit(form,message,body){
  const button=form.querySelector('button');button.disabled=true;message.textContent='Salvando…';
  try{await PopReportAPI.request('/api/collection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});message.textContent='Salvo!';await loadLibrary();}
  catch(e){message.textContent=e.message;}
  finally{button.disabled=false;}
}
$('#profileForm').onsubmit=e=>{e.preventDefault();collectionSubmit(e.currentTarget,$('#profileMessage'),{action:'profile',name:$('#displayName').value.trim()});};
$('#playlistForm').onsubmit=e=>{e.preventDefault();collectionSubmit(e.currentTarget,$('#playlistMessage'),{action:'playlist',name:$('#playlistName').value.trim(),description:$('#playlistDescription').value.trim()});};

showScreen(entryState,false);
