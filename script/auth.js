// Entrar / criar conta (nome, e-mail e senha) via Supabase Auth. Sem Google e sem recuperação de senha.
(function (root) {
  'use strict';
  const cloud = root.PopReportCloud;
  if (!cloud || !root.POPREPORT_SUPABASE || !document.querySelector('nav')) return;
  const nav = document.querySelector('nav');
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'pill auth-btn'; btn.textContent = 'Entrar';
  nav.append(btn);

  const dlg = document.createElement('dialog');
  dlg.className = 'auth-dialog';
  dlg.innerHTML = `<button class="close" type="button" aria-label="Fechar">×</button>
    <h2 id="authTitle">Entrar</h2>
    <form id="authForm" novalidate>
      <div data-only="signup"><label for="authName">Nome de usuário</label><input id="authName" maxlength="100" autocomplete="username" placeholder="Seu nome"></div>
      <label for="authEmail">E-mail</label><input id="authEmail" type="email" maxlength="254" autocomplete="email" required>
      <label for="authPass">Senha</label><input id="authPass" type="password" minlength="8" maxlength="72" autocomplete="current-password" required>
      <p class="hint" data-only="signup">Mínimo de 8 caracteres. Não há recuperação de senha por enquanto: guarde a sua.</p>
      <button class="primary" id="authSubmit">Entrar</button>
      <p id="authMsg" role="status"></p>
      <button type="button" class="link" id="authSwitch">Não tem conta? Criar conta</button>
    </form>
    <div id="authUser" hidden><p id="authWho"></p><button type="button" class="primary" id="authOut">Sair</button></div>`;
  document.body.append(dlg);
  const $ = s => dlg.querySelector(s);
  let mode = 'signin';

  function render() {
    const signup = mode === 'signup';
    $('#authTitle').textContent = signup ? 'Criar conta' : 'Entrar';
    $('#authSubmit').textContent = signup ? 'Criar conta' : 'Entrar';
    $('#authSwitch').textContent = signup ? 'Já tem conta? Entrar' : 'Não tem conta? Criar conta';
    $('#authPass').autocomplete = signup ? 'new-password' : 'current-password';
    dlg.querySelectorAll('[data-only=signup]').forEach(el => { el.hidden = !signup; });
    $('#authMsg').textContent = ''; $('#authMsg').className = '';
  }
  async function refresh() {
    const on = await cloud.ready();
    btn.textContent = on ? 'Minha conta' : 'Entrar';
    $('#authForm').hidden = on; $('#authUser').hidden = !on;
    if (on) {
      try { const c = await cloud.collection(); $('#authWho').textContent = `Conectado como ${c.profile.name}.`; } catch { $('#authWho').textContent = 'Conectado.'; }
    }
  }
  btn.onclick = async () => { await refresh(); render(); dlg.showModal(); };
  $('.close').onclick = () => dlg.close();
  $('#authSwitch').onclick = () => { mode = mode === 'signup' ? 'signin' : 'signup'; render(); };
  $('#authOut').onclick = () => { cloud.signOut(); location.reload(); };
  $('#authForm').onsubmit = async e => {
    e.preventDefault();
    const msg = $('#authMsg'), submit = $('#authSubmit');
    msg.className = ''; msg.textContent = ''; submit.disabled = true;
    try {
      if (mode === 'signup') {
        const r = await cloud.signUp($('#authName').value, $('#authEmail').value, $('#authPass').value);
        if (!r.loggedIn) { msg.className = 'success'; msg.textContent = 'Conta criada. Confirme o e-mail enviado e depois entre.'; mode = 'signin'; return; }
      } else await cloud.signIn($('#authEmail').value, $('#authPass').value);
      location.reload();
    } catch (error) { msg.className = 'error'; msg.textContent = error.message; }
    finally { submit.disabled = false; }
  };
  render(); refresh();
})(globalThis);
