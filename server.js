const http = require('http');
const fs = require('fs');
const path = require('path');
let mysql = null;
try { mysql = require('mysql2/promise'); } catch { mysql = null; }

const ROOT = __dirname;
const music = require('./music');

function loadDotEnv() {
  for (const fileName of ['.env.local', '.env']) {
    const envPath = path.join(ROOT, fileName);
    if (!fs.existsSync(envPath)) continue;
    for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}
loadDotEnv();

const PORT = Number(process.env.PORT || 3000);
const DB_NAME = process.env.DB_NAME || 'popreport';
const SPOTIFY_TIMEOUT_MS = Math.max(3000, Math.min(20000, Number(process.env.SPOTIFY_REQUEST_TIMEOUT_MS || 8000)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.sql': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.drawio': 'application/xml; charset=utf-8'
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        tooLarge = true;
        body = '';
        reject(new Error('BODY_TOO_LARGE'));
      }
    });
    req.on('end', () => {
      if (tooLarge) return;
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('INVALID_JSON')); }
    });
    req.on('error', reject);
  });
}

// -------------------------
// MySQL
// -------------------------
let dbPool = null;
let dbLastError = null;

function dbOptions(includeDatabase = true) {
  const options = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: Math.max(1, Math.min(20, Number(process.env.DB_CONNECTION_LIMIT || 8))),
    queueLimit: 0,
    charset: 'utf8mb4'
  };
  if (includeDatabase) options.database = DB_NAME;
  return options;
}

function getDbPool() {
  if (!mysql) {
    const error = new Error('Dependência mysql2 não instalada. Execute npm install.');
    error.code = 'MYSQL2_NOT_INSTALLED';
    throw error;
  }
  if (!dbPool) dbPool = mysql.createPool(dbOptions(true));
  return dbPool;
}

async function dbQuery(sql, params = []) {
  try {
    const [rows] = await getDbPool().execute(sql, params);
    dbLastError = null;
    return rows;
  } catch (error) {
    dbLastError = error;
    throw error;
  }
}

async function getDbStatus() {
  try {
    const [row] = await dbQuery(`
      SELECT
        (SELECT COUNT(*) FROM artista) AS artistas,
        (SELECT COUNT(*) FROM album) AS albuns,
        (SELECT COUNT(*) FROM musica) AS musicas,
        (SELECT COUNT(*) FROM genero) AS generos,
        (SELECT COUNT(*) FROM playlist) AS playlists
    `);
    return { connected: true, database: DB_NAME, counts: row };
  } catch (error) {
    return {
      connected: false,
      database: DB_NAME,
      error: 'Sua coleção está temporariamente indisponível. Tente novamente em instantes.'
    };
  }
}

async function getDatabaseCatalog(limit = 12) {
  const safeLimit = Math.max(1, Math.min(30, Number(limit) || 12));

  const artists = await dbQuery(`
    SELECT
      a.id,
      a.spotify_id AS spotifyId,
      a.nome AS name,
      a.imagem_url AS image,
      a.pagina_local AS localUrl,
      GROUP_CONCAT(DISTINCT g.nome ORDER BY g.nome SEPARATOR ' • ') AS genre,
      COUNT(DISTINCT al.id) AS albumCount,
      COUNT(DISTINCT m.id) AS trackCount
    FROM artista a
    LEFT JOIN artista_genero ag ON ag.artista_id = a.id
    LEFT JOIN genero g ON g.id = ag.genero_id
    LEFT JOIN album al ON al.artista_id = a.id
    LEFT JOIN musica m ON m.album_id = al.id
    GROUP BY a.id, a.spotify_id, a.nome, a.imagem_url, a.pagina_local
    ORDER BY a.nome
    LIMIT ${safeLimit}
  `);

  const albums = await dbQuery(`
    SELECT
      al.id,
      al.spotify_id AS spotifyId,
      al.titulo AS name,
      al.imagem_url AS image,
      al.ano_lancamento AS year,
      al.link_spotify AS spotifyUrl,
      a.nome AS artist,
      COUNT(m.id) AS trackCount
    FROM album al
    JOIN artista a ON a.id = al.artista_id
    LEFT JOIN musica m ON m.album_id = al.id
    GROUP BY al.id, al.spotify_id, al.titulo, al.imagem_url, al.ano_lancamento, al.link_spotify, a.nome
    ORDER BY al.criado_em DESC, al.id DESC
    LIMIT ${safeLimit}
  `);

  const tracks = await dbQuery(`
    SELECT
      m.id,
      m.spotify_id AS spotifyId,
      m.titulo AS name,
      m.duracao_ms AS durationMs,
      m.explicita AS explicit,
      m.link_spotify AS spotifyUrl,
      m.criado_em AS createdAt,
      al.titulo AS album,
      al.imagem_url AS image,
      a.nome AS artist
    FROM musica m
    JOIN album al ON al.id = m.album_id
    JOIN artista a ON a.id = al.artista_id
    ORDER BY m.criado_em DESC, m.id DESC
    LIMIT ${safeLimit}
  `);

  return { artists, albums, tracks };
}

