# DS-Vanguards© — Painel de Administração

> Projeto do curso **Técnico em Desenvolvimento de Sistemas — 3º Ano**
> E.E Professor Francisco de Assis Pires Corrêa

---

## 🗂 Estrutura do Projeto

```
ds-vanguards/
├── api/
│   ├── auth.js       ← Login, registro, /me
│   ├── users.js      ← Gerenciar usuários (admin)
│   ├── tables.js     ← Criar/listar/excluir tabelas
│   └── rows.js       ← CRUD de dados nas tabelas
├── lib/
│   ├── db.js         ← Conexão PostgreSQL + initDB
│   └── auth.js       ← JWT, middleware de permissões
├── public/
│   ├── index.html    ← SPA completa
│   ├── css/style.css ← Tema DS-Vanguards azul
│   └── js/app.js     ← Toda a lógica do frontend
├── package.json
├── vercel.json
└── README.md
```

---

## 🚀 Deploy (Vercel + GitHub + Supabase)

### Passo 1 — Banco de Dados: Supabase (PostgreSQL grátis)

1. Acesse [https://supabase.com](https://supabase.com) e crie uma conta gratuita
2. Clique em **New Project**
3. Dê um nome ao projeto (ex: `ds-vanguards`)
4. Anote a senha do banco
5. Vá em **Settings → Database → Connection string → URI**
6. Copie a URI (começa com `postgresql://postgres:...`)
   - Substitua `[YOUR-PASSWORD]` pela senha criada
   - Essa é sua `DATABASE_URL`

### Passo 2 — GitHub

1. Crie um repositório no GitHub (pode ser privado)
2. Suba todos os arquivos deste projeto:
```bash
git init
git add .
git commit -m "DS-Vanguards Panel - projeto TDS"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/ds-vanguards.git
git push -u origin main
```

### Passo 3 — Vercel

1. Acesse [https://vercel.com](https://vercel.com) e faça login com GitHub
2. Clique em **Add New → Project**
3. Selecione o repositório `ds-vanguards`
4. Em **Environment Variables**, adicione:

| Nome | Valor |
|------|-------|
| `DATABASE_URL` | sua URI do Supabase |
| `JWT_SECRET` | qualquer texto secreto (ex: `vgs-tds-2025-secreto`) |
| `NODE_ENV` | `production` |

5. Clique em **Deploy**
6. Aguarde — seu site estará em `https://ds-vanguards.vercel.app`

---

## 🔑 Acesso Padrão

```
Usuário: admin
Senha:   Admin@VGS2025
```

> **Mude a senha após o primeiro login!** (Painel → Usuários → Editar admin)

---

## 👥 Sistema de Cargos

| Cargo | Visualizar | Editar | Excluir | Gerenciar Usuários |
|-------|:---:|:---:|:---:|:---:|
| 🟦 Membro | ✅ | ❌ | ❌ | ❌ |
| 🟩 Staff | ✅ | ✅ | ❌ | ❌ |
| 🟨 Moderador | ✅ | ✅ | ✅ | ❌ |
| 🟥 Admin | ✅ | ✅ | ✅ | ✅ |

---

## 💻 Rodar Localmente

```bash
# Instalar dependências
npm install

# Variáveis de ambiente (.env)
DATABASE_URL=postgresql://postgres:SENHA@db.PROJETO.supabase.co:5432/postgres
JWT_SECRET=qualquer-segredo-aqui

# Iniciar servidor
npm run dev
```

Acesse: `http://localhost:3000`

---

## 🛠 Tecnologias (aulas do curso)

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js (serverless functions)
- **Banco de Dados**: PostgreSQL
- **Autenticação**: JWT (JSON Web Tokens)
- **Criptografia**: bcryptjs (senhas hasheadas)
- **Deploy**: Vercel (serverless) + GitHub
- **Banco remoto**: Supabase (PostgreSQL na nuvem)
