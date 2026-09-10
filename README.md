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
   o vínculo seguro entre usuários e barbearias.
3. Copie `.env.example` para `.env` na raiz do projeto e preencha as variáveis
   com **Project URL** e **Publishable/anon key** (em
   **Project Settings > API**):

   ```env
   VITE_SUPABASE_URL=https://seu-projeto.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-publica-do-supabase
   ```

4. Em **Authentication > Providers**, habilite o provider **Email**. Para
   desenvolvimento, você pode desabilitar a confirmação de e-mail; em
   produção, mantenha-a habilitada e configure o SMTP do projeto.
5. Em **Authentication > URL Configuration**, configure:
   - **Site URL**: `https://cristianoalves226.github.io/barberflow/`
   - **Redirect URLs**: `https://cristianoalves226.github.io/barberflow/` e
     `http://localhost:5173/` (desenvolvimento)

   O fluxo de **Esqueci minha senha** usa automaticamente a origem atual e o
   caminho base da aplicação como `redirectTo`. Assim, o link de recuperação
   retorna para o GitHub Pages e abre o formulário para criar uma nova senha.
   Se o repositório for publicado com outro nome, substitua `/barberflow/` pelo
   caminho correspondente nas duas configurações acima.
6. Instale e execute:

   ```bash
   npm install
   npm run dev
   ```

   Para validar uma build de produção, execute `npm run build`.

### Autenticação e isolamento de dados

O app exige uma sessão Supabase antes de renderizar o dashboard. O login e o
cadastro usam e-mail/senha, e o botão **Sair** encerra a sessão. Após um
cadastro, o trigger `public.handle_new_user` (criado pela migration) usa
`SECURITY DEFINER` para criar uma barbearia pessoal e uma linha em
`barber_shop_members`; o nome informado no cadastro é salvo como nome da
barbearia. Assim, o usuário não precisa receber permissões elevadas no
frontend.

O app resolve o `tenant_id` consultando a associação do usuário autenticado em
`barber_shop_members`. Todas as consultas e inserções usam esse tenant, e as
políticas RLS verificam `auth.uid()` para cada tabela. A chave usada no
frontend é somente a chave pública (anon/publishable); nunca coloque a
`service_role` key em `.env` do Vite, no navegador ou em secrets expostos.

Se a migration já tiver sido aplicada em um projeto, execute a versão
atualizada no SQL Editor (ou crie uma nova migration equivalente) antes de
testar o cadastro. Usuários criados antes do trigger precisam receber uma
linha em `barber_shop_members` por um processo administrativo seguro; não
insira essa associação pelo cliente.

## Funcionalidades conectadas

- Carregamento de appointments, clientes, serviços e movimentações financeiras
  da barbearia vinculada ao usuário autenticado.
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
