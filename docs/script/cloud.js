// Cliente mínimo do Supabase (Auth por e-mail/senha + PostgREST) para o PopReport online.
// Usa apenas a chave pública (publishable); as regras de acesso ficam no banco (RLS).
(function (root) {
  'use strict';
  const cfg = root.POPREPORT_SUPABASE;
  const SESSION_KEY = 'popreport.sb.session.v1';
  let session = null;
  let readyPromise = null;

  function readSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (saved?.access_token && saved?.refresh_token && saved?.expires_at) return saved;
    } catch { /* armazenamento indisponível */ }
    return null;
  }
  function keepSession(next) {
    session = { access_token: next.access_token, refresh_token: next.refresh_token, expires_at: next.expires_at || Math.floor(Date.now() / 1000) + Number(next.expires_in || 3600) };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* sessão só desta aba */ }
    return session;
  }
  async function auth(path, body) {
    const response = await fetch(`${cfg.url}/auth/v1/${path}`, {
      method: 'POST',
      headers: { apikey: cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.msg || data.error_description || 'auth'); error.status = response.status; throw error; }
    return data;
  }
  async function ensureSession() {
    session = session || readSession();
    const now = Math.floor(Date.now() / 1000);
    if (session && session.expires_at - 60 > now) return session;
    if (session) {
      try { return keepSession(await auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token })); }
      catch (error) { if (!error.status || error.status >= 500) throw error; session = null; }
    }
    const error = new Error('login'); error.status = 401; throw error;
  }
  function authMessage(error) {
    const t = String(error?.message || '');
    if (/already registered|already been registered/i.test(t)) return 'Este e-mail já tem uma conta.';
    if (/invalid login|invalid_credentials/i.test(t)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(t)) return 'Confirme seu e-mail antes de entrar.';
    if (/password/i.test(t)) return 'Use uma senha com pelo menos 8 caracteres.';
    if (/valid email|invalid.*email/i.test(t)) return 'E-mail inválido.';
    if (/rate|too many/i.test(t)) return 'Muitas tentativas. Aguarde um pouco.';
    return 'Não foi possível concluir. Tente novamente.';
  }
  const emailOk = v => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(v) && v.length <= 254;
  async function signUp(name, email, password) {
    name = String(name || '').trim(); email = String(email || '').trim().toLowerCase();
    if (name.length < 2 || name.length > 100) throw new Error('Use um nome de 2 a 100 caracteres.');
    if (!emailOk(email)) throw new Error('E-mail inválido.');
    if (String(password).length < 8 || String(password).length > 72) throw new Error('Use uma senha de 8 a 72 caracteres.');
    const free = await fetch(`${cfg.url}/rest/v1/rpc/username_available`, { method: 'POST', headers: { apikey: cfg.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_name: name }), signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : true).catch(() => true);
    if (free === false) throw new Error('Este nome de usuário já está em uso.');
    let data;
    try { data = await auth('signup', { email, password, data: { name } }); } catch (error) { throw new Error(authMessage(error)); }
    if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) throw new Error('Este e-mail já tem uma conta.');
    if (data.access_token) { keepSession(data); readyPromise = null; return { loggedIn: true }; }
    return { loggedIn: false };
  }
  async function signIn(email, password) {
    let data;
    try { data = await auth('token?grant_type=password', { email: String(email || '').trim().toLowerCase(), password: String(password || '') }); } catch (error) { throw new Error(authMessage(error)); }
    keepSession(data); readyPromise = null;
  }
  function signOut() {
    session = null; readyPromise = null;
    try { localStorage.removeItem(SESSION_KEY); } catch { /* nada a limpar */ }
  }
  function friendly(data) {
    const text = `${data?.message || ''} ${data?.hint || ''}`;
    if (data?.code === '23505') return /profiles_display_name/.test(text + (data?.details || '')) ? 'Este nome de usuário já está em uso.' : /playlists/.test(text) ? 'Você já tem uma playlist com esse nome.' : 'Já existe um registro igual.';
    if (data?.code === '23503') return 'Este registro está em uso por outro e não pode ser removido.';
    if (data?.code === '23514') return 'Algum campo tem valor inválido (links precisam começar com https://).';
    if (/playlist_full/.test(text)) return 'Esta playlist atingiu o limite de 500 músicas.';
    if (/playlist_not_found/.test(text)) return 'Escolha uma playlist da sua coleção.';
    if (data?.code === '42501') return 'Limite de playlists atingido ou ação não permitida.';
    return 'Não foi possível concluir esta ação. Tente novamente.';
  }
  async function rest(path, { method = 'GET', body, prefer } = {}) {
    const current = await ensureSession();
    const response = await fetch(`${cfg.url}/rest/v1/${path}`, {
      method,
      headers: { apikey: cfg.key, Authorization: `Bearer ${current.access_token}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) throw new Error(friendly(data));
    return data;
  }

  const trackKey = row => `${row.source}:${row.external_id}`;

  async function collection() {
    const [profile, playlists, links] = await Promise.all([
      rest('profiles?select=display_name&limit=1'),
      rest('playlists?select=id,name,description&order=id.asc&limit=100'),
      rest('playlist_tracks?select=playlist_id,track_id,position,tracks(source,external_id)&order=position.asc&limit=5000')
    ]);
    return {
      profile: { name: profile?.[0]?.display_name || 'Visitante' },
      playlists: (playlists || []).map(p => {
        const own = (links || []).filter(l => l.playlist_id === p.id && l.tracks);
        return { id: p.id, name: p.name, description: p.description || '', songIds: own.map(l => l.track_id), trackKeys: own.map(l => trackKey(l.tracks)) };
      })
    };
  }
  async function songs() {
    const rows = await rest('playlist_tracks?select=added_at,tracks(id,source,external_id,title,duration_ms,url,albums(title,image_url,release_date,artists(name,external_id,image_url)))&order=added_at.desc&limit=1000');
    const seen = new Set();
    const out = [];
    for (const row of rows || []) {
      const t = row.tracks;
      if (!t || seen.has(t.id)) continue;
      seen.add(t.id);
      out.push({
        id: t.id, source: t.source, externalId: t.external_id, artistId: t.albums?.artists?.external_id || '',
        artist: t.albums?.artists?.name || '', track: t.title, album: t.albums?.title || '', image: t.albums?.image_url || '',
        duration: Math.round(Number(t.duration_ms || 0) / 1000), url: t.url || '', genre: '', createdAt: row.added_at
      });
      if (out.length >= 500) break;
    }
    return out;
  }
  const saveProfile = name => rest('profiles?on_conflict=owner_id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { display_name: name } });
  const createPlaylist = (name, description) => rest('playlists', { method: 'POST', prefer: 'return=minimal', body: { name, description: description || null } });
  const addTrack = (playlistId, payload) => rest('rpc/add_track_to_playlist', { method: 'POST', body: { p_playlist_id: Number(playlistId), p: payload } });

  // true quando há configuração pública e o usuário entrou com e-mail e senha.
  function ready() {
    readyPromise ||= (async () => {
      if (!cfg?.url || !cfg?.key) return false;
      try { await ensureSession(); return true; } catch { return false; }
    })();
    return readyPromise;
  }
    function userId() {
    try { return JSON.parse(atob(String(session?.access_token || readSession()?.access_token || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || null; } catch { return null; }
  }
  // CRUD genérico (a segurança fica nas políticas RLS do banco).
  const crud = {
    list: (table, select = '*') => rest(`${table}?select=${select}&order=id.desc&limit=200`),
    create: (table, row) => rest(table, { method: 'POST', prefer: 'return=minimal', body: row }),
    update: (table, id, row) => rest(`${table}?id=eq.${Number(id)}`, { method: 'PATCH', prefer: 'return=minimal', body: row }),
    remove: (table, id) => rest(`${table}?id=eq.${Number(id)}`, { method: 'DELETE', prefer: 'return=minimal' })
  };
  root.PopReportCloud = { crud, userId, ready, signUp, signIn, signOut, collection, songs, saveProfile, createPlaylist, addTrack };
})(globalThis);
