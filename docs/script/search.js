// Tela Descobrir: busca por artista, álbum e música.
'use strict';
function status(text, error = false) { $('#status').textContent = text; $('#status').classList.toggle('error', error); }
if ($('#searchForm')) {
  let filter = 'all', offset = 0, controller, generation = 0, combined = {artists:[],albums:[],tracks:[]};
  const initial = new URLSearchParams({q:history.state?.q || '',filter:history.state?.filter || 'all'});
  $('#query').value = initial.get('q') || '';
  filter = ['all','artist','album','track'].includes(initial.get('filter')) ? initial.get('filter') : 'all';
  function filters() { document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.filter === filter))); }
  filters();
  async function search(more = false) {
    controller?.abort(); const current = ++generation; controller = new AbortController();
    $('#resultsSection').hidden = false;
    const q = $('#query').value.trim();
    if (q.length < 2) { $('#results').replaceChildren(); $('#more').hidden = true; status('Digite pelo menos 2 caracteres.'); return; }
    if (!more) { offset = 0; combined = {artists:[],albums:[],tracks:[]}; $('#results').replaceChildren(); }
    $('#more').hidden = true; $('#results').setAttribute('aria-busy','true'); status('Buscando…');
    const nextState={ ...history.state, q, filter, screen:'discover' };
    history.replaceState(nextState,'',stateUrl(nextState));
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
