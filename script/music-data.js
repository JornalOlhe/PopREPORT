// Shared public metadata provider for Node.js and GitHub Pages.
(function (root) {
'use strict';
const browserMode = typeof window !== 'undefined';
const cache = new Map();
let sequence = 0;
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const callback = `popreport_${Date.now()}_${++sequence}`;
    const script = document.createElement('script');
    const target = new URL(url);
    target.searchParams.set('output', 'jsonp');
    target.searchParams.set('callback', callback);
    function clean() { clearTimeout(timer); script.remove(); delete root[callback]; }
    const timer = setTimeout(() => { clean(); reject(new Error('A busca demorou para responder. Tente novamente.')); }, 10000);
    root[callback] = data => { clean(); resolve(data); };
    script.onerror = () => { clean(); reject(new Error('Não foi possível consultar a música. Tente novamente.')); };
    script.src = target.href;
    document.head.append(script);
  });
}
async function json(url) {
  const hit = cache.get(url);
  if (hit && hit.until > Date.now()) return hit.data;
  let data;
  if (browserMode && new URL(url).hostname === 'api.deezer.com') data = await jsonp(url);
  else {
    const target = new URL(url);
    if (browserMode) target.searchParams.set('origin', '*');
    const response = await fetch(target, { signal: AbortSignal.timeout(10000), ...(browserMode ? {} : { headers: { 'User-Agent': 'PopReport/5.0 (academic music discovery)' } }) });
    if (!response.ok) throw new Error('Fonte musical temporariamente indisponível. Tente novamente.');
    data = await response.json();
  }
  if (data.error) throw new Error('A fonte musical não retornou este conteúdo.');
  if (cache.size >= 200) cache.delete(cache.keys().next().value);
  cache.set(url, { data, until: Date.now() + 300000 });
  return data;
}
const dz = endpoint => json('https://api.deezer.com' + endpoint);
const image = x => x.picture_xl || x.cover_xl || x.picture_big || x.cover_big || x.picture_medium || x.cover_medium || '';
const artist = x => ({ id: String(x.id), kind: 'artist', source: 'deezer', name: x.name, image: image(x), url: x.link });
const album = x => ({ id: String(x.id), kind: 'album', source: 'deezer', name: x.title, image: image(x), artist: x.artist?.name || '', artistId: x.artist?.id == null ? '' : String(x.artist.id), releaseDate: x.release_date || '', totalTracks: x.nb_tracks || 0, recordType: x.record_type || '', url: x.link });
const track = x => ({ id: String(x.id), kind: 'track', source: 'deezer', name: x.title, image: image(x.album || {}), artist: x.artist?.name || '', artistId: x.artist?.id == null ? '' : String(x.artist.id), album: x.album?.title || '', albumId: x.album?.id == null ? '' : String(x.album.id), releaseDate: x.album?.release_date || '', duration: x.duration, durationMs: Number(x.duration || 0) * 1000, explicit: Boolean(x.explicit_lyrics), trackNumber: x.track_position || 0, previewUrl: x.preview || '', url: x.link });
// Mais recentes primeiro; lançamentos sem data vão para o fim.
function sortByRelease(list, direction = 'desc') {
  const sign = direction === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (!a.releaseDate !== !b.releaseDate) return a.releaseDate ? -1 : 1;
    return sign * String(a.releaseDate).localeCompare(String(b.releaseDate)) || String(a.name).localeCompare(String(b.name));
  });
}
async function discography(id) {
  const found = [], seen = new Set();
  for (let index = 0; index < 400; index += 100) {
    const page = await dz(`/artist/${encodeURIComponent(id)}/albums?limit=100&index=${index}`);
    for (const item of page.data || []) {
      const entry = album({ ...item, artist: item.artist || { id } });
      const key = `${entry.name.toLowerCase()}|${entry.releaseDate.slice(0, 4)}`;
      if (!seen.has(key)) { seen.add(key); found.push(entry); }
    }
    if (!page.next) break;
  }
  return sortByRelease(found);
}
async function search(q, filter, offset) {
  const types = filter === 'all' ? ['artist', 'album', 'track'] : [filter];
  const result = { artists: [], albums: [], tracks: [], hasMore: false, source: 'Deezer' };
  const results = await Promise.all(types.map(async type => {
    const data = await dz(`/search/${type}?q=${encodeURIComponent(q)}&limit=12&index=${offset}`);
    return { type, data };
  }));
  for (const { type, data } of results) {
    result[type === 'artist' ? 'artists' : type === 'album' ? 'albums' : 'tracks'] = (data.data || []).map({ artist, album, track }[type]);
    result.hasMore ||= Boolean(data.next);
  }
  return result;
}
async function biography(name) {
  // Restrict to exact names (with optional music disambiguation), never guess a biography.
  for (const suffix of ['', ' (cantor)', ' (cantora)', ' (banda)']) {
    const title = name + suffix;
    const data = await json('https://pt.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'query', format: 'json', prop: 'extracts|info', inprop: 'url', exintro: '1', explaintext: '1', redirects: '1', titles: title }));
    const page = Object.values(data.query?.pages || {})[0];
    if (page?.extract && /cantor|cantora|banda|compositor|musical|rapper|músic|singer/i.test(page.extract.slice(0, 800)) && !/pode referir-se/.test(page.extract)) {
      return { text: page.extract, url: page.fullurl, title: page.title, source: 'Wikipédia · CC BY-SA' };
    }
  }
  return null;
}
async function detail(kind, id, offset = 0) {
  if (kind === 'artist') {
    const data = await dz(`/artist/${id}`);
    const results = await Promise.allSettled([
      dz(`/artist/${id}/albums?limit=24&index=${offset}`), dz(`/artist/${id}/top?limit=10`), biography(data.name)
    ]);
    const val = i => results[i].status === 'fulfilled' ? results[i].value : null;
    return { ...artist(data), fans: data.nb_fan, albumCount: data.nb_album, albums: (val(0)?.data || []).map(album), tracks: (val(1)?.data || []).map(track), bio: val(2), hasMore: Boolean(val(0)?.next), albumsUnavailable: !val(0), topUnavailable: !val(1), source: 'Deezer' };
  }
  const data = await dz(`/${kind}/${id}`);
  return kind === 'album' ? { ...album(data), tracks: (data.tracks?.data || []).map((t, i) => track({ ...t, track_position: t.track_position || i + 1, album: data, artist: t.artist || data.artist })), totalTracks: data.nb_tracks } : track(data);
}
if (typeof module !== 'undefined' && module.exports) module.exports = { search, detail, biography, discography, sortByRelease };
else root.PopReportMusic = { search, detail, biography, discography, sortByRelease };
})(globalThis);
