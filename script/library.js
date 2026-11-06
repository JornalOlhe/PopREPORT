// Tela Playlists: lista de playlists, músicas de cada uma, coleção recente e nome do perfil.
'use strict';
let collectionVersion=0;
let recentVersion=0;
async function loadRecent(){
  const version=++recentVersion;
  try{
    const songs=await api('/api/lista');
    if(version!==recentVersion)return;
    $('#recentSongs').innerHTML=songs.slice(0,4).map((x,i)=>row(libraryItem(x),i)).join('');
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
    let sel=collection.playlists.some(p=>String(p.id)===String(history.state?.playlistId))?String(history.state.playlistId):'';
    function open(id){
      sel=id;
      if(history.state?.screen==='library'){const next={...history.state,playlistId:id};history.replaceState(next,'',stateUrl(next));}
      render();window.scrollTo({top:0});
    }
    function render(){
      const playlist=collection.playlists.find(p=>String(p.id)===sel);
      $('#playlistBack').hidden=!playlist;
      if(!playlist){
        $('#collectionTitle').textContent='Suas playlists';
        $('#playlistSummary').textContent='';
        $('#library').innerHTML=collection.playlists.length?`<div class="grid playlist-grid">${collection.playlists.map(p=>{
          const first=p.songIds.map(id=>songs.find(s=>String(s.id)===String(id))).find(s=>s?.image);
          const cover=first?.image?`<img class="cover" src="${esc(safeUrl(first.image))}" alt="" loading="lazy">`:`<div class="cover playlist-empty" aria-hidden="true">♪</div>`;
          return `<button type="button" class="card playlist-card" data-open="${esc(p.id)}">${cover}<h3>${esc(p.name)}</h3><p>${p.songIds.length} música${p.songIds.length===1?'':'s'}</p></button>`;}).join('')}</div>`:'';
        status(collection.playlists.length?'':'Você ainda não tem playlists. Use Criar playlist para começar.');
        return;
      }
      const selected=playlist.songIds.map(id=>songs.find(s=>String(s.id)===String(id))).filter(Boolean);
      $('#playlistSummary').textContent=playlist.description || '';
      $('#collectionTitle').textContent=playlist.name;
      $('#library').innerHTML=`<div class="tracks">${selected.map((x,i)=>row(libraryItem(x),i)).join('')}</div>`;
      status(selected.length?`${selected.length} música${selected.length===1?'':'s'}.`:'Esta playlist ainda não tem músicas. Use Criar playlist para adicionar.');
    }
    $('#library').onclick=ev=>{const card=ev.target.closest('[data-open]');if(card)open(card.dataset.open);};
    $('#playlistBack').onclick=()=>open('');
    render();
  }catch(e){if(version===collectionVersion)status(e.message,true);}
}
async function collectionSubmit(form,message,body){
  const button=form.querySelector('button');button.disabled=true;message.textContent='Salvando…';
  try{await PopReportAPI.request('/api/collection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});message.textContent='Salvo!';await loadLibrary();}
  catch(e){message.textContent=e.message;}
  finally{button.disabled=false;}
}
$('#profileForm').onsubmit=e=>{e.preventDefault();collectionSubmit(e.currentTarget,$('#profileMessage'),{action:'profile',name:$('#displayName').value.trim()});};

