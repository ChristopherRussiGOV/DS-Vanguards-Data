/* DS-Vanguards© Panel — app.js */
'use strict';

// ─── Config ───────────────────────────────────────────────────────────────────
const API = '';   // same origin, Vercel routes /api/* automatically
let TOKEN = localStorage.getItem('vgs_token') || null;
let CURRENT_USER = null;
let CURRENT_TABLE = null;
let CURRENT_TABLE_COLS = [];
let PENDING_COLS = [];

const ROLE_LEVELS = { membro: 1, staff: 2, moderador: 3, admin: 4 };
function hasRole(min) {
  if (!CURRENT_USER) return false;
  return (ROLE_LEVELS[CURRENT_USER.role] || 0) >= (ROLE_LEVELS[min] || 99);
}

// ─── API helper ───────────────────────────────────────────────────────────────
async function api(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (TOKEN) opts.headers['Authorization'] = 'Bearer ' + TOKEN;
  if (body) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(API + path, opts);
  } catch (netErr) {
    throw new Error('Sem conexão com o servidor. Verifique se o site está hospedado corretamente no Vercel.');
  }

  let data;
  try {
    data = await res.json();
  } catch {
    const text = await res.text().catch(() => '');
    throw new Error(`Resposta inválida do servidor (HTTP ${res.status}): ${text.slice(0, 100)}`);
  }

  if (!res.ok) {
    throw new Error(data.error || `Erro HTTP ${res.status}`);
  }
  return data;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info', dur = 3500) {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), dur);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ─── Login tabs ───────────────────────────────────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  const idx = tabId === 'tab-login' ? 0 : 1;
  document.querySelectorAll('.login-tab')[idx].classList.add('active');
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  if (!username || !password) { showErr(errEl, 'Preencha todos os campos'); return; }

  const btn = document.getElementById('btn-login');
  btn.innerHTML = '<span class="spinner"></span> Entrando...';
  btn.disabled = true;

  try {
    const data = await api('/api/auth?action=login', 'POST', { username, password });
    TOKEN = data.token;
    localStorage.setItem('vgs_token', TOKEN);
    CURRENT_USER = data.user;
    enterApp();
  } catch (e) {
    showErr(errEl, e.message);
  } finally {
    btn.innerHTML = '<span>⚡</span> Entrar no Painel';
    btn.disabled = false;
  }
}

async function doRegister() {
  const username = document.getElementById('reg-user').value.trim();
  const password = document.getElementById('reg-pass').value;
  const password2 = document.getElementById('reg-pass2').value;
  const errEl = document.getElementById('reg-error');
  const okEl  = document.getElementById('reg-success');
  errEl.style.display = 'none';
  okEl.style.display = 'none';

  if (!username || !password) { showErr(errEl, 'Preencha todos os campos'); return; }
  if (password !== password2) { showErr(errEl, 'As senhas não coincidem'); return; }

  const btn = document.getElementById('btn-register');
  btn.disabled = true;

  try {
    await api('/api/auth?action=register', 'POST', { username, password });
    okEl.style.display = 'flex';
    okEl.textContent = '✅ Conta criada! Faça login.';
    setTimeout(() => switchTab('tab-login'), 1800);
  } catch (e) {
    showErr(errEl, e.message);
  } finally {
    btn.disabled = false;
  }
}

function doLogout() {
  TOKEN = null;
  CURRENT_USER = null;
  localStorage.removeItem('vgs_token');
  document.getElementById('app-page').style.display = 'none';
  document.getElementById('login-page').classList.add('active');
}

function showErr(el, msg) {
  el.style.display = 'flex';
  el.textContent = '⚠️ ' + msg;
}

// ─── Enter App ────────────────────────────────────────────────────────────────
async function enterApp() {
  document.getElementById('login-page').classList.remove('active');
  document.getElementById('app-page').style.display = 'block';

  // If no CURRENT_USER (page reload), fetch from token
  if (!CURRENT_USER) {
    try {
      const d = await api('/api/auth?action=me');
      CURRENT_USER = d.user;
    } catch {
      doLogout(); return;
    }
  }

  updateSidebar();
  setDateTicker();
  navigate('dashboard');
}