async function searchDatabase(q, filter = 'all') {
  const term = `%${q}%`;
  const result = { artists: [], albums: [], tracks: [] };

  if (filter === 'all' || filter === 'artist') {
    result.artists = await dbQuery(`
      SELECT DISTINCT
        a.id,
        a.spotify_id AS spotifyId,
        a.nome AS name,
        a.imagem_url AS image,
        a.pagina_local AS localUrl,
        GROUP_CONCAT(DISTINCT g.nome ORDER BY g.nome SEPARATOR ' • ') AS genre
      FROM artista a
      LEFT JOIN artista_genero ag ON ag.artista_id = a.id
      LEFT JOIN genero g ON g.id = ag.genero_id
      WHERE a.nome LIKE ? OR g.nome LIKE ?
      GROUP BY a.id, a.spotify_id, a.nome, a.imagem_url, a.pagina_local
      ORDER BY a.nome
      LIMIT 10
    `, [term, term]);
  }

  if (filter === 'all' || filter === 'album') {
    result.albums = await dbQuery(`
      SELECT
        al.id,
        al.spotify_id AS spotifyId,
        al.titulo AS name,
        al.imagem_url AS image,
        al.ano_lancamento AS year,
        al.link_spotify AS spotifyUrl,
        a.nome AS artist
      FROM album al
      JOIN artista a ON a.id = al.artista_id
      WHERE al.titulo LIKE ? OR a.nome LIKE ?
      ORDER BY al.titulo
      LIMIT 10
    `, [term, term]);
  }

  if (filter === 'all' || filter === 'track') {
    result.tracks = await dbQuery(`
      SELECT
        m.id,
        m.spotify_id AS spotifyId,
        m.titulo AS name,
        m.duracao_ms AS durationMs,
        m.explicita AS explicit,
        m.link_spotify AS spotifyUrl,
        al.titulo AS album,
        al.imagem_url AS image,
        a.nome AS artist
      FROM musica m
      JOIN album al ON al.id = m.album_id
      JOIN artista a ON a.id = al.artista_id
      WHERE m.titulo LIKE ? OR al.titulo LIKE ? OR a.nome LIKE ?
      ORDER BY m.titulo
      LIMIT 10
    `, [term, term, term]);
  }

  return result;
}

// -------------------------
// Spotify Web API
// -------------------------
const spotify = { token: null, expiresAt: 0 };

function spotifyConfigured() {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

async function getSpotifyToken() {
  if (!spotifyConfigured()) {
    const err = new Error('SPOTIFY_NOT_CONFIGURED');
    err.code = 'SPOTIFY_NOT_CONFIGURED';
    throw err;
  }
  if (spotify.token && Date.now() < spotify.expiresAt - 60_000) return spotify.token;

  const auth = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    signal: AbortSignal.timeout(SPOTIFY_TIMEOUT_MS),
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify auth failed (${response.status}): ${text.slice(0, 180)}`);
  }

  const data = await response.json();
  spotify.token = data.access_token;
  spotify.expiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
  return spotify.token;
}

async function spotifyFetch(endpoint, retryAuth = true) {
  const token = await getSpotifyToken();
  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    signal: AbortSignal.timeout(SPOTIFY_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 401 && retryAuth) {
    spotify.token = null;
    spotify.expiresAt = 0;
    return spotifyFetch(endpoint, false);
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify request failed (${response.status}): ${text.slice(0, 220)}`);
  }
  return response.json();
}

function mapArtist(artist) {
  return {
    id: artist.id,
    kind: 'artist',
    name: artist.name,
    image: artist.images?.[0]?.url || '',
    genres: (artist.genres || []).slice(0, 3),
    followers: artist.followers?.total || 0,
    spotifyUrl: artist.external_urls?.spotify || `https://open.spotify.com/artist/${artist.id}`,
    url: artist.external_urls?.spotify || `https://open.spotify.com/artist/${artist.id}`
  };
}

function mapAlbum(album) {
  const primary = album.artists?.[0];
  return {
    id: album.id,
    kind: 'album',
    name: album.name,
    image: album.images?.[0]?.url || '',
    artist: primary?.name || '',
    artistId: primary?.id || '',
    artists: (album.artists || []).map(a => a.name),
    releaseDate: album.release_date || '',
    totalTracks: album.total_tracks || 0,
    spotifyUrl: album.external_urls?.spotify || `https://open.spotify.com/album/${album.id}`,
    url: album.external_urls?.spotify || `https://open.spotify.com/album/${album.id}`
  };
}

