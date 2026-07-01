'use strict';

var API = '';
var TOKEN = localStorage.getItem('vgs_token') || null;
var CURRENT_USER  = null;
var CURRENT_DB    = null;
var CURRENT_TABLE = null;
var CURRENT_TABLE_COLS = [];
var PENDING_COLS  = [];
var EDIT_COLS     = [];
var EDIT_ROW_ID   = null;
var PRESENCE_MAP  = {};
var LOGS_INTERVAL = null;
var CHAT_INTERVAL = null;
var CURRENT_CHAT_ID = null;

var ROLE_LEVELS = { membro:1, staff:2, moderador:3, admin:4 };
function hasRole(min) {
  return CURRENT_USER && (ROLE_LEVELS[CURRENT_USER.role]||0) >= (ROLE_LEVELS[min]||99);
}

async function api(path, method, body) {
  if (!method) method = 'GET';
  var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
  if (TOKEN) opts.headers['Authorization'] = 'Bearer ' + TOKEN;
  if (body)  opts.body = JSON.stringify(body);
  var res;
  try { res = await fetch(API + path, opts); }
  catch(e) { throw new Error('Sem conexao com o servidor.'); }
  var data;
  try { data = await res.json(); }
  catch(e2) { throw new Error('Resposta invalida HTTP ' + res.status); }
  if (!res.ok) throw new Error(data.error || 'Erro HTTP ' + res.status);
  return data;
}

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function toast(msg, type, dur) {
  if (!type) type = 'info';
  if (!dur)  dur  = 3500;
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<span>' + msg + '</span>';
  document.getElementById('toasts').appendChild(el);
  setTimeout(function(){ el.remove(); }, dur);
}

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

// LOGIN
function switchTab(id) {
  document.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.login-tab').forEach(function(t){ t.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.login-tab')[id === 'tab-login' ? 0 : 1].classList.add('active');
}

async function doLogin() {
  var username = document.getElementById('login-user').value.trim();
  var password = document.getElementById('login-pass').value;
  var errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  if (!username || !password) { errEl.style.display='flex'; errEl.textContent='Preencha todos os campos'; return; }
  var btn = document.getElementById('btn-login');
  btn.innerHTML = '<span class="spinner"></span> Entrando...'; btn.disabled = true;
  try {
    var d = await api('/api/auth?action=login', 'POST', { username: username, password: password });
    TOKEN = d.token; localStorage.setItem('vgs_token', TOKEN);
    CURRENT_USER = d.user; enterApp();
  } catch(e) { errEl.style.display='flex'; errEl.textContent='Erro: ' + e.message; }
  finally { btn.innerHTML='Entrar no Painel'; btn.disabled=false; }
}

async function doRegister() {
  var username = document.getElementById('reg-user').value.trim();
  var password = document.getElementById('reg-pass').value;
  var p2 = document.getElementById('reg-pass2').value;
  var errEl = document.getElementById('reg-error');
  var okEl  = document.getElementById('reg-success');
  errEl.style.display='none'; okEl.style.display='none';
  if (!username || !password) { errEl.style.display='flex'; errEl.textContent='Preencha todos os campos'; return; }
  if (password !== p2) { errEl.style.display='flex'; errEl.textContent='Senhas nao coincidem'; return; }
  var btn = document.getElementById('btn-register'); btn.disabled=true;
  try {
    await api('/api/auth?action=register', 'POST', { username: username, password: password });
    okEl.style.display='flex'; okEl.textContent='Conta criada! Faca login.';
    setTimeout(function(){ switchTab('tab-login'); }, 1800);
  } catch(e) { errEl.style.display='flex'; errEl.textContent='Erro: ' + e.message; }
  finally { btn.disabled=false; }
}

function doLogout() {
  TOKEN=null; CURRENT_USER=null;
  localStorage.removeItem('vgs_token');
  clearInterval(LOGS_INTERVAL); clearInterval(CHAT_INTERVAL);
  document.getElementById('app-page').style.display='none';
  document.getElementById('login-page').classList.add('active');
}

// APP INIT
async function enterApp() {
  document.getElementById('login-page').classList.remove('active');
  document.getElementById('app-page').style.display='block';
  if (!CURRENT_USER) {
    try { var d = await api('/api/auth?action=me'); CURRENT_USER = d.user; }
    catch(e) { doLogout(); return; }
  }
  updateSidebar();
  setDateTicker();
  startHeartbeat();
  navigate('dashboard');
}

function updateSidebar() {
  var u = CURRENT_USER;
  document.getElementById('sidebar-avatar').textContent = (u.username[0]||'?').toUpperCase();
  document.getElementById('sidebar-username').textContent = u.username;
  var labels = { membro:'Membro', staff:'Staff', moderador:'Moderador', admin:'Admin' };
  ['sidebar-role-badge','topbar-user-role'].forEach(function(id) {
    var el = document.getElementById(id);
    el.textContent = labels[u.role] || u.role;
    el.className = 'role-badge role-' + u.role;
  });
  if (hasRole('staff')) {
    document.getElementById('nav-groupchat').style.display='';
  }
  if (hasRole('moderador')) {
    document.getElementById('nav-mod-label').style.display='';
    document.getElementById('nav-chat').style.display='';
    document.getElementById('nav-users').style.display='';
    document.getElementById('nav-logs').style.display='';
  }
}

function setDateTicker() {
  var el = document.getElementById('topbar-date');
  function tick() { el.textContent = new Date().toLocaleString('pt-BR'); }
  tick(); setInterval(tick, 1000);
}

function startHeartbeat() {
  function ping() { api('/api/presence', 'POST').catch(function(){}); }
  ping(); setInterval(ping, 60000);
}

// NAVIGATION
var GROUPCHAT_INTERVAL = null;