function updateSidebar() {
  const u = CURRENT_USER;
  const initial = (u.username[0] || '?').toUpperCase();
  document.getElementById('sidebar-avatar').textContent = initial;
  document.getElementById('sidebar-username').textContent = u.username;

  const roleEl = document.getElementById('sidebar-role-badge');
  const topRoleEl = document.getElementById('topbar-user-role');
  const roleLabels = {
    membro: '🟦 Membro', staff: '🟩 Staff',
    moderador: '🟨 Moderador', admin: '🟥 Admin'
  };
  roleEl.textContent = roleLabels[u.role] || u.role;
  roleEl.className = `role-badge role-${u.role}`;
  topRoleEl.textContent = roleLabels[u.role] || u.role;
  topRoleEl.className = `role-badge role-${u.role}`;

  // Show admin-only nav items
  if (hasRole('admin')) {
    document.getElementById('nav-admin-label').style.display = '';
    document.getElementById('nav-users').style.display = '';
  }
}

function setDateTicker() {
  const el = document.getElementById('topbar-date');
  function tick() {
    el.textContent = new Date().toLocaleString('pt-BR');
  }
  tick();
  setInterval(tick, 1000);
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function navigate(page) {
  // Hide all pages
  ['dashboard','database','users'].forEach(p => {
    document.getElementById('page-' + p).style.display = 'none';
  });
  // Deactivate nav items
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  document.getElementById('page-' + page).style.display = '';
  const navEl = document.getElementById('nav-' + page);
  if (navEl) navEl.classList.add('active');

  const titles = {
    dashboard: '📊 Dashboard',
    database: '🗄️ Banco de Dados',
    users: '👥 Usuários'
  };
  document.getElementById('topbar-title').textContent = titles[page] || page;

  if (page === 'dashboard') loadDashboard();
  if (page === 'database') loadTables();
  if (page === 'users') loadUsers();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [tablesData, usersData] = await Promise.all([
      api('/api/tables'),
      hasRole('admin') ? api('/api/users') : Promise.resolve({ users: [] })
    ]);

    const tables = tablesData.tables || [];
    document.getElementById('stat-tables').textContent = tables.length;
    document.getElementById('stat-users').textContent = usersData.users.length || '—';

    // Count total rows
    let total = 0;
    await Promise.all(tables.map(async t => {
      try {
        const d = await api(`/api/rows?table_id=${t.id}`);
        total += (d.rows || []).length;
      } catch {}
    }));
    document.getElementById('stat-rows').textContent = total;

    const rLabels = { membro: 'Membro', staff: 'Staff', moderador: 'Mod', admin: 'Admin' };
    document.getElementById('stat-role-level').textContent = rLabels[CURRENT_USER.role] || '—';
  } catch (e) {
    console.error(e);
  }
}