function mapTrack(track) {
  const primary = track.artists?.[0];
  return {
    id: track.id,
    kind: 'track',
    name: track.name,
    image: track.album?.images?.[0]?.url || '',
    artist: primary?.name || '',
    artistId: primary?.id || '',
    artists: (track.artists || []).map(a => a.name),
    album: track.album?.name || '',
    duration: Math.round(Number(track.duration_ms || 0) / 1000),
    durationMs: track.duration_ms || 0,
    explicit: Boolean(track.explicit),
    spotifyUrl: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
    url: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`
  };
}

async function spotifySearch(q, filter, offset = 0) {
  const validFilters = new Set(['all', 'artist', 'album', 'track']);
  const selected = validFilters.has(filter) ? filter : 'all';
  const types = selected === 'all' ? ['artist', 'album', 'track'] : [selected];
  const params = new URLSearchParams({
    q,
    type: types.join(','),
    limit: '12',
    offset: String(Math.max(0, Math.min(1000, Number(offset) || 0))),
    market: process.env.SPOTIFY_MARKET || 'BR'
  });
  const data = await spotifyFetch(`/search?${params}`);
  const hasMore = Boolean(data.artists?.next || data.albums?.next || data.tracks?.next);
  return {
    artists: (data.artists?.items || []).filter(Boolean).map(mapArtist),
    albums: (data.albums?.items || []).filter(Boolean).map(mapAlbum),
    tracks: (data.tracks?.items || []).filter(Boolean).map(mapTrack),
    hasMore,
    source: 'Spotify'
  };
}

async function spotifyDetail(kind, id, offset = 0) {
  const market = process.env.SPOTIFY_MARKET || 'BR';
  const safeId = encodeURIComponent(id);

  if (kind === 'artist') {
    const artist = await spotifyFetch(`/artists/${safeId}`);
    const albumOffset = Math.max(0, Math.min(1000, Number(offset) || 0));
    const [albumsResult, tracksResult, bioResult] = await Promise.allSettled([
      spotifyFetch(`/artists/${safeId}/albums?include_groups=album,single&market=${encodeURIComponent(market)}&limit=24&offset=${albumOffset}`),
      spotifyFetch(`/artists/${safeId}/top-tracks?market=${encodeURIComponent(market)}`),
      typeof music.biography === 'function' ? music.biography(artist.name) : Promise.resolve(null)
    ]);
    const albumData = albumsResult.status === 'fulfilled' ? albumsResult.value : null;
    const topData = tracksResult.status === 'fulfilled' ? tracksResult.value : null;
    const seen = new Set();
    const albums = (albumData?.items || []).filter(item => item && !seen.has(item.id) && seen.add(item.id)).map(mapAlbum);
    return {
      ...mapArtist(artist),
      followers: artist.followers?.total || 0,
      albumCount: Number(albumData?.total || albums.length),
      albums,
      tracks: (topData?.tracks || []).filter(Boolean).slice(0,10).map(mapTrack),
      bio: bioResult.status === 'fulfilled' ? bioResult.value : null,
      hasMore: Boolean(albumData?.next),
      albumsUnavailable: albumsResult.status !== 'fulfilled',
      topUnavailable: tracksResult.status !== 'fulfilled',
      source: 'Spotify'
    };
  }

  if (kind === 'album') {
    const album = await spotifyFetch(`/albums/${safeId}?market=${encodeURIComponent(market)}`);
    const tracks = (album.tracks?.items || []).filter(Boolean).map(track => mapTrack({
      ...track,
      album: {
        id: album.id,
        name: album.name,
        images: album.images,
        external_urls: album.external_urls
      }
    }));
    return { ...mapAlbum(album), tracks, totalTracks: album.total_tracks || tracks.length, source: 'Spotify' };
  }

  const track = await spotifyFetch(`/tracks/${safeId}?market=${encodeURIComponent(market)}`);
  return { ...mapTrack(track), source: 'Spotify' };
}

function parseSpotifyUrl(raw) {
  try {
    const url = new URL(String(raw || '').trim());
    if (url.protocol !== 'https:' || !['open.spotify.com', 'www.open.spotify.com'].includes(url.hostname)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (/^intl-[a-z-]+$/.test(parts[0])) parts.shift();
    const type = parts[0];
    const id = parts[1];
    if (parts.length !== 2 || !['track', 'album', 'artist'].includes(type) || !/^[A-Za-z0-9]{22}$/.test(id || '')) return null;
    return { type, id, canonical: `https://open.spotify.com/${type}/${id}` };
  } catch {
    return null;
  }
}

async function spotifyTrackMetadata(trackId) {
  const track = await spotifyFetch(`/tracks/${encodeURIComponent(trackId)}?market=${encodeURIComponent(process.env.SPOTIFY_MARKET || 'BR')}`);
  const mainArtist = track.artists?.[0];
  let artistDetails = null;
  if (mainArtist?.id) {
    try { artistDetails = await spotifyFetch(`/artists/${encodeURIComponent(mainArtist.id)}`); }
    catch { artistDetails = null; }
  }
  return { track, mainArtist, artistDetails };
}

const spotifyTrackCache = new Map();

