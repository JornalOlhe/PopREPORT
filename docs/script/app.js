// Roteador: histórico do navegador e troca de telas. Carregado por último; as telas ficam em ui/player/search/artist/library/form.
'use strict';
const originalPath=location.pathname;
const originalQuery=new URLSearchParams(location.search);
const appAddress=originalPath.replace(/[^/]*\.html$/, '') || '/';
const validScreens = new Set(['discover','artist','library','form','manage']);
const requestedScreen = originalQuery.get('screen');
const entryScreen=validScreens.has(requestedScreen) ? requestedScreen : (({ 'artist.html':'artist','library.html':'library','form.html':'form' })[originalPath.split('/').pop()] || 'discover');
const entryState=history.state?.screen ? history.state : {
  screen:entryScreen,
  id:originalQuery.get('id'),
  q:originalQuery.get('q')||'',
  filter:originalQuery.get('filter')||'all',
  playlistId:originalQuery.get('playlist')||''
};
function stateUrl(state={}){
  const params=new URLSearchParams();
  const screen=validScreens.has(state.screen)?state.screen:'discover';
  if(screen!=='discover')params.set('screen',screen);
  if(screen==='artist'&&state.id)params.set('id',state.id);
  if(state.q)params.set('q',state.q);
  if(state.filter&&state.filter!=='all')params.set('filter',state.filter);
  if(screen==='library'&&state.playlistId)params.set('playlist',state.playlistId);
  const query=params.toString();
  return appAddress+(query?`?${query}`:'');
}
history.replaceState(entryState,'',stateUrl(entryState));
function showScreen(state,focus=true){
  let screen=validScreens.has(state?.screen)?state.screen:'discover';
  if(!document.querySelector(`[data-screen-view="${screen}"]`)){
    screen='discover';
    const fixed={...state,screen};history.replaceState(fixed,'',stateUrl(fixed));
  }
  document.querySelectorAll('[data-screen-view]').forEach(s=>s.hidden=s.dataset.screenView!==screen);
  const navScreen=screen==='form'?'library':screen;
  document.querySelectorAll('nav [data-screen]').forEach(a=>{if(a.dataset.screen===navScreen)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  document.title=({discover:'Descobrir',artist:'Artista',library:'Playlists',form:'Criar playlist',manage:'Gerenciar'})[screen]+' — popreport';
  if(dialog.open)dialog.close();
  window.PopReportBuilder?.close();
  if(screen==='artist')loadArtist(state.id); else profileVersion++;
  if(screen==='library')loadLibrary();
  if(screen==='form')window.PopReportBuilder?.open();
  if(screen==='manage')window.PopReportCrud?.open();
  if(screen==='discover')loadRecent();
  if(focus){$('#main').focus({preventScroll:true});window.scrollTo({top:0});}
}
document.addEventListener('click',e=>{
  if(e.target.closest('a.skip')){e.preventDefault();$('#main').focus();return;}
  const link=e.target.closest('a[data-screen],a[data-artist]');
  if(!link||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button)return;
  e.preventDefault();
  const state={...history.state,screen:link.dataset.artist?'artist':link.dataset.screen,id:link.dataset.artist||null};
  history.pushState(state,'',stateUrl(state));showScreen(state);
});
window.addEventListener('popstate',()=>showScreen(history.state));


showScreen(entryState,false);
