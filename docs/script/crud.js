// Tela "Gerenciar": CRUD de playlists, artistas, álbuns, músicas, gêneros e perfil (cada usuário edita só o que é seu).
(function (root) {
  'use strict';
  const cloud = root.PopReportCloud;
  if (!cloud || !root.POPREPORT_SUPABASE) return;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const https = v => !v || /^https:\/\//.test(v);

  // Cada entidade: tabela, campos do formulário e como mostrar a linha.
  const ENTITIES = {
    playlists: { label: 'Playlists', table: 'playlists', own: () => true, title: r => r.name, sub: r => r.description || '',
      fields: [{ k: 'name', l: 'Nome', max: 120, req: 1 }, { k: 'description', l: 'Descrição', max: 300 }] },
    artists: { label: 'Artistas', table: 'artists', title: r => r.name, sub: r => `${r.source}${r.image_url ? ' · com foto' : ''}`,
      fields: [{ k: 'name', l: 'Nome', max: 160, req: 1 }, { k: 'image_url', l: 'Foto (link https)', max: 500, url: 1 }] },
    albums: { label: 'Álbuns', table: 'albums', title: r => r.title, sub: r => `${r.artists?.name || ''} · ${r.release_date || 's/ data'}`, select: '*,artists(name)',
      fields: [{ k: 'artist_id', l: 'Artista', ref: 'artists', refLabel: 'name', req: 1 }, { k: 'title', l: 'Título', max: 200, req: 1 }, { k: 'release_date', l: 'Lançamento (AAAA ou AAAA-MM-DD)', max: 10, pattern: /^\d{4}(-\d{2}(-\d{2})?)?$/ }, { k: 'image_url', l: 'Capa (link https)', max: 500, url: 1 }] },
    tracks: { label: 'Músicas', table: 'tracks', title: r => r.title, sub: r => `${r.albums?.title || ''} · ${Math.round((r.duration_ms || 0) / 1000)}s`, select: '*,albums(title)',
      fields: [{ k: 'album_id', l: 'Álbum', ref: 'albums', refLabel: 'title', req: 1 }, { k: 'title', l: 'Título', max: 200, req: 1 }, { k: 'track_number', l: 'Faixa nº', type: 'number', min: 0, max: 999 }, { k: 'duration_ms', l: 'Duração (segundos)', type: 'number', min: 0, max: 7200, scale: 1000 }, { k: 'url', l: 'Link (https)', max: 500, url: 1 }] },
    genres: { label: 'Gêneros', table: 'genres', title: r => r.name, sub: () => '',
      fields: [{ k: 'name', l: 'Nome', max: 80, req: 1 }] },
    profile: { label: 'Perfil', special: true }
  };
  let current = 'playlists', editing = null, me = null, refCache = {};

  const section = document.createElement('section');
  section.id = 'screen-manage'; section.dataset.screenView = 'manage'; section.hidden = true; section.className = 'manage';
  section.innerHTML = `<section class="hero compact"><p class="eyebrow">Gerenciar</p><h1>Seus dados.</h1><p>Crie, edite e apague playlists, artistas, álbuns, músicas e gêneros. Você só altera o que é seu; o catálogo inicial é somente leitura.</p></section>
    <div class="filters" id="manageTabs" role="tablist"></div>
    <p id="manageMsg" role="status"></p>
    <form id="manageForm" class="form-card" novalidate></form>
    <div id="manageList"></div>`;
  document.querySelector('main').append(section);
  const $ = s => section.querySelector(s);

  const link = document.createElement('a');
  link.href = './'; link.dataset.screen = 'manage'; link.textContent = 'Gerenciar'; link.hidden = true;
  document.querySelector('nav').insertBefore(link, document.querySelector('nav .auth-btn') || null);
  cloud.ready().then(on => { link.hidden = !on; });

  function say(text, bad) { const m = $('#manageMsg'); m.textContent = text || ''; m.className = bad ? 'error' : text ? 'success' : ''; }

  function tabs() {
    $('#manageTabs').innerHTML = Object.entries(ENTITIES).map(([k, e]) => `<button type="button" role="tab" data-tab="${k}" aria-pressed="${k === current}">${e.label}</button>`).join('');
  }
  async function refOptions(name) {
    const ent = ENTITIES[name];
    refCache[name] = await cloud.crud.list(ent.table, 'id,' + (name === 'artists' ? 'name' : 'title'));
    return refCache[name];
  }
  async function renderForm(row) {
    const ent = ENTITIES[current], form = $('#manageForm');
    if (ent.special) return;
    const parts = [];
    for (const f of ent.fields) {
      const id = `mf_${f.k}`;
      if (f.ref) {
        const opts = refCache[f.ref] || await refOptions(f.ref);
        parts.push(`<label for="${id}">${f.l}</label><select id="${id}" ${f.req ? 'required' : ''}><option value="">Escolha…</option>${opts.map(o => `<option value="${o.id}" ${row && String(row[f.k]) === String(o.id) ? 'selected' : ''}>${esc(o[f.refLabel])}</option>`).join('')}</select>`);
      } else {
        const val = row ? (f.scale ? Math.round((row[f.k] || 0) / f.scale) : row[f.k] ?? '') : '';
        parts.push(`<label for="${id}">${f.l}</label><input id="${id}" type="${f.type || 'text'}" ${f.max && !f.type ? `maxlength="${f.max}"` : ''} ${f.type === 'number' ? `min="${f.min}" max="${f.max}"` : ''} value="${esc(val)}" ${f.req ? 'required' : ''}>`);
      }
    }
    form.innerHTML = `<h2>${row ? 'Editar' : 'Novo'} · ${ent.label}</h2>${parts.join('')}<button class="primary">${row ? 'Salvar alterações' : 'Criar'}</button>${row ? ' <button type="button" class="pill" id="manageCancel">Cancelar</button>' : ''}`;
    $('#manageCancel')?.addEventListener('click', () => { editing = null; renderForm(null); });
  }
  function readForm() {
    const ent = ENTITIES[current], out = {};
    for (const f of ent.fields) {
      const el = $(`#mf_${f.k}`); let v = String(el.value).trim();
      if (f.req && !v) throw new Error(`Preencha: ${f.l}.`);
      if (f.url && !https(v)) throw new Error(`${f.l} deve começar com https://`);
      if (f.pattern && v && !f.pattern.test(v)) throw new Error(`Formato inválido em: ${f.l}.`);
      if (f.type === 'number') { const n = Number(v || 0); if (!Number.isFinite(n) || n < f.min || n > f.max) throw new Error(`${f.l}: valor entre ${f.min} e ${f.max}.`); out[f.k] = Math.round(n * (f.scale || 1)); }
      else if (f.ref) out[f.k] = Number(v);
      else out[f.k] = v === '' ? null : v;
    }
    return out;
  }
  async function renderList() {
    const ent = ENTITIES[current], box = $('#manageList');
    if (ent.special) return renderProfile();
    box.innerHTML = '<p class="hint">Carregando…</p>';
    try {
      const rows = await cloud.crud.list(ent.table, ent.select || '*');
      box.innerHTML = rows.length ? `<h2>${ent.label} (${rows.length})</h2><div class="tracks">${rows.map(r => {
        const mine = ent.own ? ent.own(r) : r.owner_id && r.owner_id === me;
        return `<div class="track"><div class="track-info"><strong>${esc(ent.title(r))}</strong><small>${esc(ent.sub(r))}${mine ? '' : ' · somente leitura'}</small></div>${mine ? `<button type="button" class="pill" data-edit="${r.id}">Editar</button> <button type="button" class="pill" data-del="${r.id}">Apagar</button>` : ''}</div>`;
      }).join('')}</div>` : `<p class="hint">Nada por aqui ainda. Use o formulário para criar.</p>`;
      box.rows = rows;
    } catch (e) { box.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
  }
  async function renderProfile() {
    $('#manageForm').innerHTML = `<h2>Meu perfil</h2><label for="pfName">Nome de usuário</label><input id="pfName" maxlength="100" required><button class="primary">Salvar nome</button>`;
    try { const c = await cloud.collection(); $('#pfName').value = c.profile.name; } catch { /* mantém vazio */ }
    $('#manageList').innerHTML = '<p class="hint">O e-mail e a senha são os da sua conta. O nome precisa ser único.</p>';
  }
  async function open() {
    me = cloud.userId(); editing = null; refCache = {}; say('');
    if (!(await cloud.ready())) { section.querySelector('#manageList').innerHTML = '<p class="error">Entre na sua conta para gerenciar seus dados.</p>'; $('#manageForm').innerHTML = ''; return; }
    tabs(); await renderForm(null); await renderList();
  }

  section.addEventListener('click', async e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { current = tab.dataset.tab; editing = null; say(''); tabs(); await renderForm(null); await renderList(); return; }
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    const rows = $('#manageList').rows || [];
    if (ed) { editing = rows.find(r => String(r.id) === ed.dataset.edit); await renderForm(editing); $('#manageForm').scrollIntoView?.({ behavior: 'smooth', block: 'center' }); }
    if (del) {
      const row = rows.find(r => String(r.id) === del.dataset.del);
      if (!row || !confirm(`Apagar "${ENTITIES[current].title(row)}"? Esta ação não pode ser desfeita.`)) return;
      try { await cloud.crud.remove(ENTITIES[current].table, row.id); delete refCache[current]; say('Apagado.'); await renderList(); } catch (err) { say(err.message, true); }
    }
  });
  section.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      if (current === 'profile') {
        const name = $('#pfName').value.trim();
        if (name.length < 2) throw new Error('Use de 2 a 100 caracteres.');
        await cloud.saveProfile(name); say('Nome atualizado.'); return;
      }
      const row = readForm(), t = ENTITIES[current].table;
      if (editing) await cloud.crud.update(t, editing.id, row); else await cloud.crud.create(t, row);
      say(editing ? 'Alterações salvas.' : 'Criado com sucesso.');
      editing = null; delete refCache[current]; await renderForm(null); await renderList();
    } catch (err) { say(err.message, true); }
  });
  root.PopReportCrud = { open };
  if (new URLSearchParams(location.search).get('screen') === 'manage') {
    document.querySelectorAll('[data-screen-view]').forEach(s => { s.hidden = s !== section; });
    open();
  }
})(globalThis);