function navigate(page) {
  ['dashboard','sqleditor','users','logs','chat','groupchat'].forEach(function(p) {
    var el = document.getElementById('page-'+p);
    if (el) el.style.display='none';
  });
  document.querySelectorAll('.nav-item').forEach(function(el){ el.classList.remove('active'); });
  var pageEl = document.getElementById('page-'+page);
  if (pageEl) pageEl.style.display='';
  var nv = document.getElementById('nav-'+page);
  if (nv) nv.classList.add('active');
  var titles = { dashboard:'Dashboard', sqleditor:'SQL Editor', users:'Usuarios', logs:'Logs', chat:'Suporte', groupchat:'Chat-VGS' };
  document.getElementById('topbar-title').textContent = titles[page] || page;
  clearInterval(LOGS_INTERVAL); clearInterval(CHAT_INTERVAL); clearInterval(GROUPCHAT_INTERVAL);
  if (page==='dashboard')  loadDashboard();
  if (page==='sqleditor')  { showView('databases'); loadDatabases(); }
  if (page==='users')      { loadPresence().then(function(){ loadUsers(); }); }
  if (page==='logs')       { loadLogs(); LOGS_INTERVAL = setInterval(loadLogs, 10000); }
  if (page==='chat')       { loadChatPage(); }
  if (page==='groupchat')  { loadGroupChat(); GROUPCHAT_INTERVAL = setInterval(loadGroupChat, 5000); }
}

// DASHBOARD
async function loadDashboard() {
  try {
    var dbsD    = await api('/api/databases');
    var tablesD = await api('/api/tables');
    var rowsD   = await api('/api/rows?count_only=1');
    var usersLen = '?';
    if (hasRole('moderador')) { var ud = await api('/api/users'); usersLen = ud.users.length; }
    document.getElementById('stat-users').textContent  = usersLen;
    document.getElementById('stat-dbs').textContent    = (dbsD.databases||[]).length;
    document.getElementById('stat-tables').textContent = (tablesD.tables||[]).length;
    document.getElementById('stat-rows').textContent   = rowsD.total != null ? rowsD.total : 0;
  } catch(e) { console.error(e); }
}

// PRESENCE
async function loadPresence() {
  try { var d = await api('/api/presence'); PRESENCE_MAP = d.presence || {}; }
  catch(e) {}
}

function presenceTag(userId) {
  if (userId === CURRENT_USER.id)
    return '<span class="presence-tag me"><span class="online-dot online"></span> Voce</span>';
  if (PRESENCE_MAP[userId])
    return '<span class="presence-tag online"><span class="online-dot online"></span> Online</span>';
  return '<span class="presence-tag offline"><span class="online-dot offline"></span> Offline</span>';
}

