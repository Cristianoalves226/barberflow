# BarberFlow

MVP de gestão para barbearias com dashboard, agenda, clientes, serviços e
controle financeiro.

## Stack

- React + Vite
- Supabase (`@supabase/supabase-js`)
- CSS existente do protótipo (sem dependência de Tailwind)

## Configuração do Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No painel do projeto, abra **SQL Editor**, crie uma query e cole todo o
   conteúdo de
   `supabase/migrations/20260909180000_barberflow_mvp.sql`. Execute a query.
   Ela cria as tabelas, relacionamentos, índices, triggers de timestamp, RLS e
   o tenant de demonstração.
3. Copie `.env.example` para `.env` na raiz do projeto e preencha as variáveis
   com **Project URL** e **Publishable/anon key** (em
   **Project Settings > API**):

   ```env
   VITE_SUPABASE_URL=https://seu-projeto.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-publica-do-supabase
   ```

4. Instale e execute:

   ```bash
   npm install
   npm run dev
   ```

   Para validar uma build de produção, execute `npm run build`.

### Estratégia de tenant no MVP

O MVP ainda não pressupõe autenticação. Quando as variáveis Supabase estão
configuradas, o app usa o tenant fixo
`00000000-0000-0000-0000-000000000001` e as políticas RLS permitem que apenas
esse tenant seja lido ou alterado pela chave pública. Isso permite testar o
fluxo sem login, mas **não deve ser usado com dados reais**. Antes de publicar,
adicione autenticação e troque as políticas da migration por políticas baseadas
em `auth.uid()` e numa tabela de membros.

Se as variáveis não estiverem configuradas, o app usa os dados estáticos locais
do protótipo e mantém os formulários funcionais apenas na sessão atual. Quando
o Supabase está configurado, erros de rede, schema ou RLS aparecem na interface
com uma ação para tentar novamente; eles não são silenciosamente ignorados.

## Funcionalidades conectadas

- Carregamento de appointments, clientes, serviços e movimentações financeiras
  do tenant demo.
- Criação de agendamentos, clientes, serviços e receitas/despesas.
- Métricas do dashboard e financeiro derivadas dos dados carregados.
- Busca de clientes e índices para as consultas mais frequentes.

## Publicação no GitHub Pages

O repositório já inclui o workflow `.github/workflows/deploy-pages.yml`.
No GitHub, configure em **Settings > Pages > Build and deployment** a opção
**Source: GitHub Actions** e crie os secrets do repositório
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Depois de enviar a branch
`main`, o workflow publicará em:

`https://cristianoalves226.github.io/barberflow/`