// ─── Tables ───────────────────────────────────────────────────────────────────
async function loadTables() {
  document.getElementById('db-table-list').style.display = '';
  document.getElementById('db-table-detail').style.display = 'none';

  if (hasRole('staff')) {
    document.getElementById('btn-create-table').style.display = '';
  }

  const container = document.getElementById('tables-container');
  container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

  try {
    const data = await api('/api/tables');
    const tables = data.tables || [];

    if (tables.length === 0) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-icon">🗄️</div>
        <div class="empty-text">Nenhuma tabela criada ainda${hasRole('staff') ? '. Clique em "Nova Tabela" para começar.' : '.'}</div>
      </div>`;
      return;
    }

    container.innerHTML = `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Nome</th><th>Colunas</th><th>Criada por</th><th>Data</th><th>Ações</th>
          </tr></thead>
          <tbody>
            ${tables.map(t => `
              <tr>
                <td><strong>${esc(t.table_name)}</strong></td>
                <td><div class="col-tags">${(t.columns||[]).map(c=>`<span class="col-tag">${esc(c.name)}</span>`).join('')}</div></td>
                <td>${esc(t.owner_name || '—')}</td>
                <td>${new Date(t.created_at).toLocaleDateString('pt-BR')}</td>
                <td class="actions">
                  <button class="btn btn-secondary btn-sm btn-icon" onclick="openTable(${t.id})" title="Abrir">👁</button>
                  ${hasRole('moderador') ? `<button class="btn btn-danger btn-sm btn-icon" onclick="confirmDeleteTableById(${t.id}, '${esc(t.table_name)}')" title="Excluir">🗑</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) {
    container.innerHTML = `<div class="alert alert-error">❌ ${e.message}</div>`;
  }
}

async function openTable(tableId) {
  document.getElementById('db-table-list').style.display = 'none';
  document.getElementById('db-table-detail').style.display = '';
  CURRENT_TABLE = tableId;

  document.getElementById('table-detail-content').innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

  if (hasRole('staff')) document.getElementById('btn-add-row').style.display = '';
  if (hasRole('moderador')) document.getElementById('btn-delete-table').style.display = '';

  await loadTableDetail();
}

async function loadTableDetail() {
  const content = document.getElementById('table-detail-content');
  try {
    const data = await api(`/api/rows?table_id=${CURRENT_TABLE}`);
    const table = data.table;
    const rows = data.rows || [];
    CURRENT_TABLE_COLS = table.columns || [];

    document.getElementById('detail-title').innerHTML = `📋 <span class="title-accent">${esc(table.table_name)}</span>`;
    document.getElementById('btn-delete-table').dataset.tableId = CURRENT_TABLE;
    document.getElementById('btn-delete-table').dataset.tableName = table.table_name;

    if (rows.length === 0) {
      content.innerHTML = `
        <div class="alert alert-info" style="margin-bottom:16px">ℹ️ Colunas: ${CURRENT_TABLE_COLS.map(c=>`<strong>${c.name}</strong> (${c.type})`).join(', ')}</div>
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <div class="empty-text">Nenhum dado${hasRole('staff') ? '. Clique em "+ Linha" para adicionar.' : '.'}</div>
        </div>`;
      return;
    }

    content.innerHTML = `
      <div class="alert alert-info" style="margin-bottom:12px">ℹ️ ${rows.length} registro(s) | ${CURRENT_TABLE_COLS.length} coluna(s)</div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>#</th>
            ${CURRENT_TABLE_COLS.map(c => `<th>${esc(c.name)}<br><small style="color:var(--text-muted);font-size:10px">${c.type}</small></th>`).join('')}
            <th>Ações</th>
          </tr></thead>
          <tbody>
            ${rows.map((row, i) => `
              <tr>
                <td style="color:var(--text-muted)">${i+1}</td>
                ${CURRENT_TABLE_COLS.map(c => `<td>${esc(String(row.data[c.name] ?? ''))}</td>`).join('')}
                <td class="actions">
                  ${hasRole('staff') ? `<button class="btn btn-secondary btn-sm btn-icon" onclick="openEditRow(${row.id}, ${escJson(row.data)})" title="Editar">✏️</button>` : ''}
                  ${hasRole('moderador') ? `<button class="btn btn-danger btn-sm btn-icon" onclick="confirmDeleteRow(${row.id})" title="Excluir">🗑</button>` : ''}
                  ${!hasRole('staff') ? '<span style="color:var(--text-muted);font-size:11px">👁 só leitura</span>' : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) {
    content.innerHTML = `<div class="alert alert-error">❌ ${e.message}</div>`;
  }
}

function backToTableList() {
  CURRENT_TABLE = null;
  document.getElementById('btn-add-row').style.display = 'none';
  document.getElementById('btn-delete-table').style.display = 'none';
  loadTables();
}

// ─── Create Table Modal ───────────────────────────────────────────────────────
function openCreateTableModal() {
  PENDING_COLS = [];
  document.getElementById('new-table-name').value = '';
  document.getElementById('new-col-name').value = '';
  document.getElementById('new-cols-list').innerHTML = '';
  openModal('modal-create-table');
}

function addColumnToNew() {
  const name = document.getElementById('new-col-name').value.trim();
  const type = document.getElementById('new-col-type').value;
  if (!name) { toast('Digite o nome da coluna', 'warning'); return; }
  if (PENDING_COLS.find(c => c.name === name)) { toast('Coluna já adicionada', 'warning'); return; }

  PENDING_COLS.push({ name, type });
  document.getElementById('new-col-name').value = '';
  renderPendingCols();
}

function removeCol(idx) {
  PENDING_COLS.splice(idx, 1);
  renderPendingCols();
}

function renderPendingCols() {
  document.getElementById('new-cols-list').innerHTML = PENDING_COLS.map((c, i) =>
    `<span class="col-tag">${esc(c.name)} <em style="opacity:.6">(${c.type})</em> <span class="remove-btn" onclick="removeCol(${i})">✕</span></span>`
  ).join('');
}

async function submitCreateTable() {
  const name = document.getElementById('new-table-name').value.trim();
  if (!name) { toast('Digite o nome da tabela', 'warning'); return; }
  if (PENDING_COLS.length === 0) { toast('Adicione ao menos uma coluna', 'warning'); return; }

  try {
    await api('/api/tables', 'POST', { table_name: name, columns: PENDING_COLS });
    closeModal('modal-create-table');
    toast('Tabela criada com sucesso!', 'success');
    loadTables();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ─── Delete Table ─────────────────────────────────────────────────────────────
function confirmDeleteTable() {
  const btn = document.getElementById('btn-delete-table');
  confirmDeleteTableById(btn.dataset.tableId, btn.dataset.tableName);
}

function confirmDeleteTableById(id, name) {
  document.getElementById('confirm-msg').textContent = `Tem certeza que deseja excluir a tabela "${name}" e todos os seus dados?`;
  document.getElementById('confirm-ok-btn').onclick = async () => {
    try {
      await api('/api/tables', 'DELETE', { id: parseInt(id) });
      closeModal('modal-confirm');
      toast('Tabela excluída', 'success');
      if (CURRENT_TABLE) backToTableList();
      else loadTables();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  openModal('modal-confirm');
}

// ─── Add Row ──────────────────────────────────────────────────────────────────
function openAddRowModal() {
  const fields = document.getElementById('add-row-fields');
  fields.innerHTML = CURRENT_TABLE_COLS.map(c => `
    <div class="form-group">
      <label class="form-label">${esc(c.name)} <span style="color:var(--text-muted);font-size:10px">(${c.type})</span></label>
      <input data-col="${esc(c.name)}" type="${colInputType(c.type)}" class="form-control" placeholder="${esc(c.name)}" />
    </div>
  `).join('');
  openModal('modal-add-row');
}

function colInputType(type) {
  if (type === 'número') return 'number';
  if (type === 'data') return 'date';
  return 'text';
}

async function submitAddRow() {
  const inputs = document.querySelectorAll('#add-row-fields [data-col]');
  const data = {};
  inputs.forEach(inp => { data[inp.dataset.col] = inp.value; });

  try {
    await api('/api/rows', 'POST', { table_id: CURRENT_TABLE, data });
    closeModal('modal-add-row');
    toast('Linha adicionada!', 'success');
    loadTableDetail();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ─── Edit Row ─────────────────────────────────────────────────────────────────
let EDIT_ROW_ID = null;

function openEditRow(rowId, rowData) {
  EDIT_ROW_ID = rowId;
  const fields = document.getElementById('edit-row-fields');
  fields.innerHTML = CURRENT_TABLE_COLS.map(c => `
    <div class="form-group">
      <label class="form-label">${esc(c.name)}</label>
      <input data-col="${esc(c.name)}" type="${colInputType(c.type)}" class="form-control" value="${esc(String(rowData[c.name] ?? ''))}" />
    </div>
  `).join('');
  openModal('modal-edit-row');
}

async function submitEditRow() {
  const inputs = document.querySelectorAll('#edit-row-fields [data-col]');
  const data = {};
  inputs.forEach(inp => { data[inp.dataset.col] = inp.value; });

  try {
    await api('/api/rows', 'PUT', { id: EDIT_ROW_ID, data });
    closeModal('modal-edit-row');
    toast('Linha atualizada!', 'success');
    loadTableDetail();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ─── Delete Row ───────────────────────────────────────────────────────────────
function confirmDeleteRow(rowId) {
  document.getElementById('confirm-msg').textContent = 'Excluir esta linha permanentemente?';
  document.getElementById('confirm-ok-btn').onclick = async () => {
    try {
      await api('/api/rows', 'DELETE', { id: rowId });
      closeModal('modal-confirm');
      toast('Linha excluída', 'success');
      loadTableDetail();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  openModal('modal-confirm');
}

// ─── Users ────────────────────────────────────────────────────────────────────
async function loadUsers() {
  const container = document.getElementById('users-container');
  container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

  try {
    const data = await api('/api/users');
    const users = data.users || [];

    const roleLabels = {
      membro: '🟦 Membro', staff: '🟩 Staff',
      moderador: '🟨 Moderador', admin: '🟥 Admin'
    };

    container.innerHTML = `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>#</th><th>Usuário</th><th>Cargo</th><th>Criado em</th><th>Ações</th>
          </tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td style="color:var(--text-muted)">${u.id}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div class="user-avatar" style="width:28px;height:28px;font-size:12px;">${u.username[0].toUpperCase()}</div>
                    <strong>${esc(u.username)}</strong>
                    ${u.username === 'admin' ? '<span style="font-size:10px;color:var(--text-muted)">[fixo]</span>' : ''}
                    ${u.id === CURRENT_USER.id ? '<span style="font-size:10px;color:var(--blue-glow)">[você]</span>' : ''}
                  </div>
                </td>
                <td><span class="role-badge role-${u.role}">${roleLabels[u.role]||u.role}</span></td>
                <td>${new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
                <td class="actions">
                  <button class="btn btn-warning btn-sm" onclick="openEditUser(${u.id}, '${esc(u.username)}', '${u.role}')">✏️ Editar</button>
                  ${u.username !== 'admin' && u.id !== CURRENT_USER.id
                    ? `<button class="btn btn-danger btn-sm" onclick="confirmDeleteUser(${u.id}, '${esc(u.username)}')">🗑 Excluir</button>`
                    : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) {
    container.innerHTML = `<div class="alert alert-error">❌ ${e.message}</div>`;
  }
}

function openEditUser(id, username, role) {
  document.getElementById('edit-user-id').value = id;
  document.getElementById('edit-user-orig-name').value = username;
  document.getElementById('edit-username').value = '';
  document.getElementById('edit-password').value = '';
  document.getElementById('edit-role').value = role;
  openModal('modal-edit-user');
}

async function submitEditUser() {
  const id = parseInt(document.getElementById('edit-user-id').value);
  const username = document.getElementById('edit-username').value.trim();
  const password = document.getElementById('edit-password').value;
  const role = document.getElementById('edit-role').value;

  const payload = { id, role };
  if (username) payload.username = username;
  if (password) payload.password = password;

  try {
    await api('/api/users', 'PUT', payload);
    closeModal('modal-edit-user');
    toast('Usuário atualizado!', 'success');
    loadUsers();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function confirmDeleteUser(id, username) {
  document.getElementById('confirm-msg').textContent = `Excluir o usuário "${username}" permanentemente?`;
  document.getElementById('confirm-ok-btn').onclick = async () => {
    try {
      await api('/api/users', 'DELETE', { id });
      closeModal('modal-confirm');
      toast('Usuário excluído', 'success');
      loadUsers();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  openModal('modal-confirm');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escJson(obj) {
  return "'" + JSON.stringify(obj).replace(/'/g, "\\'") + "'";
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// Enter key for login
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.getElementById('tab-login').classList.contains('active') &&
        document.getElementById('login-page').classList.contains('active')) doLogin();
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
(async function boot() {
  if (TOKEN) {
    await enterApp();
  }
})();