// USERS
async function loadUsers() {
  var isAdmin = hasRole('admin');
  // Show lock screen for non-moderador
  if (!hasRole('moderador')) {
    document.getElementById('users-no-access').style.display='';
    document.getElementById('users-main').style.display='none';
    return;
  }
  document.getElementById('users-no-access').style.display='none';
  document.getElementById('users-main').style.display='';
  document.getElementById('users-perms-label').textContent = isAdmin ? 'Admin - edicao completa' : 'Moderador - somente visualizacao';
  var c = document.getElementById('users-container');
  c.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';
  try {
    var d = await api('/api/users');
    var users = d.users || [];
    var labels = { membro:'Membro', staff:'Staff', moderador:'Moderador', admin:'Admin' };
    var rows = '';
    users.forEach(function(u) {
      rows += '<tr>' +
        '<td style="color:var(--text-muted)">' + u.id + '</td>' +
        '<td><div style="display:flex;align-items:center;gap:8px">' +
          '<div class="user-avatar" style="width:28px;height:28px;font-size:12px">' + u.username[0].toUpperCase() + '</div>' +
          '<strong>' + esc(u.username) + '</strong>' +
          (u.username==='admin' ? '<span style="font-size:10px;color:var(--text-muted)">[fixo]</span>' : '') +
        '</div></td>' +
        '<td>' + presenceTag(u.id) + '</td>' +
        '<td><span class="role-badge role-' + u.role + '">' + (labels[u.role]||u.role) + '</span></td>' +
        '<td>' + new Date(u.created_at).toLocaleDateString('pt-BR') + '</td>' +
        '<td class="actions">' +
          (isAdmin ? '<button class="btn btn-warning btn-sm" onclick="openEditUser(' + u.id + ',\'' + esc(u.username) + '\',\'' + u.role + '\')">Editar</button>' : '<span style="color:var(--text-muted);font-size:11px">leitura</span>') +
          (isAdmin && u.username!=='admin' && u.id!==CURRENT_USER.id ? '<button class="btn btn-danger btn-sm" onclick="confirmDeleteUser(' + u.id + ',\'' + esc(u.username) + '\')">Excluir</button>' : '') +
        '</td></tr>';
    });
    c.innerHTML = '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>#</th><th>Usuario</th><th>Status</th><th>Cargo</th><th>Criado</th><th>Acoes</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  } catch(e) { c.innerHTML = '<div class="alert alert-error">' + e.message + '</div>'; }
}

function openEditUser(id, username, role) {
  document.getElementById('edit-user-id').value = id;
  document.getElementById('edit-username').value = '';
  document.getElementById('edit-password').value = '';
  document.getElementById('edit-role').value = role;
  openModal('modal-edit-user');
}
async function submitEditUser() {
  var id = parseInt(document.getElementById('edit-user-id').value);
  var username = document.getElementById('edit-username').value.trim();
  var password = document.getElementById('edit-password').value;
  var role = document.getElementById('edit-role').value;
  var payload = { id: id, role: role };
  if (username) payload.username = username;
  if (password) payload.password = password;
  try {
    await api('/api/users', 'PUT', payload);
    closeModal('modal-edit-user'); toast('Usuario atualizado!','success'); loadUsers();
  } catch(e) { toast(e.message,'error'); }
}
function confirmDeleteUser(id, username) {
  document.getElementById('confirm-msg').textContent = 'Excluir o usuario "' + username + '"?';
  document.getElementById('confirm-ok-btn').onclick = async function() {
    try { await api('/api/users', 'DELETE', { id: id }); closeModal('modal-confirm'); toast('Excluido','success'); loadUsers(); }
    catch(e) { toast(e.message,'error'); }
  };
  openModal('modal-confirm');
}

// LOGS
var LAST_LOG_ID = 0;
async function loadLogs() {
  if (!hasRole('moderador')) {
    document.getElementById('logs-no-access').style.display='';
    document.getElementById('logs-main').style.display='none';
    return;
  }
  document.getElementById('logs-no-access').style.display='none';
  document.getElementById('logs-main').style.display='';
  var c = document.getElementById('logs-container');
  try {
    var d = await api('/api/logs?limit=100');
    var logs = d.logs || [];
    if (!logs.length) { c.innerHTML = '<div class="empty-state">Nenhum log ainda.</div>'; return; }
    var newestId = logs[0] ? logs[0].id : 0;
    function isNew(id) { return id > LAST_LOG_ID; }
    LAST_LOG_ID = newestId;
    function color(a) {
      if (a.indexOf('Excluiu')>=0) return 'var(--danger)';
      if (a.indexOf('Criou')>=0)   return 'var(--success)';
      if (a.indexOf('Editou')>=0 || a.indexOf('Alterou')>=0 || a.indexOf('Inseriu')>=0) return 'var(--warning)';
      return 'var(--blue-bright)';
    }
    var rows = '';
    logs.forEach(function(l) {
      rows += '<tr style="' + (isNew(l.id)?'background:rgba(0,229,160,0.05)':'') + '">' +
        '<td style="color:var(--text-muted)">' + l.id + '</td>' +
        '<td><div style="display:flex;align-items:center;gap:6px">' +
          '<div class="user-avatar" style="width:24px;height:24px;font-size:11px">' + (l.username||'?')[0].toUpperCase() + '</div>' +
          esc(l.username||'?') + ' <span style="color:var(--text-muted);font-size:10px">#' + (l.user_id||'?') + '</span>' +
        '</div></td>' +
        '<td><span style="color:' + color(l.action) + ';font-weight:600">' + esc(l.action) + '</span></td>' +
        '<td style="color:var(--text-muted)">' + esc(l.details||'') + '</td>' +
        '<td style="white-space:nowrap">' + new Date(l.created_at).toLocaleString('pt-BR') + '</td>' +
      '</tr>';
    });
    c.innerHTML = '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>#</th><th>Usuario</th><th>Acao</th><th>Detalhes</th><th>Data/Hora</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  } catch(e) { c.innerHTML = '<div class="alert alert-error">' + e.message + '</div>'; }
}

// SQL EDITOR VIEWS
function showView(v) {
  ['databases','tables','table-detail'].forEach(function(n){ document.getElementById('view-'+n).style.display='none'; });
  document.getElementById('view-'+v).style.display='';
}

// DATABASES
async function loadDatabases() {
  if (hasRole('staff')) document.getElementById('btn-create-db').style.display='';
  var c = document.getElementById('databases-container');
  c.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';
  try {
    var d = await api('/api/databases');
    var dbs = d.databases || [];
    if (!dbs.length) {
      c.innerHTML = '<div class="empty-state"><div class="empty-icon">DB</div><div class="empty-text">Nenhum database' + (hasRole('staff') ? '. Clique em + Novo Database.' : '.') + '</div></div>';
      return;
    }
    var rows = '';
    dbs.forEach(function(db) {
      rows += '<tr>' +
        '<td style="color:var(--text-muted)">' + db.id + '</td>' +
        '<td><strong style="color:var(--blue-glow)">' + esc(db.name) + '</strong></td>' +
        '<td style="color:var(--text-muted)">' + esc(db.description||'') + '</td>' +
        '<td>' + (db.table_count||0) + '</td>' +
        '<td>' + esc(db.owner_name) + '</td>' +
        '<td class="actions">' +
          '<button class="btn btn-primary btn-sm" onclick="enterDatabase(' + db.id + ',\'' + esc(db.name) + '\',\'' + esc(db.description||'') + '\',\'' + esc(db.owner_name) + '\')">Abrir</button>' +
          (hasRole('staff') ? '<button class="btn btn-secondary btn-sm" onclick="openEditDBModal(' + db.id + ',\'' + esc(db.name) + '\',\'' + esc(db.description||'') + '\')">Editar</button>' : '') +
          (hasRole('moderador') ? '<button class="btn btn-danger btn-sm" onclick="confirmDeleteDB(' + db.id + ',\'' + esc(db.name) + '\')">Excluir</button>' : '') +
        '</td></tr>';
    });
    c.innerHTML = '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>#</th><th>Nome</th><th>Descricao</th><th>Tabelas</th><th>Dono</th><th>Acoes</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  } catch(e) { c.innerHTML = '<div class="alert alert-error">' + e.message + '</div>'; }
}

async function submitCreateDB() {
  var name = document.getElementById('new-db-name').value.trim();
  var description = document.getElementById('new-db-desc').value.trim();
  if (!name) { toast('Nome obrigatorio','warning'); return; }
  try {
    await api('/api/databases', 'POST', { name: name, description: description });
    closeModal('modal-create-db');
    document.getElementById('new-db-name').value='';
    document.getElementById('new-db-desc').value='';
    toast('Database criado!','success'); loadDatabases();
  } catch(e) { toast(e.message,'error'); }
}

function openEditDBModal(id, name, desc) {
  document.getElementById('edit-db-id').value = id;
  document.getElementById('edit-db-name').value = name || '';
  document.getElementById('edit-db-desc').value = desc || '';
  document.getElementById('edit-db-owner').value = '';
  openModal('modal-edit-db');
}

async function submitEditDB() {
  var id = parseInt(document.getElementById('edit-db-id').value);
  var name = document.getElementById('edit-db-name').value.trim();
  var description = document.getElementById('edit-db-desc').value.trim();
  var new_owner = document.getElementById('edit-db-owner').value.trim();
  if (!name) { toast('Nome obrigatorio','warning'); return; }
  var payload = { id: id, name: name, description: description };
  if (new_owner) payload.new_owner_username = new_owner;
  try {
    var d = await api('/api/databases', 'PUT', payload);
    closeModal('modal-edit-db');
    toast('Database atualizado!','success');
    if (CURRENT_DB && CURRENT_DB.id === id) {
      CURRENT_DB.name = d.database.name;
      CURRENT_DB.description = description;
      document.getElementById('current-db-name').textContent = d.database.name;
      document.getElementById('current-db-desc').textContent = description;
    }
    loadDatabases();
  } catch(e) { toast(e.message,'error'); }
}

function confirmDeleteDB(id, name) {
  document.getElementById('confirm-msg').textContent = 'Excluir o database "' + name + '" e TODOS os seus dados?';
  document.getElementById('confirm-ok-btn').onclick = async function() {
    try { await api('/api/databases', 'DELETE', { id: id }); closeModal('modal-confirm'); toast('Database excluido','success'); loadDatabases(); }
    catch(e) { toast(e.message,'error'); }
  };
  openModal('modal-confirm');
}

function enterDatabase(id, name, desc, ownerName) {
  CURRENT_DB = { id: id, name: name, description: desc, owner_name: ownerName };
  document.getElementById('current-db-name').textContent = name;
  document.getElementById('current-db-desc').textContent = desc || '';
  if (hasRole('staff')) { document.getElementById('btn-edit-db').style.display=''; document.getElementById('btn-create-table').style.display=''; }
  showView('tables'); loadTables();
}

function backToDatabases() {
  CURRENT_DB = null;
  document.getElementById('btn-edit-db').style.display='none';
  document.getElementById('btn-create-table').style.display='none';
  showView('databases'); loadDatabases();
}

// TABLES
async function loadTables() {
  var c = document.getElementById('tables-container');
  c.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';
  try {
    var d = await api('/api/tables?database_id=' + CURRENT_DB.id);
    var tables = d.tables || [];
    if (!tables.length) {
      c.innerHTML = '<div class="empty-state"><div class="empty-text">Nenhuma tabela' + (hasRole('staff') ? '. Clique em + Nova Tabela.' : '.') + '</div></div>';
      return;
    }
    var rows = '';
    tables.forEach(function(t) {
      var cols = (t.columns||[]).map(function(col){ return '<span class="col-tag">' + esc(col.name) + ' <small>' + col.type + '</small></span>'; }).join('');
      rows += '<tr>' +
        '<td style="color:var(--text-muted)">' + t.id + '</td>' +
        '<td><strong>' + esc(t.table_name) + '</strong></td>' +
        '<td><div class="col-tags">' + cols + '</div></td>' +
        '<td>' + esc(t.owner_name||'') + '</td>' +
        '<td class="actions">' +
          '<button class="btn btn-primary btn-sm" onclick="openTableDetail(' + t.id + ')">Abrir</button>' +
          (hasRole('moderador') ? '<button class="btn btn-danger btn-sm" onclick="confirmDeleteTableById(' + t.id + ',\'' + esc(t.table_name) + '\')">Excluir</button>' : '') +
        '</td></tr>';
    });
    c.innerHTML = '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>#</th><th>Nome</th><th>Colunas</th><th>Criado por</th><th>Acoes</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  } catch(e) { c.innerHTML = '<div class="alert alert-error">' + e.message + '</div>'; }
}

function openCreateTableModal() {
  PENDING_COLS = [];
  document.getElementById('new-table-name').value='';
  document.getElementById('new-col-name').value='';
  renderPendingCols();
  openModal('modal-create-table');
}

function addColumnToNew() {
  var name = document.getElementById('new-col-name').value.trim();
  var type = document.getElementById('new-col-type').value;
  var required = document.getElementById('new-col-required').checked;
  if (!name) { toast('Digite o nome da coluna','warning'); return; }
  if (PENDING_COLS.find(function(c){ return c.name===name; })) { toast('Coluna ja adicionada','warning'); return; }
  PENDING_COLS.push({ name: name, type: type, required: required });
  document.getElementById('new-col-name').value='';
  document.getElementById('new-col-required').checked=false;
  renderPendingCols();
}

function removePendingCol(i) { PENDING_COLS.splice(i,1); renderPendingCols(); }

function renderPendingCols() {
  var el = document.getElementById('new-cols-list');
  if (!PENDING_COLS.length) { el.innerHTML='<span style="color:var(--text-muted);font-size:12px;padding:4px">Nenhuma coluna ainda</span>'; return; }
  el.innerHTML = PENDING_COLS.map(function(c,i){
    return '<span class="col-tag" style="display:inline-flex;align-items:center;gap:4px">' +
      esc(c.name) + ' <small>(' + c.type + ')</small>' +
      (c.required ? '<span style="color:var(--danger);font-size:10px">*</span>' : '') +
      '<span onclick="removePendingCol(' + i + ')" style="cursor:pointer;color:var(--danger);margin-left:2px">x</span>' +
    '</span>';
  }).join('');
}

async function submitCreateTable() {
  var name = document.getElementById('new-table-name').value.trim();
  if (!name) { toast('Digite o nome da tabela','warning'); return; }
  if (!PENDING_COLS.length) { toast('Adicione ao menos uma coluna','warning'); return; }
  try {
    await api('/api/tables', 'POST', { table_name: name, columns: PENDING_COLS, database_id: CURRENT_DB.id });
    closeModal('modal-create-table'); toast('Tabela criada!','success'); loadTables();
  } catch(e) { toast(e.message,'error'); }
}

function confirmDeleteTableById(id, name) {
  document.getElementById('confirm-msg').textContent = 'Excluir a tabela "' + name + '" e todos os seus dados?';
  document.getElementById('confirm-ok-btn').onclick = async function() {
    try {
      await api('/api/tables', 'DELETE', { id: id });
      closeModal('modal-confirm'); toast('Tabela excluida','success');
      if (CURRENT_TABLE === id) backToTables(); else loadTables();
    } catch(e) { toast(e.message,'error'); }
  };
  openModal('modal-confirm');
}

function openRenameTableModal() {
  document.getElementById('rename-table-name').value = document.getElementById('detail-title').textContent;
  openModal('modal-rename-table');
}
async function submitRenameTable() {
  var name = document.getElementById('rename-table-name').value.trim();
  if (!name) { toast('Nome obrigatorio','warning'); return; }
  try {
    await api('/api/tables', 'PUT', { id: CURRENT_TABLE, table_name: name });
    closeModal('modal-rename-table');
    document.getElementById('detail-title').textContent = name;
    toast('Tabela renomeada!','success');
  } catch(e) { toast(e.message,'error'); }
}

// TABLE DETAIL
async function openTableDetail(tableId) {
  CURRENT_TABLE = tableId;
  showView('table-detail');
  if (hasRole('staff'))     { document.getElementById('btn-rename-table').style.display=''; document.getElementById('btn-edit-cols').style.display=''; document.getElementById('btn-add-row').style.display=''; }
  if (hasRole('moderador')) { document.getElementById('btn-delete-table').style.display=''; }
  await loadTableDetail();
}

async function loadTableDetail() {
  var c = document.getElementById('table-detail-content');
  c.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';
  try {
    var d = await api('/api/rows?table_id=' + CURRENT_TABLE);
    var table = d.table;
    var rows = d.rows || [];
    CURRENT_TABLE_COLS = table.columns || [];
    document.getElementById('detail-title').textContent = table.table_name;
    if (!rows.length) {
      var colsText = CURRENT_TABLE_COLS.map(function(col){ return '<strong>' + esc(col.name) + '</strong> (' + col.type + (col.required?' *':'') + ')'; }).join(', ');
      c.innerHTML = '<div class="alert alert-info" style="margin-bottom:12px">Colunas: ' + colsText + '</div>' +
        '<div class="empty-state"><div class="empty-text">Nenhum dado' + (hasRole('staff') ? '. Clique em + Linha.' : '.') + '</div></div>';
      return;
    }
    var thCols = CURRENT_TABLE_COLS.map(function(col){ return '<th>' + esc(col.name) + '<br><small style="font-size:10px;color:var(--text-muted)">' + col.type + '</small></th>'; }).join('');
    var tbody = '';
    rows.forEach(function(row, i) {
      var tdCols = CURRENT_TABLE_COLS.map(function(col){
        var val = row.data[col.name] != null ? row.data[col.name] : '';
        return '<td>' + esc(String(val)) + '</td>';
      }).join('');
      var rowDataEsc = esc(JSON.stringify(row.data));
      tbody += '<tr><td style="color:var(--text-muted)">' + (i+1) + '</td>' + tdCols +
        '<td class="actions">' +
          (hasRole('staff') ? '<button class="btn btn-secondary btn-sm btn-icon" onclick="openEditRow(' + row.id + ',this)">Edit</button>' : '') +
          (hasRole('moderador') ? '<button class="btn btn-danger btn-sm btn-icon" onclick="confirmDeleteRow(' + row.id + ')">Del</button>' : '') +
          (!hasRole('staff') ? '<span style="color:var(--text-muted);font-size:11px">leitura</span>' : '') +
        '</td></tr>';
    });
    // Store rows for edit access
    window._ROWS_CACHE = {};
    rows.forEach(function(row){ window._ROWS_CACHE[row.id] = row.data; });
    c.innerHTML = '<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">' + rows.length + ' registro(s)</div>' +
      '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>#</th>' + thCols + '<th>Acoes</th></tr></thead><tbody>' + tbody + '</tbody></table></div>';
  } catch(e) { c.innerHTML = '<div class="alert alert-error">' + e.message + '</div>'; }
}

function backToTables() {
  CURRENT_TABLE = null;
  ['btn-rename-table','btn-edit-cols','btn-add-row','btn-delete-table'].forEach(function(id){ document.getElementById(id).style.display='none'; });
  showView('tables'); loadTables();
}
function confirmDeleteTable() { confirmDeleteTableById(CURRENT_TABLE, document.getElementById('detail-title').textContent); }

// EDIT COLUMNS
function openEditColsModal() {
  EDIT_COLS = JSON.parse(JSON.stringify(CURRENT_TABLE_COLS));
  renderEditCols();
  document.getElementById('edit-new-col-name').value='';
  document.getElementById('edit-new-col-required').checked=false;
  openModal('modal-edit-cols');
}

function renderEditCols() {
  var el = document.getElementById('edit-cols-list');
  if (!EDIT_COLS.length) { el.innerHTML='<p style="color:var(--text-muted);font-size:12px">Adicione colunas abaixo.</p>'; return; }
  var typeOpts = ['texto','numero','decimal','data','data/hora','sim/nao','email','url','telefone'];
  var typeReal = ['texto','número','decimal','data','data/hora','sim/não','email','url','telefone'];
  var rows = '';
  EDIT_COLS.forEach(function(col, i) {
    var selOpts = typeReal.map(function(t){
      return '<option value="' + t + '"' + (col.type===t?' selected':'') + '>' + t + '</option>';
    }).join('');
    rows += '<tr>' +
      '<td><input class="form-control" style="padding:4px 8px;font-size:12px" value="' + esc(col.name) + '" onchange="EDIT_COLS[' + i + '].name=this.value"/></td>' +
      '<td><select class="form-control" style="padding:4px 8px;font-size:12px" onchange="EDIT_COLS[' + i + '].type=this.value">' + selOpts + '</select></td>' +
      '<td><input type="checkbox" ' + (col.required?'checked':'') + ' onchange="EDIT_COLS[' + i + '].required=this.checked" style="accent-color:var(--blue-core)"/></td>' +
      '<td><button class="btn btn-danger btn-sm btn-icon" onclick="removeEditCol(' + i + ')">x</button></td>' +
    '</tr>';
  });
  el.innerHTML = '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Nome</th><th>Tipo</th><th>Obrig.</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function removeEditCol(i) { EDIT_COLS.splice(i,1); renderEditCols(); }

function addColToEdit() {
  var name = document.getElementById('edit-new-col-name').value.trim();
  var type = document.getElementById('edit-new-col-type').value;
  var required = document.getElementById('edit-new-col-required').checked;
  if (!name) { toast('Digite o nome','warning'); return; }
  if (EDIT_COLS.find(function(c){ return c.name===name; })) { toast('Coluna ja existe','warning'); return; }
  EDIT_COLS.push({ name: name, type: type, required: required });
  document.getElementById('edit-new-col-name').value='';
  document.getElementById('edit-new-col-required').checked=false;
  renderEditCols();
}

async function submitEditCols() {
  if (!EDIT_COLS.length) { toast('Adicione ao menos uma coluna','warning'); return; }
  try {
    await api('/api/tables', 'PUT', { id: CURRENT_TABLE, columns: EDIT_COLS });
    closeModal('modal-edit-cols'); toast('Colunas atualizadas!','success'); loadTableDetail();
  } catch(e) { toast(e.message,'error'); }
}

// ROWS
function buildInput(col, prefix) {
  var safeId = prefix + '-' + col.name.replace(/[^a-zA-Z0-9]/g,'_');
  if (col.type==='sim/não') return '<select id="' + safeId + '" class="form-control"><option>Sim</option><option>Nao</option></select>';
  var typeMap = { 'número':'number', 'decimal':'number', 'data':'date', 'data/hora':'datetime-local', 'email':'email', 'url':'url', 'telefone':'tel' };
  var t = typeMap[col.type] || 'text';
  var step = col.type==='decimal' ? ' step="0.01"' : '';
  return '<input id="' + safeId + '" type="' + t + '"' + step + ' class="form-control" placeholder="' + esc(col.name) + '"' + (col.required?' required':'') + '/>';
}
function getInputId(col, prefix) { return prefix + '-' + col.name.replace(/[^a-zA-Z0-9]/g,'_'); }

function openAddRowModal() {
  var html = '';
  CURRENT_TABLE_COLS.forEach(function(col) {
    html += '<div class="form-group"><label class="form-label">' + esc(col.name) + ' <span style="color:var(--text-muted);font-size:10px">(' + col.type + (col.required?' *':'') + ')</span></label>' + buildInput(col,'add-row') + '</div>';
  });
  document.getElementById('add-row-fields').innerHTML = html;
  openModal('modal-add-row');
}

async function submitAddRow() {
  var data = {};
  CURRENT_TABLE_COLS.forEach(function(col) {
    var el = document.getElementById(getInputId(col,'add-row'));
    if (el) data[col.name] = el.value;
  });
  try {
    await api('/api/rows', 'POST', { table_id: CURRENT_TABLE, data: data });
    closeModal('modal-add-row'); toast('Linha adicionada!','success'); loadTableDetail();
  } catch(e) { toast(e.message,'error'); }
}

function openEditRow(rowId, btnEl) {
  EDIT_ROW_ID = rowId;
  var rowData = (window._ROWS_CACHE && window._ROWS_CACHE[rowId]) || {};
  var html = '';
  CURRENT_TABLE_COLS.forEach(function(col) {
    html += '<div class="form-group"><label class="form-label">' + esc(col.name) + '</label>' + buildInput(col,'edit-row') + '</div>';
  });
  document.getElementById('edit-row-fields').innerHTML = html;
  CURRENT_TABLE_COLS.forEach(function(col) {
    var el = document.getElementById(getInputId(col,'edit-row'));
    if (el && rowData[col.name] != null) el.value = rowData[col.name];
  });
  openModal('modal-edit-row');
}

async function submitEditRow() {
  var data = {};
  CURRENT_TABLE_COLS.forEach(function(col) {
    var el = document.getElementById(getInputId(col,'edit-row'));
    if (el) data[col.name] = el.value;
  });
  try {
    await api('/api/rows', 'PUT', { id: EDIT_ROW_ID, data: data });
    closeModal('modal-edit-row'); toast('Linha atualizada!','success'); loadTableDetail();
  } catch(e) { toast(e.message,'error'); }
}

function confirmDeleteRow(rowId) {
  document.getElementById('confirm-msg').textContent = 'Excluir esta linha permanentemente?';
  document.getElementById('confirm-ok-btn').onclick = async function() {
    try { await api('/api/rows', 'DELETE', { id: rowId }); closeModal('modal-confirm'); toast('Linha excluida','success'); loadTableDetail(); }
    catch(e) { toast(e.message,'error'); }
  };
  openModal('modal-confirm');
}

// CHAT
async function loadChatPage() {
  ['chat-admin-list','chat-admin-detail','chat-user-view','chat-none-view','chat-no-access'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.style.display='none';
  });
  if (!hasRole('moderador')) {
    var na = document.getElementById('chat-no-access');
    if (na) na.style.display='';
    return;
  }
  if (hasRole('moderador')) {
    document.getElementById('chat-admin-list').style.display='';
    loadAdminChats();
  }
}

async function loadAdminChats() {
  var c = document.getElementById('admin-chats-container');
  c.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';
  try {
    var d = await api('/api/chat?action=list');
    var chats = d.chats || [];
    if (!chats.length) { c.innerHTML = '<div class="empty-state">Nenhum chat aberto.</div>'; return; }
    var rows = '';
    chats.forEach(function(ch) {
      rows += '<tr>' +
        '<td style="color:var(--text-muted)">' + ch.id + '</td>' +
        '<td><strong>' + esc(ch.username) + '</strong></td>' +
        '<td>' + esc(ch.subject||'') + '</td>' +
        '<td><span class="role-badge ' + (ch.status==='open'?'role-staff':'role-membro') + '">' + (ch.status==='open'?'Aberto':'Fechado') + '</span></td>' +
        '<td>' + (ch.msg_count||0) + '</td>' +
        '<td>' + new Date(ch.created_at).toLocaleDateString('pt-BR') + '</td>' +
        '<td class="actions">' +
          '<button class="btn btn-primary btn-sm" onclick="openAdminChat(' + ch.id + ',\'' + esc(ch.username) + '\',\'' + ch.status + '\')">Abrir</button>' +
          (hasRole('admin') ? ' <button class="btn btn-danger btn-sm" onclick="confirmDeleteChat(' + ch.id + ')">🗑 Deletar</button>' : '') +
        '</td>' +
      '</tr>';
    });
    c.innerHTML = '<div class="data-table-wrap"><table class="data-table"><thead><tr><th>#</th><th>Usuario</th><th>Assunto</th><th>Status</th><th>Msgs</th><th>Data</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  } catch(e) { c.innerHTML = '<div class="alert alert-error">' + e.message + '</div>'; }
}

async function openAdminChat(chatId, username, status) {
  CURRENT_CHAT_ID = chatId;
  document.getElementById('chat-admin-list').style.display='none';
  document.getElementById('chat-admin-detail').style.display='';
  document.getElementById('admin-chat-for').textContent = username;
  var sb = document.getElementById('admin-chat-status-badge');
  sb.textContent = status==='open' ? 'Aberto' : 'Fechado';
  sb.className = 'role-badge ' + (status==='open'?'role-staff':'role-membro');
  document.getElementById('admin-chat-input-row').style.display = status==='open' ? '' : 'none';
  document.getElementById('btn-close-chat').style.display = status==='open' ? '' : 'none';
  await refreshAdminChat();
  CHAT_INTERVAL = setInterval(refreshAdminChat, 5000);
}

async function refreshAdminChat() {
  try {
    var d = await api('/api/chat?action=messages&chat_id=' + CURRENT_CHAT_ID);
    renderMessages('admin-chat-messages', d.messages);
  } catch(e) {}
}

function backToAdminChats() {
  clearInterval(CHAT_INTERVAL); CURRENT_CHAT_ID=null;
  document.getElementById('chat-admin-detail').style.display='none';
  document.getElementById('chat-admin-list').style.display='';
  loadAdminChats();
}

async function sendAdminMsg() {
  var inp = document.getElementById('admin-chat-input');
  var msg = inp.value.trim(); if (!msg) return;
  inp.value='';
  try {
    await api('/api/chat?action=send', 'POST', { chat_id: CURRENT_CHAT_ID, message: msg });
    await refreshAdminChat();
  } catch(e) { toast(e.message,'error'); }
}

async function closeSupportChat() {
  try {
    await api('/api/chat?action=close', 'POST', { chat_id: CURRENT_CHAT_ID });
    toast('Chat fechado','success'); backToAdminChats();
  } catch(e) { toast(e.message,'error'); }
}

async function createUserChat() {
  try {
    var d = await api('/api/chat?action=create_auth', 'POST', { subject: 'Suporte / Recuperacao de senha' });
    var d2 = await api('/api/chat?action=messages&chat_id=' + d.chat_id);
    showUserChat(d2.chat, d2.messages);
  } catch(e) { toast(e.message,'error'); }
}

function showUserChat(chat, messages) {
  document.getElementById('chat-none-view').style.display='none';
  document.getElementById('chat-user-view').style.display='';
  var isClosed = chat.status === 'closed';
  var sb = document.getElementById('user-chat-status-badge');
  sb.textContent = isClosed ? 'Encerrado' : 'Aberto';
  sb.className = 'role-badge ' + (isClosed?'role-membro':'role-staff');
  document.getElementById('user-input-row').style.display = isClosed ? 'none' : '';
  document.getElementById('user-chat-closed').style.display = isClosed ? '' : 'none';
  CURRENT_CHAT_ID = chat.id;
  renderMessages('user-chat-messages', messages);
  if (!isClosed) {
    clearInterval(CHAT_INTERVAL);
    CHAT_INTERVAL = setInterval(async function() {
      try {
        var d = await api('/api/chat?action=messages&chat_id=' + CURRENT_CHAT_ID);
        renderMessages('user-chat-messages', d.messages);
        if (d.chat.status==='closed') {
          clearInterval(CHAT_INTERVAL);
          document.getElementById('user-input-row').style.display='none';
          document.getElementById('user-chat-closed').style.display='';
        }
      } catch(e) {}
    }, 5000);
  }
}

async function sendUserMsg() {
  var inp = document.getElementById('user-chat-input');
  var msg = inp.value.trim(); if (!msg) return;
  inp.value='';
  try {
    await api('/api/chat?action=send', 'POST', { chat_id: CURRENT_CHAT_ID, message: msg });
    var d = await api('/api/chat?action=messages&chat_id=' + CURRENT_CHAT_ID);
    renderMessages('user-chat-messages', d.messages);
  } catch(e) { toast(e.message,'error'); }
}

function renderMessages(containerId, messages) {
  var box = document.getElementById(containerId);
  if (!messages || !messages.length) {
    box.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:13px">Nenhuma mensagem ainda.</div>';
    return;
  }
  var html = '';
  messages.forEach(function(m) {
    var fromMe = m.sender_id === CURRENT_USER.id;
    var isAdm  = m.sender_role === 'admin';
    html += '<div class="chat-msg ' + (fromMe?'from-me':'from-other') + (isAdm&&!fromMe?' is-admin':'') + '">' +
      '<div class="chat-msg-header">' +
        (!fromMe ? '<span class="role-badge role-' + m.sender_role + '" style="font-size:10px;padding:1px 5px">' + esc(m.sender_name) + '</span>' : '') +
        '<span>' + new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) + '</span>' +
      '</div>' +
      '<div class="chat-bubble">' + esc(m.message) + '</div>' +
    '</div>';
  });
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;
}

// TICKET (open support chat without login)
var TICKET_TOKEN_SAVED = null;

async function submitTicket() {
  var username = document.getElementById('ticket-username').value.trim();
  var subject  = document.getElementById('ticket-subject').value;
  var errEl    = document.getElementById('ticket-error');
  errEl.style.display='none';
  if (!username) { errEl.style.display='flex'; errEl.textContent='Informe seu usuario'; return; }
  try {
    var d = await api('/api/chat?action=create', 'POST', { username: username, subject: subject });
    TICKET_TOKEN_SAVED = d.token;
    document.getElementById('ticket-step1').style.display='none';
    document.getElementById('ticket-step2').style.display='';
    document.getElementById('ticket-token-box').textContent = d.token;
  } catch(e) { errEl.style.display='flex'; errEl.textContent=e.message; }
}

function copyTicketToken() {
  if (TICKET_TOKEN_SAVED) {
    navigator.clipboard.writeText(TICKET_TOKEN_SAVED).then(function(){ toast('Token copiado!','success'); }).catch(function(){ toast('Copie manualmente','warning'); });
  }
}

function resetTicketModal() {
  TICKET_TOKEN_SAVED = null;
  document.getElementById('ticket-step1').style.display='';
  document.getElementById('ticket-step2').style.display='none';
  document.getElementById('ticket-username').value='';
  document.getElementById('ticket-error').style.display='none';
}

// TOKEN CHAT (enter existing chat with token)
var GUEST_CHAT = null;

async function submitTokenChat() {
  var token = document.getElementById('token-chat-input').value.trim();
  var errEl = document.getElementById('token-chat-error');
  errEl.style.display='none';
  if (!token) { errEl.style.display='flex'; errEl.textContent='Cole o token'; return; }
  try {
    var d = await api('/api/chat?action=join&token=' + encodeURIComponent(token));
    GUEST_CHAT = d.chat;
    closeModal('modal-token-chat');
    document.getElementById('token-chat-input').value='';
    showGuestChat(d.chat, d.messages, token);
  } catch(e) { errEl.style.display='flex'; errEl.textContent=e.message; }
}

function showGuestChat(chat, messages, token) {
  // Show a floating guest chat overlay
  var existing = document.getElementById('guest-chat-overlay');
  if (existing) existing.remove();

  var isClosed = chat.status === 'closed';
  var overlay = document.createElement('div');
  overlay.id = 'guest-chat-overlay';
  overlay.style.cssText = 'position:fixed;bottom:20px;right:20px;width:360px;z-index:2000;';
  var closedHtml = '<div class="alert alert-success" style="margin:8px">Chat encerrado pelo admin.</div>';
  var inputHtml = '<div class="chat-input-row"><input id="guest-chat-input" type="text" class="form-control" placeholder="Sua mensagem..." /><button class="btn btn-primary" onclick="sendGuestMsg()">Enviar</button></div>';
  overlay.innerHTML = [
    '<div class="card" style="box-shadow:var(--glow-md);border-color:var(--blue-glow)">',
      '<div class="card-header">',
        '<div class="card-title" style="font-size:14px">Suporte - ' + esc(chat.username) + '</div>',
        '<div style="display:flex;gap:6px;align-items:center">',
          '<span class="role-badge ' + (isClosed ? 'role-membro' : 'role-staff') + '">' + (isClosed ? 'Encerrado' : 'Aberto') + '</span>',
          '<button id="guest-chat-close-btn" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px">x</button>',
        '</div>',
      '</div>',
      '<div id="guest-chat-messages" class="chat-messages-box" style="max-height:260px"></div>',
      (!isClosed ? inputHtml : closedHtml),
    '</div>'
  ].join('');
  document.body.appendChild(overlay);
  var closeBtn = document.getElementById('guest-chat-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      var el = document.getElementById('guest-chat-overlay');
      if (el) el.remove();
      clearInterval(window._GUEST_INTERVAL);
    });
  }
  var guestInput = document.getElementById('guest-chat-input');
  if (guestInput) {
    guestInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') sendGuestMsg(); });
  }
  renderGuestMessages(messages);

  if (!isClosed) {
    clearInterval(window._GUEST_INTERVAL);
    window._GUEST_INTERVAL = setInterval(function() {
      api('/api/chat?action=join&token=' + encodeURIComponent(token)).then(function(d2) {
        renderGuestMessages(d2.messages);
        if (d2.chat.status === 'closed') {
          clearInterval(window._GUEST_INTERVAL);
          var row = document.getElementById('guest-chat-overlay');
          if (row) {
            var inputRow = row.querySelector('.chat-input-row');
            if (inputRow) inputRow.innerHTML = '<div class="alert alert-success" style="margin:8px">✅ Chat encerrado pelo admin.</div>';
          }
        }
      }).catch(function(){});
    }, 5000);
  }
}

function renderGuestMessages(messages) {
  var box = document.getElementById('guest-chat-messages');
  if (!box) return;
  if (!messages || !messages.length) {
    box.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:16px;font-size:13px">Aguardando resposta do Admin...</div>';
    return;
  }
  var html = '';
  messages.forEach(function(m) {
    var isAdm   = m.sender_role === 'admin' || m.sender_role === 'moderador';
    var isGuest = m.sender_role === 'guest';
    // Guest/user messages = RIGHT (they sent them = "from-me")
    // Admin/mod messages  = LEFT  (received from admin = "from-other")
    var cls = isAdm ? 'from-other is-admin' : 'from-me';
    var nameHtml = '';
    if (isAdm) {
      // Use correct role badge color - moderador gets warning, admin gets admin color
      var adminRole = m.sender_role === 'moderador' ? 'moderador' : 'admin';
      nameHtml = '<span class="role-badge role-' + adminRole + '" style="font-size:10px;padding:1px 5px">' + esc(m.sender_name) + '</span>';
    } else if (isGuest) {
      nameHtml = '<span style="font-size:10px;color:#9b59b6;font-weight:700;background:rgba(155,89,182,0.15);padding:1px 6px;border-radius:3px;border:1px solid rgba(155,89,182,0.4)">Sem_login</span>';
    } else {
      nameHtml = '<span class="role-badge role-' + m.sender_role + '" style="font-size:10px;padding:1px 5px">' + esc(m.sender_name) + '</span>';
    }
    html += '<div class="chat-msg ' + cls + '">' +
      '<div class="chat-msg-header">' +
        nameHtml +
        '<span style="font-size:11px;color:var(--text-muted)">' + new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) + '</span>' +
      '</div>' +
      '<div class="chat-bubble">' + esc(m.message) + '</div>' +
    '</div>';
  });
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;
}

async function sendGuestMsg() {
  if (!GUEST_CHAT) return;
  var inp = document.getElementById('guest-chat-input');
  var msg = inp ? inp.value.trim() : '';
  if (!msg) return;
  inp.value = '';
  try {
    await api('/api/chat?action=send_guest', 'POST', { token: GUEST_CHAT.token, message: msg });
    var d = await api('/api/chat?action=join&token=' + encodeURIComponent(GUEST_CHAT.token));
    renderGuestMessages(d.messages);
  } catch(e) { toast(e.message, 'error'); }
}

// DELETE CHAT (admin only)
function confirmDeleteChat(chatId) {
  document.getElementById('confirm-msg').textContent = 'Excluir este chat permanentemente?';
  document.getElementById('confirm-ok-btn').onclick = async function() {
    try {
      await api('/api/chat?action=delete', 'POST', { chat_id: chatId });
      closeModal('modal-confirm'); toast('Chat excluido','success'); loadAdminChats();
    } catch(e) { toast(e.message,'error'); }
  };
  openModal('modal-confirm');
}

// GROUP CHAT
var LAST_GROUP_MSG_ID = 0;

async function loadGroupChat() {
  try {
    var d = await api('/api/groupchat');
    var messages = d.messages || [];
    renderGroupMessages(messages);
  } catch(e) {}
}

function renderGroupMessages(messages) {
  var box = document.getElementById('groupchat-messages');
  if (!box) return;
  if (!messages.length) {
    box.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:13px">Nenhuma mensagem ainda. Seja o primeiro!</div>';
    return;
  }
  var labels = { membro:'Membro', staff:'Staff', moderador:'Moderador', admin:'Admin' };
  var atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  var html = '';
  messages.forEach(function(m) {
    var fromMe = m.sender_id === CURRENT_USER.id;
    html += '<div class="chat-msg ' + (fromMe ? 'from-me' : 'from-other') + '">' +
      '<div class="chat-msg-header">' +
        (!fromMe ? '<span class="role-badge role-' + m.sender_role + '" style="font-size:10px;padding:1px 5px">' + esc(m.sender_name) + '</span>' : '<span style="font-size:11px;color:var(--text-muted)">Voce</span>') +
        '<span style="font-size:11px;color:var(--text-muted)">' + new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) + '</span>' +
      '</div>' +
      '<div class="chat-bubble">' + esc(m.message) + '</div>' +
    '</div>';
  });
  var isNew = messages[messages.length-1] && messages[messages.length-1].id > LAST_GROUP_MSG_ID;
  LAST_GROUP_MSG_ID = messages[messages.length-1] ? messages[messages.length-1].id : LAST_GROUP_MSG_ID;
  box.innerHTML = html;
  if (atBottom || isNew) box.scrollTop = box.scrollHeight;
}

async function sendGroupMsg() {
  var inp = document.getElementById('groupchat-input');
  var msg = inp ? inp.value.trim() : '';
  if (!msg) return;
  inp.value = '';
  try {
    await api('/api/groupchat', 'POST', { message: msg });
    await loadGroupChat();
  } catch(e) { toast(e.message, 'error'); }
}

// BOOT
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && document.getElementById('login-page').classList.contains('active')) {
    if (document.getElementById('tab-login').classList.contains('active')) doLogin();
  }
});

(async function boot() {
  if (TOKEN) await enterApp();
})();