async function spotifyTracksMetadata(trackIds) {
  const now = Date.now();
  const ids = [...new Set(trackIds.filter(id => /^[A-Za-z0-9]{22}$/.test(String(id || ''))))];
  const found = new Map();
  const missing = [];

  for (const id of ids) {
    const cached = spotifyTrackCache.get(id);
    if (cached && cached.until > now) found.set(id, cached.track);
    else missing.push(id);
  }

  for (let i = 0; i < missing.length; i += 50) {
    const chunk = missing.slice(i, i + 50);
    const data = await spotifyFetch(`/tracks?ids=${encodeURIComponent(chunk.join(','))}&market=${encodeURIComponent(process.env.SPOTIFY_MARKET || 'BR')}`);
    for (const track of data.tracks || []) {
      if (!track?.id) continue;
      spotifyTrackCache.set(track.id, { track, until: Date.now() + 5 * 60_000 });
      found.set(track.id, track);
    }
  }

  if (spotifyTrackCache.size > 500) {
    for (const [id, value] of spotifyTrackCache) {
      if (value.until <= Date.now() || spotifyTrackCache.size > 400) spotifyTrackCache.delete(id);
      if (spotifyTrackCache.size <= 400) break;
    }
  }

  return found;
}

async function enrichLibraryRowsFromSpotify(rows) {
  if (!spotifyConfigured()) return rows;

  const ids = rows
    .filter(row => /^[A-Za-z0-9]{22}$/.test(String(row.spotifyId || '')))
    .filter(row => !row.artistId || !/^https:\/\//i.test(String(row.image || '')) || Number(row.duration || 0) <= 0)
    .map(row => row.spotifyId);

  if (!ids.length) return rows;

  try {
    const metadata = await spotifyTracksMetadata(ids);
    return rows.map(row => {
      const track = metadata.get(row.spotifyId);
      if (!track) return row;
      const mainArtist = track.artists?.[0];
      return {
        ...row,
        artist: mainArtist?.name || row.artist,
        artistId: mainArtist?.id || row.artistId,
        track: track.name || row.track,
        album: track.album?.name || row.album,
        image: track.album?.images?.[0]?.url || row.image,
        duration: Math.round(Number(track.duration_ms || 0) / 1000) || row.duration,
        spotifyUrl: track.external_urls?.spotify || row.spotifyUrl,
        metadataSource: 'Spotify'
      };
    });
  } catch (error) {
    console.warn('[Spotify library enrichment]', error.message);
    return rows;
  }
}

async function saveTrackToDatabase({ artistInput, trackInput, albumInput, genreInput, parsed }) {
  let meta = null;
  try { meta = await spotifyTrackMetadata(parsed.id); }
  catch (error) {
    console.warn('[Spotify] Não foi possível enriquecer o cadastro:', error.message);
  }

  const spotifyTrack = meta?.track;
  // A temporary metadata outage must never replace an existing album or duration.
  if (!spotifyTrack) {
    const existing = await dbQuery(`SELECT m.id, m.titulo AS track, a.nome AS artist, a.spotify_id AS artistId,
      al.titulo AS album, al.imagem_url AS image, ROUND(m.duracao_ms / 1000) AS duration,
      m.link_spotify AS spotifyUrl, m.criado_em AS createdAt,
      (SELECT GROUP_CONCAT(g.nome ORDER BY g.nome SEPARATOR ', ') FROM artista_genero ag JOIN genero g ON g.id=ag.genero_id WHERE ag.artista_id=a.id) AS genre
      FROM musica m JOIN album al ON al.id=m.album_id JOIN artista a ON a.id=al.artista_id
      WHERE m.spotify_id=? LIMIT 1`, [parsed.id]);
    if (existing.length) return { ...existing[0], spotifyId: parsed.id, persisted: true, embedUrl: `https://open.spotify.com/embed/track/${parsed.id}` };
  }
  const spotifyArtist = meta?.mainArtist;
  const artistDetails = meta?.artistDetails;
  const spotifyAlbum = spotifyTrack?.album;

  const artistName = (spotifyArtist?.name || artistInput).trim().slice(0, 120);
  const artistSpotifyId = spotifyArtist?.id || null;
  const artistImage = artistDetails?.images?.[0]?.url || spotifyAlbum?.images?.[0]?.url || null;
  const genres = [...new Set([...(artistDetails?.genres || []), ...(genreInput ? [genreInput] : [])])].slice(0, 8);

  const albumName = (spotifyAlbum?.name || albumInput || 'Faixas cadastradas').trim().slice(0, 180);
  const albumSpotifyId = spotifyAlbum?.id || null;
  const albumImage = spotifyAlbum?.images?.[0]?.url || null;
  const albumYear = /^\d{4}/.test(spotifyAlbum?.release_date || '') ? Number(spotifyAlbum.release_date.slice(0, 4)) : null;
  const albumUrl = spotifyAlbum?.external_urls?.spotify || null;

  const trackName = (spotifyTrack?.name || trackInput).trim().slice(0, 180);
  const durationMs = Number(spotifyTrack?.duration_ms || 0);
  const explicit = spotifyTrack?.explicit ? 1 : 0;
  const trackNumber = Number(spotifyTrack?.track_number || 1);
  const trackUrl = spotifyTrack?.external_urls?.spotify || parsed.canonical;

  const pool = getDbPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute(`
      INSERT INTO artista (spotify_id, nome, imagem_url)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        spotify_id = COALESCE(VALUES(spotify_id), spotify_id),
        imagem_url = COALESCE(VALUES(imagem_url), imagem_url)
    `, [artistSpotifyId, artistName, artistImage]);

    const [[artistRow]] = await connection.execute(
      'SELECT id FROM artista WHERE nome = ? OR spotify_id = ? ORDER BY (spotify_id = ?) DESC LIMIT 1',
      [artistName, artistSpotifyId, artistSpotifyId]
    );
    if (!artistRow) throw new Error('ARTIST_NOT_SAVED');

    for (const rawGenre of genres) {
      const genre = String(rawGenre).trim().slice(0, 80);
      if (!genre) continue;
      await connection.execute(
        'INSERT INTO genero (nome) VALUES (?) ON DUPLICATE KEY UPDATE nome = VALUES(nome)',
        [genre]
      );
      const [[genreRow]] = await connection.execute('SELECT id FROM genero WHERE nome = ? LIMIT 1', [genre]);
      await connection.execute(
        'INSERT IGNORE INTO artista_genero (artista_id, genero_id) VALUES (?, ?)',
        [artistRow.id, genreRow.id]
      );
    }

    await connection.execute(`
      INSERT INTO album (artista_id, spotify_id, titulo, imagem_url, ano_lancamento, link_spotify)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        spotify_id = COALESCE(VALUES(spotify_id), spotify_id),
        imagem_url = COALESCE(VALUES(imagem_url), imagem_url),
        ano_lancamento = COALESCE(VALUES(ano_lancamento), ano_lancamento),
        link_spotify = COALESCE(VALUES(link_spotify), link_spotify)
    `, [artistRow.id, albumSpotifyId, albumName, albumImage, albumYear, albumUrl]);

    const [[albumRow]] = await connection.execute(`
      SELECT id FROM album
      WHERE (spotify_id IS NOT NULL AND spotify_id = ?) OR (artista_id = ? AND titulo = ?)
      ORDER BY (spotify_id = ?) DESC
      LIMIT 1
    `, [albumSpotifyId, artistRow.id, albumName, albumSpotifyId]);
    if (!albumRow) throw new Error('ALBUM_NOT_SAVED');

    await connection.execute(`
      INSERT INTO musica (album_id, spotify_id, titulo, duracao_ms, explicita, numero_faixa, link_spotify)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        album_id = VALUES(album_id),
        titulo = VALUES(titulo),
        duracao_ms = VALUES(duracao_ms),
        explicita = VALUES(explicita),
        numero_faixa = VALUES(numero_faixa),
        link_spotify = VALUES(link_spotify)
    `, [albumRow.id, parsed.id, trackName, durationMs, explicit, trackNumber, trackUrl]);

    const [[songRow]] = await connection.execute('SELECT id, criado_em FROM musica WHERE spotify_id = ? LIMIT 1', [parsed.id]);
    await connection.commit();

    return {
      id: songRow.id,
      spotifyId: parsed.id,
      artist: artistName,
      artistId: artistSpotifyId,
      track: trackName,
      album: albumName,
      image: albumImage,
      duration: Math.round(durationMs / 1000),
      genre: genres.join(', '),
      spotifyUrl: trackUrl,
      embedUrl: `https://open.spotify.com/embed/track/${parsed.id}?utm_source=generator&theme=0`,
      createdAt: songRow.criado_em,
      persisted: true
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// -------------------------
// API
// -------------------------
async function routeApi(req, res, url) {
  if (url.pathname === '/api/collection') {
    try {
      const [visitor] = await dbQuery('SELECT id, nome AS name FROM usuario WHERE email = ? LIMIT 1', ['visitante@popreport.local']);
      if (!visitor) throw new Error('PROFILE_MISSING');
      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        const name = String(body?.name || '').trim();
        if (!name || name.length > (body?.action === 'profile' ? 100 : 120)) return sendJson(res, 400, { error: 'Preencha um nome dentro do limite permitido.' });
        if (body.action === 'profile') await dbQuery('UPDATE usuario SET nome=? WHERE id=?', [name, visitor.id]);
        else if (body.action === 'playlist') {
          const description = String(body.description || '').trim();
          if (description.length > 300) return sendJson(res, 400, { error: 'Use até 300 caracteres na descrição.' });
          await dbQuery('INSERT INTO playlist (usuario_id,nome,descricao) VALUES (?,?,?)', [visitor.id, name, description || null]);
        } else return sendJson(res, 400, { error: 'Ação inválida.' });
      } else if (req.method !== 'GET') return sendJson(res, 405, { error: 'Ação indisponível.' });
      const playlists = await dbQuery('SELECT id,nome AS name,descricao AS description FROM playlist WHERE usuario_id=? ORDER BY id', [visitor.id]);
      const membership = await dbQuery('SELECT pm.playlist_id,pm.musica_id FROM playlist_musica pm JOIN playlist p ON p.id=pm.playlist_id WHERE p.usuario_id=? ORDER BY pm.ordem', [visitor.id]);
      const [profile] = await dbQuery('SELECT nome AS name FROM usuario WHERE id=?', [visitor.id]);
      return sendJson(res, req.method === 'POST' ? 201 : 200, { profile, playlists: playlists.map(p => ({...p,songIds:membership.filter(m => m.playlist_id===p.id).map(m => m.musica_id)})) });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') return sendJson(res, 409, { error: 'Você já tem uma playlist com esse nome.' });
      if (error.message === 'INVALID_JSON') return sendJson(res, 400, { error: 'Dados inválidos.' });
      if (error.message === 'BODY_TOO_LARGE') return sendJson(res, 413, { error: 'Dados acima do limite permitido.' });
      console.error('[Collection]', error.message);
      return sendJson(res, 503, { error: 'Não foi possível acessar sua coleção. Tente novamente.' });
    }
  }
  const resolveMatch = url.pathname.match(/^\/api\/resolve\/(artist|album|track)\/(\d{1,16})$/);
  if (req.method === 'GET' && resolveMatch) {
    try {
      const item = await music.detail(resolveMatch[1], resolveMatch[2]);
      const normalized = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const found = await spotifySearch(`${item.name} ${item.artist || ''}`, item.kind);
      const items = found[item.kind === 'artist' ? 'artists' : item.kind === 'album' ? 'albums' : 'tracks'];
      const exact = items.find(x => normalized(x.name) === normalized(item.name) && (!item.artist || x.artists?.some(a => normalized(a) === normalized(item.artist))));
      return sendJson(res, 200, { spotifyUrl: exact?.spotifyUrl || null });
    } catch { return sendJson(res, 200, { spotifyUrl: null }); }
  }
  if (req.method === 'GET' && url.pathname === '/api/music/search') {
    const q = (url.searchParams.get('q') || '').trim();
    const filter = url.searchParams.get('filter') || 'all';
    const offset = Number(url.searchParams.get('offset') || 0);
    if (q.length < 2 || q.length > 100 || !['all', 'artist', 'album', 'track'].includes(filter) || !Number.isInteger(offset) || offset < 0 || offset > 1000) return sendJson(res, 400, { error: 'Use uma busca de 2 a 100 caracteres e um filtro válido.' });
    try {
      const data = spotifyConfigured() ? await spotifySearch(q, filter, offset) : await music.search(q, filter, offset);
      return sendJson(res, 200, data);
    } catch (error) {
      console.error('[Music search]', error.message);
      return sendJson(res, 502, { error: spotifyConfigured() ? 'Não foi possível consultar o Spotify agora.' : 'Busca indisponível no momento. Verifique sua conexão e tente novamente.' });
    }
  }
  const detailMatch = url.pathname.match(/^\/api\/music\/(artist|album|track)\/([A-Za-z0-9]{22}|\d{1,16})$/);
  if (req.method === 'GET' && detailMatch) {
    const offset = Number(url.searchParams.get('offset') || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 1000) return sendJson(res, 400, { error: 'Página inválida.' });
    try {
      const id = detailMatch[2];
      const isSpotifyId = /^[A-Za-z0-9]{22}$/.test(id);
      if (isSpotifyId && !spotifyConfigured()) return sendJson(res, 503, { error: 'Configure o Spotify no arquivo .env para abrir este perfil.' });
      const data = isSpotifyId ? await spotifyDetail(detailMatch[1], id, offset) : await music.detail(detailMatch[1], id, offset);
      return sendJson(res, 200, data);
    } catch (error) {
      console.error('[Music detail]', error.message);
      return sendJson(res, 502, { error: 'Não foi possível carregar este perfil. Tente novamente.' });
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/embed') {
    const parsed = parseSpotifyUrl(url.searchParams.get('url'));
    if (!parsed) return sendJson(res, 400, { error: 'Cole um link de artista, álbum ou faixa do Spotify.' });
    return sendJson(res, 200, { url: `https://open.spotify.com/embed/${parsed.type}/${parsed.id}`, canonical: parsed.canonical });
  }
  if (req.method === 'GET' && url.pathname === '/api/status') {
    const db = await getDbStatus();
    return sendJson(res, 200, {
      database: db,
      spotify: { configured: spotifyConfigured(), market: process.env.SPOTIFY_MARKET || 'BR' }
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/db/status') {
    return sendJson(res, 200, await getDbStatus());
  }

  if (req.method === 'GET' && url.pathname === '/api/catalogo') {
    try {
      const catalog = await getDatabaseCatalog(url.searchParams.get('limit'));
      return sendJson(res, 200, { source: 'mysql', ...catalog });
    } catch (error) {
      console.error('[DB /api/catalogo]', error.message);
      return sendJson(res, 503, { error: 'Não foi possível carregar sua coleção. Tente novamente em instantes.' });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/catalogo/search') {
    const q = String(url.searchParams.get('q') || '').trim();
    const filter = String(url.searchParams.get('filter') || 'all');
    if (q.length < 2) return sendJson(res, 400, { error: 'Digite pelo menos 2 caracteres.' });
    try {
      return sendJson(res, 200, { source: 'mysql', ...(await searchDatabase(q, filter)) });
    } catch (error) {
      console.error('[DB search]', error.message);
      return sendJson(res, 503, { error: 'Busca local indisponível.' });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/spotify/status') {
    return sendJson(res, 200, { configured: spotifyConfigured(), market: process.env.SPOTIFY_MARKET || 'BR' });
  }

  if (req.method === 'GET' && url.pathname === '/api/spotify/track') {
    const parsed = parseSpotifyUrl(url.searchParams.get('url'));
    if (!parsed || parsed.type !== 'track') return sendJson(res, 400, { error: 'Cole um link válido de faixa do Spotify.' });
    if (!spotifyConfigured()) return sendJson(res, 503, { error: 'Configure SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET no .env para preencher os dados automaticamente.' });
    try {
      const { track, mainArtist, artistDetails } = await spotifyTrackMetadata(parsed.id);
      return sendJson(res, 200, {
        spotifyId: track.id,
        spotifyUrl: track.external_urls?.spotify || parsed.canonical,
        track: track.name || '',
        artist: mainArtist?.name || '',
        artistId: mainArtist?.id || '',
        album: track.album?.name || '',
        image: track.album?.images?.[0]?.url || artistDetails?.images?.[0]?.url || '',
        duration: Math.round(Number(track.duration_ms || 0) / 1000),
        explicit: Boolean(track.explicit),
        genre: (artistDetails?.genres || []).slice(0,3).join(', '),
        source: 'Spotify'
      });
    } catch (error) {
      console.error('[Spotify track metadata]', error.message);
      return sendJson(res, 502, { error: 'Não foi possível carregar os dados dessa faixa no Spotify agora.' });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/spotify/search') {
    const q = String(url.searchParams.get('q') || '').trim();
    const filter = String(url.searchParams.get('filter') || 'all');
    const offset = Number(url.searchParams.get('offset') || 0);
    if (q.length < 2) return sendJson(res, 400, { error: 'Digite pelo menos 2 caracteres.' });
    if (q.length > 100) return sendJson(res, 400, { error: 'Busca muito longa.' });
    try {
      return sendJson(res, 200, await spotifySearch(q, filter, offset));
    } catch (error) {
      if (error.code === 'SPOTIFY_NOT_CONFIGURED' || error.message === 'SPOTIFY_NOT_CONFIGURED') {
        return sendJson(res, 503, { error: 'A busca no Spotify está temporariamente indisponível. Tente novamente em instantes.' });
      }
      console.error('[Spotify search]', error.message);
      return sendJson(res, 502, { error: 'Não foi possível consultar o Spotify agora.' });
    }
  }

  if (url.pathname === '/api/lista' && req.method === 'GET') {
    try {
      const rows = await dbQuery(`
        SELECT
          m.id,
          a.nome AS artist,
          a.spotify_id AS artistId,
          m.titulo AS track,
          al.titulo AS album,
          al.imagem_url AS image,
          ROUND(m.duracao_ms / 1000) AS duration,
          m.link_spotify AS spotifyUrl,
          m.spotify_id AS spotifyId,
          m.criado_em AS createdAt,
          (SELECT GROUP_CONCAT(g.nome ORDER BY g.nome SEPARATOR ', ') FROM artista_genero ag JOIN genero g ON g.id=ag.genero_id WHERE ag.artista_id=a.id) AS genre
        FROM musica m
        JOIN album al ON al.id = m.album_id
        JOIN artista a ON a.id = al.artista_id
        ORDER BY m.criado_em DESC, m.id DESC
        LIMIT 500
      `);
      const publicRows = rows.map(row => ({
        ...row,
        embedUrl: `https://open.spotify.com/embed/track/${row.spotifyId}?utm_source=generator&theme=0`
      }));
      return sendJson(res, 200, await enrichLibraryRowsFromSpotify(publicRows));
    } catch (error) {
      console.error('[DB GET lista]', error.message);
      return sendJson(res, 503, { error: 'Não foi possível carregar suas músicas. Tente novamente em instantes.' });
    }
  }

  if (url.pathname === '/api/lista' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      if (!body || Array.isArray(body) || typeof body !== 'object') return sendJson(res, 400, { error: 'Preencha artista, música e link do Spotify.' });
      const artist = String(body.artist || '').trim();
      const track = String(body.track || '').trim();
      const parsed = parseSpotifyUrl(body.spotifyUrl);
      const albumInput = String(body.album || '').trim();
      const genreInput = String(body.genre || '').trim();
      const playlistId = body.playlistId == null || body.playlistId === '' ? null : Number(body.playlistId);
      if (albumInput.length > 180 || genreInput.length > 80 || (playlistId !== null && (!Number.isSafeInteger(playlistId) || playlistId < 1))) return sendJson(res, 400, { error: 'Verifique álbum, gênero e playlist.' });
      if (playlistId !== null) {
        const owned = await dbQuery('SELECT p.id FROM playlist p JOIN usuario u ON u.id=p.usuario_id WHERE p.id=? AND u.email=?', [playlistId, 'visitante@popreport.local']);
        if (!owned.length) return sendJson(res, 400, { error: 'Escolha uma playlist da sua coleção.' });
      }

      if (!artist || !track || !parsed || parsed.type !== 'track') {
        return sendJson(res, 400, { error: 'Preencha artista, música e use uma URL válida de faixa do Spotify.' });
      }
      if (artist.length > 120 || track.length > 180) {
        return sendJson(res, 400, { error: 'Artista ou música ultrapassou o tamanho permitido.' });
      }

      const item = await saveTrackToDatabase({ artistInput: artist, trackInput: track, albumInput, genreInput, parsed });
      if (playlistId !== null) {
        const connection = await getDbPool().getConnection();
        try {
          await connection.beginTransaction();
          await connection.execute('SELECT id FROM playlist WHERE id=? FOR UPDATE', [playlistId]);
          const [[already]] = await connection.execute('SELECT musica_id FROM playlist_musica WHERE playlist_id=? AND musica_id=?', [playlistId, item.id]);
          if (!already) {
            const [[position]] = await connection.execute('SELECT COALESCE(MAX(ordem),0)+1 AS nextOrder FROM playlist_musica WHERE playlist_id=?', [playlistId]);
            await connection.execute('INSERT INTO playlist_musica (playlist_id,musica_id,ordem) VALUES (?,?,?)', [playlistId, item.id, position.nextOrder]);
          }
          await connection.commit();
        } catch (error) { await connection.rollback(); throw error; }
        finally { connection.release(); }
      }
      return sendJson(res, 201, item);
    } catch (error) {
      if (error.message === 'INVALID_JSON') return sendJson(res, 400, { error: 'Não foi possível ler os dados enviados. Tente novamente.' });
      if (error.message === 'BODY_TOO_LARGE') return sendJson(res, 413, { error: 'Os dados enviados excedem o tamanho permitido.' });
      console.error('[DB POST lista]', error.message);
      return sendJson(res, 503, {
        error: 'Não foi possível salvar a música. Tente novamente em instantes.'
      });
    }
  }

  return false;
}

function serveStatic(req, res, url) {
  let decodedPath;
  try { decodedPath = decodeURIComponent(url.pathname); }
  catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad Request');
  }

  const relative = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const legacy = { 'Taylor_Swift.html': 'Taylor Swift', 'Twenty_One_Pilots.html': 'Twenty One Pilots', 'Sombr.html': 'Sombr', 'Harry_Styles.html': 'Harry Styles', 'Dominic_Fike.html': 'Dominic Fike', 'Olivia_Dean.html': 'Olivia Dean', 'Milo_J.html': 'Milo J', 'Laufey.html': 'Laufey', 'Imagine_Dragons.html': 'Imagine Dragons', 'Billie_Eilish.html': 'Billie Eilish', 'Bad_Bunny.html': 'Bad Bunny', 'Bruno_Mars.html': 'Bruno Mars', 'Cor.html': 'Coldplay' };
  if (legacy[relative]) { res.writeHead(302, { Location: '/index.html?q=' + encodeURIComponent(legacy[relative]) + '&filter=artist' }); return res.end(); }
  // Explicit public allowlist: never expose .env, server code, SQL or dependencies.
  const publicFile = /^(index\.html|artist\.html|form\.html|library\.html|app\.css|script\/(app|form|api|music-data|runtime-config)\.js|Imagens\/[a-zA-Z0-9_.-]+\.(png|jpg|jpeg|webp|svg))$/.test(relative);
  if (!publicFile || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404); return res.end('Arquivo não encontrado');
  }
  let filePath = path.resolve(ROOT, relative);
  const rootPrefix = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (filePath !== ROOT && !filePath.startsWith(rootPrefix)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('404 - Arquivo não encontrado');
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:; frame-src https://open.spotify.com; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  if (!['127.0.0.1', 'localhost', '[::1]'].includes((req.headers.host || '').replace(/:\d+$/, ''))) { res.writeHead(403); return res.end('Host inválido'); }
  if (req.method === 'POST' && (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`))) return sendJson(res, 403, { error: 'Origem não permitida.' });
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`); }
  catch {
    res.writeHead(400);
    return res.end('Bad Request');
  }

  if (url.pathname.startsWith('/api/')) {
    try {
      const handled = await routeApi(req, res, url);
      if (handled !== false) return;
      return sendJson(res, 404, { error: 'Rota não encontrada.' });
    } catch (error) {
      console.error('[API fatal]', error);
      return sendJson(res, 500, { error: 'Não foi possível concluir esta ação. Tente novamente.' });
    }
  }

  serveStatic(req, res, url);
});

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`\nPopReport: http://127.0.0.1:${PORT}`);
  console.log(`Spotify API: ${spotifyConfigured() ? 'configurada' : 'não configurada'}`);
  const status = await getDbStatus();
  console.log(`MySQL: ${status.connected ? `conectado (${DB_NAME})` : 'não conectado'}`);
  if (!status.connected) console.log('  Verifique se o MySQL está iniciado, confira o .env e execute npm run db:setup.');
  console.log('');
});

process.on('SIGINT', async () => {
  if (dbPool) await dbPool.end().catch(() => {});
  process.exit(0);
});
