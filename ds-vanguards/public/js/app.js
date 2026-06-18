'use strict';

const API = '';
let TOKEN = localStorage.getItem('vgs_token') || null;
let CURRENT_USER = null;
let CURRENT_DB = null;      // { id, name }
let CURRENT_TABLE = null;   // id
let CURRENT_TABLE_COLS = [];
let PENDING_COLS = [];
let EDIT_COLS = [];
let EDIT_ROW_ID = null;
let LOGS_INTERVAL = null;

const ROLE_LEVELS = { membro:1, staff:2, moderador:3, admin:4 };
function hasRole(min){ return CURRENT_USER && (ROLE_LEVELS[CURRENT_USER.role]||0) >= (ROLE_LEVELS[min]||99); }

// ─── API ─────────────────────────────────────────────────────────────────────
async function api(path, method='GET', body=null){
  const opts = { method, headers:{'Content-Type':'application/json'} };
  if(TOKEN) opts.headers['Authorization']='Bearer '+TOKEN;
  if(body) opts.body=JSON.stringify(body);
  let res;
  try{ res = await fetch(API+path, opts); }
  catch(e){ throw new Error('Sem conexão com o servidor.'); }
  let data;
  try{ data = await res.json(); }
  catch{ throw new Error(`Resposta inválida HTTP ${res.status}`); }
  if(!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`);
  return data;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type='info', dur=3500){
  const icons={success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'};
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.innerHTML=`<span>${icons[type]}</span><span>${msg}</span>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(()=>el.remove(), dur);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }

document.addEventListener('click', e=>{
  if(e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

// ─── Login ────────────────────────────────────────────────────────────────────
function switchTab(tabId){
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.login-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  document.querySelectorAll('.login-tab')[tabId==='tab-login'?0:1].classList.add('active');
}

async function doLogin(){
  const username=document.getElementById('login-user').value.trim();
  const password=document.getElementById('login-pass').value;
  const errEl=document.getElementById('login-error');
  errEl.style.display='none';
  if(!username||!password){ showErr(errEl,'Preencha todos os campos'); return; }
  const btn=document.getElementById('btn-login');
  btn.innerHTML='<span class="spinner"></span> Entrando...'; btn.disabled=true;
  try{
    const data=await api('/api/auth?action=login','POST',{username,password});
    TOKEN=data.token; localStorage.setItem('vgs_token',TOKEN);
    CURRENT_USER=data.user; enterApp();
  }catch(e){ showErr(errEl,e.message); }
  finally{ btn.innerHTML='<span>⚡</span> Entrar no Painel'; btn.disabled=false; }
}

async function doRegister(){
  const username=document.getElementById('reg-user').value.trim();
  const password=document.getElementById('reg-pass').value;
  const password2=document.getElementById('reg-pass2').value;
  const errEl=document.getElementById('reg-error');
  const okEl=document.getElementById('reg-success');
  errEl.style.display='none'; okEl.style.display='none';
  if(!username||!password){ showErr(errEl,'Preencha todos os campos'); return; }
  if(password!==password2){ showErr(errEl,'As senhas não coincidem'); return; }
  const btn=document.getElementById('btn-register'); btn.disabled=true;
  try{
    await api('/api/auth?action=register','POST',{username,password});
    okEl.style.display='flex'; okEl.textContent='✅ Conta criada! Faça login.';
    setTimeout(()=>switchTab('tab-login'),1800);
  }catch(e){ showErr(errEl,e.message); }
  finally{ btn.disabled=false; }
}

function doLogout(){
  TOKEN=null; CURRENT_USER=null;
  localStorage.removeItem('vgs_token');
  if(LOGS_INTERVAL){ clearInterval(LOGS_INTERVAL); LOGS_INTERVAL=null; }
  document.getElementById('app-page').style.display='none';
  document.getElementById('login-page').classList.add('active');
}

function showErr(el,msg){ el.style.display='flex'; el.textContent='⚠️ '+msg; }

// ─── Enter App ────────────────────────────────────────────────────────────────
async function enterApp(){
  document.getElementById('login-page').classList.remove('active');
  document.getElementById('app-page').style.display='block';
  if(!CURRENT_USER){
    try{ const d=await api('/api/auth?action=me'); CURRENT_USER=d.user; }
    catch{ doLogout(); return; }
  }
  updateSidebar(); setDateTicker(); navigate('dashboard');
}

function updateSidebar(){
  const u=CURRENT_USER;
  document.getElementById('sidebar-avatar').textContent=(u.username[0]||'?').toUpperCase();
  document.getElementById('sidebar-username').textContent=u.username;
  const roleLabels={membro:'🟦 Membro',staff:'🟩 Staff',moderador:'🟨 Moderador',admin:'🟥 Admin'};
  const rb=document.getElementById('sidebar-role-badge');
  const trb=document.getElementById('topbar-user-role');
  rb.textContent=trb.textContent=roleLabels[u.role]||u.role;
  rb.className=`role-badge role-${u.role}`;
  trb.className=`role-badge role-${u.role}`;

  if(hasRole('moderador')){
    document.getElementById('nav-mod-label').style.display='';
    document.getElementById('nav-users').style.display='';
    document.getElementById('nav-logs').style.display='';
  }
}

function setDateTicker(){
  const el=document.getElementById('topbar-date');
  function tick(){ el.textContent=new Date().toLocaleString('pt-BR'); }
  tick(); setInterval(tick,1000);
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function navigate(page){
  ['dashboard','sqleditor','users','logs'].forEach(p=>{
    document.getElementById('page-'+p).style.display='none';
  });
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  document.getElementById('page-'+page).style.display='';
  const nv=document.getElementById('nav-'+page);
  if(nv) nv.classList.add('active');
  const titles={dashboard:'📊 Dashboard',sqleditor:'🗄️ SQL Editor',users:'👥 Usuários',logs:'📋 Logs'};
  document.getElementById('topbar-title').textContent=titles[page]||page;

  if(LOGS_INTERVAL){ clearInterval(LOGS_INTERVAL); LOGS_INTERVAL=null; }

  if(page==='dashboard') loadDashboard();
  if(page==='sqleditor') { showView('databases'); loadDatabases(); }
  if(page==='users') loadUsers();
  if(page==='logs') { loadLogs(); LOGS_INTERVAL=setInterval(loadLogs,10000); }
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function loadDashboard(){
  try{
    const [dbsData,tablesData]=await Promise.all([
      api('/api/databases'),
      api('/api/tables'),
    ]);
    const usersData = hasRole('moderador') ? await api('/api/users') : {users:[]};
    const tables=tablesData.tables||[];
    document.getElementById('stat-users').textContent=usersData.users.length||'—';
    document.getElementById('stat-dbs').textContent=(dbsData.databases||[]).length;
    document.getElementById('stat-tables').textContent=tables.length;
    let total=0;
    await Promise.all(tables.map(async t=>{
      try{ const d=await api(`/api/rows?table_id=${t.id}`); total+=(d.rows||[]).length; }catch{}
    }));
    document.getElementById('stat-rows').textContent=total;
  }catch(e){ console.error(e); }
}

// ─── SQL Editor views ─────────────────────────────────────────────────────────
function showView(v){
  ['databases','tables','table-detail'].forEach(n=>{
    document.getElementById('view-'+n).style.display='none';
  });
  document.getElementById('view-'+v).style.display='';
}

// ─── Databases ────────────────────────────────────────────────────────────────
async function loadDatabases(){
  if(hasRole('staff')) document.getElementById('btn-create-db').style.display='';
  const c=document.getElementById('databases-container');
  c.innerHTML='<div class="empty-state"><div class="spinner"></div></div>';
  try{
    const data=await api('/api/databases');
    const dbs=data.databases||[];
    if(dbs.length===0){
      c.innerHTML=`<div class="empty-state">
        <div class="empty-icon">🗄️</div>
        <div class="empty-text">Nenhum database criado${hasRole('staff')?'. Clique em "+ Novo Database".':'.'}</div>
      </div>`;
      return;
    }
    c.innerHTML=`<div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>#</th><th>Nome</th><th>Descrição</th><th>Tabelas</th><th>Criado por</th><th>Ações</th></tr></thead>
      <tbody>${dbs.map(d=>`
        <tr>
          <td style="color:var(--text-muted)">${d.id}</td>
          <td><strong style="color:var(--blue-glow)">${esc(d.name)}</strong></td>
          <td style="color:var(--text-muted)">${esc(d.description||'—')}</td>
          <td><span style="color:var(--text-primary)">${d.table_count||0}</span></td>
          <td>${esc(d.owner_name)}</td>
          <td class="actions">
            <button class="btn btn-primary btn-sm" onclick="enterDatabase(${d.id},'${esc(d.name)}','${esc(d.description||'')}')">📂 Abrir</button>
            ${hasRole('moderador')?`<button class="btn btn-danger btn-sm" onclick="confirmDeleteDB(${d.id},'${esc(d.name)}')">🗑</button>`:''}
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  }catch(e){ c.innerHTML=`<div class="alert alert-error">❌ ${e.message}</div>`; }
}

async function submitCreateDB(){
  const name=document.getElementById('new-db-name').value.trim();
  const description=document.getElementById('new-db-desc').value.trim();
  if(!name){ toast('Nome obrigatório','warning'); return; }
  try{
    await api('/api/databases','POST',{name,description});
    closeModal('modal-create-db');
    document.getElementById('new-db-name').value='';
    document.getElementById('new-db-desc').value='';
    toast('Database criado!','success');
    loadDatabases();
  }catch(e){ toast(e.message,'error'); }
}

function confirmDeleteDB(id,name){
  document.getElementById('confirm-msg').textContent=`Excluir o database "${name}" e TODAS as suas tabelas e dados?`;
  document.getElementById('confirm-ok-btn').onclick=async()=>{
    try{
      await api('/api/databases','DELETE',{id});
      closeModal('modal-confirm'); toast('Database excluído','success'); loadDatabases();
    }catch(e){ toast(e.message,'error'); }
  };
  openModal('modal-confirm');
}

function enterDatabase(id,name,desc){
  CURRENT_DB={id,name};
  document.getElementById('current-db-name').textContent=name;
  document.getElementById('current-db-desc').textContent=desc||'';
  showView('tables');
  loadTables();
}

function backToDatabases(){
  CURRENT_DB=null;
  showView('databases');
  loadDatabases();
}

// ─── Tables ───────────────────────────────────────────────────────────────────
async function loadTables(){
  if(hasRole('staff')) document.getElementById('btn-create-table').style.display='';
  const c=document.getElementById('tables-container');
  c.innerHTML='<div class="empty-state"><div class="spinner"></div></div>';
  try{
    const data=await api(`/api/tables?database_id=${CURRENT_DB.id}`);
    const tables=data.tables||[];
    if(tables.length===0){
      c.innerHTML=`<div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-text">Nenhuma tabela${hasRole('staff')?'. Clique em "+ Nova Tabela".':'.'}</div>
      </div>`;
      return;
    }
    c.innerHTML=`<div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>#</th><th>Nome</th><th>Colunas</th><th>Criada por</th><th>Ações</th></tr></thead>
      <tbody>${tables.map(t=>`
        <tr>
          <td style="color:var(--text-muted)">${t.id}</td>
          <td><strong>${esc(t.table_name)}</strong></td>
          <td><div class="col-tags">${(t.columns||[]).map(c=>`<span class="col-tag">${esc(c.name)}<small style="opacity:.6"> ${c.type}</small></span>`).join('')}</div></td>
          <td>${esc(t.owner_name||'—')}</td>
          <td class="actions">
            <button class="btn btn-primary btn-sm" onclick="openTableDetail(${t.id})">👁 Abrir</button>
            ${hasRole('moderador')?`<button class="btn btn-danger btn-sm" onclick="confirmDeleteTableById(${t.id},'${esc(t.table_name)}')">🗑</button>`:''}
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  }catch(e){ c.innerHTML=`<div class="alert alert-error">❌ ${e.message}</div>`; }
}

function openCreateTableModal(){
  PENDING_COLS=[];
  document.getElementById('new-table-name').value='';
  document.getElementById('new-col-name').value='';
  document.getElementById('new-cols-list').innerHTML='<span style="color:var(--text-muted);font-size:12px;padding:4px">Nenhuma coluna adicionada</span>';
  openModal('modal-create-table');
}

function addColumnToNew(){
  const name=document.getElementById('new-col-name').value.trim();
  const type=document.getElementById('new-col-type').value;
  const required=document.getElementById('new-col-required').checked;
  if(!name){ toast('Digite o nome da coluna','warning'); return; }
  if(PENDING_COLS.find(c=>c.name===name)){ toast('Coluna já adicionada','warning'); return; }
  PENDING_COLS.push({name,type,required});
  document.getElementById('new-col-name').value='';
  document.getElementById('new-col-required').checked=false;
  renderPendingCols();
}

function removePendingCol(i){
  PENDING_COLS.splice(i,1); renderPendingCols();
}

function renderPendingCols(){
  const el=document.getElementById('new-cols-list');
  if(PENDING_COLS.length===0){
    el.innerHTML='<span style="color:var(--text-muted);font-size:12px;padding:4px">Nenhuma coluna adicionada</span>';
    return;
  }
  el.innerHTML=PENDING_COLS.map((c,i)=>`
    <span class="col-tag" style="display:inline-flex;align-items:center;gap:4px">
      ${esc(c.name)}<small style="opacity:.6">(${c.type})</small>
      ${c.required?'<span style="color:var(--danger);font-size:10px">*</span>':''}
      <span onclick="removePendingCol(${i})" style="cursor:pointer;color:var(--danger);margin-left:2px">✕</span>
    </span>`).join('');
}

async function submitCreateTable(){
  const name=document.getElementById('new-table-name').value.trim();
  if(!name){ toast('Digite o nome da tabela','warning'); return; }
  if(PENDING_COLS.length===0){ toast('Adicione ao menos uma coluna','warning'); return; }
  try{
    await api('/api/tables','POST',{table_name:name,columns:PENDING_COLS,database_id:CURRENT_DB.id});
    closeModal('modal-create-table');
    toast('Tabela criada!','success');
    loadTables();
  }catch(e){ toast(e.message,'error'); }
}

function confirmDeleteTableById(id,name){
  document.getElementById('confirm-msg').textContent=`Excluir a tabela "${name}" e todos os seus dados?`;
  document.getElementById('confirm-ok-btn').onclick=async()=>{
    try{
      await api('/api/tables','DELETE',{id});
      closeModal('modal-confirm'); toast('Tabela excluída','success');
      if(CURRENT_TABLE===id){ CURRENT_TABLE=null; showView('tables'); loadTables(); }
      else loadTables();
    }catch(e){ toast(e.message,'error'); }
  };
  openModal('modal-confirm');
}

// ─── Table Detail ─────────────────────────────────────────────────────────────
async function openTableDetail(tableId){
  CURRENT_TABLE=tableId;
  showView('table-detail');
  if(hasRole('staff')) document.getElementById('btn-edit-cols').style.display='';
  if(hasRole('staff')) document.getElementById('btn-add-row').style.display='';
  if(hasRole('moderador')) document.getElementById('btn-delete-table').style.display='';
  await loadTableDetail();
}

async function loadTableDetail(){
  const c=document.getElementById('table-detail-content');
  c.innerHTML='<div class="empty-state"><div class="spinner"></div></div>';
  try{
    const data=await api(`/api/rows?table_id=${CURRENT_TABLE}`);
    const table=data.table; const rows=data.rows||[];
    CURRENT_TABLE_COLS=table.columns||[];
    document.getElementById('detail-title').textContent=table.table_name;

    if(rows.length===0){
      c.innerHTML=`<div class="alert alert-info" style="margin-bottom:12px">
        Colunas: ${CURRENT_TABLE_COLS.map(col=>`<strong>${col.name}</strong> (${col.type}${col.required?' *':''})`).join(', ')}
      </div>
      <div class="empty-state"><div class="empty-icon">📭</div>
        <div class="empty-text">Nenhum dado${hasRole('staff')?'. Clique em "+ Linha".':'.'}</div>
      </div>`;
      return;
    }

    c.innerHTML=`
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">${rows.length} registro(s) | ${CURRENT_TABLE_COLS.length} coluna(s)</div>
      <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>#</th>
          ${CURRENT_TABLE_COLS.map(col=>`<th>${esc(col.name)}<br><small style="font-size:10px;color:var(--text-muted)">${col.type}</small></th>`).join('')}
          <th>Ações</th>
        </tr></thead>
        <tbody>
          ${rows.map((row,i)=>`
            <tr>
              <td style="color:var(--text-muted)">${i+1}</td>
              ${CURRENT_TABLE_COLS.map(col=>`<td>${esc(String(row.data[col.name]??''))}</td>`).join('')}
              <td class="actions">
                ${hasRole('staff')?`<button class="btn btn-secondary btn-sm btn-icon" onclick='openEditRow(${row.id},${JSON.stringify(row.data)})' title="Editar">✏️</button>`:''}
                ${hasRole('moderador')?`<button class="btn btn-danger btn-sm btn-icon" onclick="confirmDeleteRow(${row.id})" title="Excluir">🗑</button>`:''}
                ${!hasRole('staff')?'<span style="color:var(--text-muted);font-size:11px">👁 leitura</span>':''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table></div>`;
  }catch(e){ c.innerHTML=`<div class="alert alert-error">❌ ${e.message}</div>`; }
}

function backToTables(){
  CURRENT_TABLE=null;
  document.getElementById('btn-edit-cols').style.display='none';
  document.getElementById('btn-add-row').style.display='none';
  document.getElementById('btn-delete-table').style.display='none';
  showView('tables'); loadTables();
}

function confirmDeleteTable(){
  confirmDeleteTableById(CURRENT_TABLE, document.getElementById('detail-title').textContent);
}

// ─── Edit Columns ─────────────────────────────────────────────────────────────
function openEditColsModal(){
  EDIT_COLS=JSON.parse(JSON.stringify(CURRENT_TABLE_COLS)); // deep copy
  renderEditCols();
  document.getElementById('edit-new-col-name').value='';
  document.getElementById('edit-new-col-required').checked=false;
  openModal('modal-edit-cols');
}

function renderEditCols(){
  const el=document.getElementById('edit-cols-list');
  if(EDIT_COLS.length===0){
    el.innerHTML='<p style="color:var(--text-muted);font-size:12px">Nenhuma coluna. Adicione abaixo.</p>';
    return;
  }
  el.innerHTML=`<div class="data-table-wrap"><table class="data-table">
    <thead><tr><th>Nome</th><th>Tipo</th><th>Obrig.</th><th></th></tr></thead>
    <tbody>${EDIT_COLS.map((c,i)=>`
      <tr>
        <td><input class="form-control" style="padding:4px 8px;font-size:12px" value="${esc(c.name)}" onchange="EDIT_COLS[${i}].name=this.value"/></td>
        <td>
          <select class="form-control" style="padding:4px 8px;font-size:12px" onchange="EDIT_COLS[${i}].type=this.value">
            ${['texto','número','decimal','data','data/hora','sim/não','email','url','telefone'].map(t=>
              `<option value="${t}" ${c.type===t?'selected':''}>${t}</option>`
            ).join('')}
          </select>
        </td>
        <td><input type="checkbox" ${c.required?'checked':''} onchange="EDIT_COLS[${i}].required=this.checked" style="accent-color:var(--blue-core)"/></td>
        <td><button class="btn btn-danger btn-sm btn-icon" onclick="removeEditCol(${i})">✕</button></td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function removeEditCol(i){ EDIT_COLS.splice(i,1); renderEditCols(); }

function addColToEdit(){
  const name=document.getElementById('edit-new-col-name').value.trim();
  const type=document.getElementById('edit-new-col-type').value;
  const required=document.getElementById('edit-new-col-required').checked;
  if(!name){ toast('Digite o nome da coluna','warning'); return; }
  if(EDIT_COLS.find(c=>c.name===name)){ toast('Coluna já existe','warning'); return; }
  EDIT_COLS.push({name,type,required});
  document.getElementById('edit-new-col-name').value='';
  document.getElementById('edit-new-col-required').checked=false;
  renderEditCols();
}

async function submitEditCols(){
  if(EDIT_COLS.length===0){ toast('Adicione ao menos uma coluna','warning'); return; }
  try{
    await api('/api/tables','PUT',{id:CURRENT_TABLE, columns:EDIT_COLS});
    closeModal('modal-edit-cols');
    toast('Colunas atualizadas!','success');
    loadTableDetail();
  }catch(e){ toast(e.message,'error'); }
}

// ─── Add Row ──────────────────────────────────────────────────────────────────
function openAddRowModal(){
  document.getElementById('add-row-fields').innerHTML=CURRENT_TABLE_COLS.map(c=>`
    <div class="form-group">
      <label class="form-label">${esc(c.name)} <span style="color:var(--text-muted);font-size:10px">(${c.type}${c.required?' *':''})</span></label>
      ${buildInput(c,'add-row')}
    </div>`).join('');
  openModal('modal-add-row');
}

function buildInput(col, prefix){
  const id=`${prefix}-${col.name}`;
  if(col.type==='sim/não') return `<select id="${id}" class="form-control"><option value="Sim">Sim</option><option value="Não">Não</option></select>`;
  const typeMap={'número':'number','decimal':'number','data':'date','data/hora':'datetime-local','email':'email','url':'url','telefone':'tel'};
  const t=typeMap[col.type]||'text';
  const step=col.type==='decimal'?' step="0.01"':'';
  return `<input id="${id}" type="${t}"${step} class="form-control" placeholder="${esc(col.name)}" ${col.required?'required':''}/>`;
}

async function submitAddRow(){
  const data={};
  CURRENT_TABLE_COLS.forEach(c=>{
    const el=document.getElementById(`add-row-${c.name}`);
    if(el) data[c.name]=el.value;
  });
  try{
    await api('/api/rows','POST',{table_id:CURRENT_TABLE,data});
    closeModal('modal-add-row'); toast('Linha adicionada!','success'); loadTableDetail();
  }catch(e){ toast(e.message,'error'); }
}

// ─── Edit Row ─────────────────────────────────────────────────────────────────
function openEditRow(rowId, rowData){
  EDIT_ROW_ID=rowId;
  document.getElementById('edit-row-fields').innerHTML=CURRENT_TABLE_COLS.map(c=>`
    <div class="form-group">
      <label class="form-label">${esc(c.name)}</label>
      ${buildInput(c,'edit-row')}
    </div>`).join('');
  // Fill values
  CURRENT_TABLE_COLS.forEach(c=>{
    const el=document.getElementById(`edit-row-${c.name}`);
    if(el && rowData[c.name]!=null) el.value=rowData[c.name];
  });
  openModal('modal-edit-row');
}

async function submitEditRow(){
  const data={};
  CURRENT_TABLE_COLS.forEach(c=>{
    const el=document.getElementById(`edit-row-${c.name}`);
    if(el) data[c.name]=el.value;
  });
  try{
    await api('/api/rows','PUT',{id:EDIT_ROW_ID,data});
    closeModal('modal-edit-row'); toast('Linha atualizada!','success'); loadTableDetail();
  }catch(e){ toast(e.message,'error'); }
}

function confirmDeleteRow(rowId){
  document.getElementById('confirm-msg').textContent='Excluir esta linha permanentemente?';
  document.getElementById('confirm-ok-btn').onclick=async()=>{
    try{
      await api('/api/rows','DELETE',{id:rowId});
      closeModal('modal-confirm'); toast('Linha excluída','success'); loadTableDetail();
    }catch(e){ toast(e.message,'error'); }
  };
  openModal('modal-confirm');
}

// ─── Users ────────────────────────────────────────────────────────────────────
async function loadUsers(){
  const isAdmin=hasRole('admin');
  document.getElementById('users-perms-label').textContent=isAdmin?'Admin — edição completa':'Moderador — somente visualização';
  const c=document.getElementById('users-container');
  c.innerHTML='<div class="empty-state"><div class="spinner"></div></div>';
  try{
    const data=await api('/api/users');
    const users=data.users||[];
    const roleLabels={membro:'🟦 Membro',staff:'🟩 Staff',moderador:'🟨 Moderador',admin:'🟥 Admin'};
    c.innerHTML=`<div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>#</th><th>Usuário</th><th>Cargo</th><th>Criado em</th><th>Ações</th></tr></thead>
      <tbody>${users.map(u=>`
        <tr>
          <td style="color:var(--text-muted)">${u.id}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div class="user-avatar" style="width:28px;height:28px;font-size:12px">${u.username[0].toUpperCase()}</div>
              <strong>${esc(u.username)}</strong>
              ${u.username==='admin'?'<span style="font-size:10px;color:var(--text-muted)">[fixo]</span>':''}
              ${u.id===CURRENT_USER.id?'<span style="font-size:10px;color:var(--blue-glow)">[você]</span>':''}
            </div>
          </td>
          <td><span class="role-badge role-${u.role}">${roleLabels[u.role]||u.role}</span></td>
          <td>${new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
          <td class="actions">
            ${isAdmin?`<button class="btn btn-warning btn-sm" onclick="openEditUser(${u.id},'${esc(u.username)}','${u.role}')">✏️ Editar</button>`:'<span style="color:var(--text-muted);font-size:11px">👁 leitura</span>'}
            ${isAdmin&&u.username!=='admin'&&u.id!==CURRENT_USER.id?`<button class="btn btn-danger btn-sm" onclick="confirmDeleteUser(${u.id},'${esc(u.username)}')">🗑</button>`:''}
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  }catch(e){ c.innerHTML=`<div class="alert alert-error">❌ ${e.message}</div>`; }
}

function openEditUser(id,username,role){
  document.getElementById('edit-user-id').value=id;
  document.getElementById('edit-username').value='';
  document.getElementById('edit-password').value='';
  document.getElementById('edit-role').value=role;
  openModal('modal-edit-user');
}

async function submitEditUser(){
  const id=parseInt(document.getElementById('edit-user-id').value);
  const username=document.getElementById('edit-username').value.trim();
  const password=document.getElementById('edit-password').value;
  const role=document.getElementById('edit-role').value;
  const payload={id,role};
  if(username) payload.username=username;
  if(password) payload.password=password;
  try{
    await api('/api/users','PUT',payload);
    closeModal('modal-edit-user'); toast('Usuário atualizado!','success'); loadUsers();
  }catch(e){ toast(e.message,'error'); }
}

function confirmDeleteUser(id,username){
  document.getElementById('confirm-msg').textContent=`Excluir o usuário "${username}"?`;
  document.getElementById('confirm-ok-btn').onclick=async()=>{
    try{
      await api('/api/users','DELETE',{id});
      closeModal('modal-confirm'); toast('Usuário excluído','success'); loadUsers();
    }catch(e){ toast(e.message,'error'); }
  };
  openModal('modal-confirm');
}

// ─── Logs ─────────────────────────────────────────────────────────────────────
let LAST_LOG_ID=0;

async function loadLogs(){
  const c=document.getElementById('logs-container');
  try{
    const data=await api('/api/logs?limit=100');
    const logs=data.logs||[];
    if(logs.length===0){
      c.innerHTML='<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">Nenhum log ainda.</div></div>';
      return;
    }
    // Highlight new entries
    const newestId=logs[0]?.id||0;
    const isNew=id=>id>LAST_LOG_ID;
    LAST_LOG_ID=newestId;

    const actionColor=a=>{
      if(a.includes('Excluiu')) return 'var(--danger)';
      if(a.includes('Criou')) return 'var(--success)';
      if(a.includes('Editou')||a.includes('Alterou')||a.includes('Inseriu')) return 'var(--warning)';
      return 'var(--blue-bright)';
    };

    c.innerHTML=`<div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>#</th><th>Usuário</th><th>Ação</th><th>Detalhes</th><th>Data/Hora</th></tr></thead>
      <tbody>${logs.map(l=>`
        <tr style="${isNew(l.id)?'background:rgba(0,229,160,0.05)':''}">
          <td style="color:var(--text-muted)">${l.id}</td>
          <td>
            <div style="display:flex;align-items:center;gap:6px">
              <div class="user-avatar" style="width:24px;height:24px;font-size:11px">${(l.username||'?')[0].toUpperCase()}</div>
              <span>${esc(l.username||'—')}</span>
              <span style="color:var(--text-muted);font-size:10px">#${l.user_id||'?'}</span>
            </div>
          </td>
          <td><span style="color:${actionColor(l.action)};font-weight:600">${esc(l.action)}</span></td>
          <td style="color:var(--text-muted)">${esc(l.details||'—')}</td>
          <td style="white-space:nowrap">${new Date(l.created_at).toLocaleString('pt-BR')}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  }catch(e){ c.innerHTML=`<div class="alert alert-error">❌ ${e.message}</div>`; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(str){
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

document.addEventListener('keydown',e=>{
  if(e.key==='Enter' && document.getElementById('login-page').classList.contains('active')){
    if(document.getElementById('tab-login').classList.contains('active')) doLogin();
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
(async function boot(){
  if(TOKEN) await enterApp();
})();
