# BarberFlow

MVP de gestão para barbearias com dashboard, agenda, clientes, serviços e
controle financeiro.

## Stack

- React + Vite
- Supabase (`@supabase/supabase-js`)
- CSS existente do protótipo (sem dependência de Tailwind)

## Configuração do Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No painel do projeto, abra **SQL Editor**, crie uma query e execute, nesta
   ordem, as migrations
   `supabase/migrations/20260909180000_barberflow_mvp.sql` e
   `supabase/migrations/20260909200000_barberflow_team_management.sql` e
   `supabase/migrations/20260909220000_barberflow_appointment_safety.sql` e
   `supabase/migrations/20260909230000_barberflow_client_history.sql`.
   A primeira cria as tabelas, relacionamentos, índices, triggers de timestamp,
   RLS e o vínculo seguro entre usuários e barbearias. A segunda adiciona
   membros, funções e solicitações de convite. A terceira adiciona o horário de
   término dos atendimentos, cancelamento e a restrição de exclusão que impede
   sobreposição do mesmo barbeiro dentro da mesma barbearia. A quarta adiciona
   aniversário e preferências opcionais aos clientes e a função segura
   `get_client_history`, usada para exibir o histórico sem atravessar o
   isolamento por tenant. Se as três primeiras já foram aplicadas, execute
   somente `20260909230000_barberflow_client_history.sql`; caso contrário,
   execute as migrations ainda pendentes na ordem acima.
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

### Equipe, funções e convites

A tela **Configurações > Equipe** usa as funções `owner`, `manager` e
`barber`. Proprietários e gerentes podem consultar a equipe, criar solicitações
de convite, alterar a função (barbeiro/gerente) e remover membros. Barbeiros
somente consultam a equipe. As alterações administrativas passam por funções
SQL `SECURITY DEFINER` com validação de `auth.uid()`; não há `service_role` no
frontend.

Por segurança, o navegador não consulta `auth.users` por e-mail e não tenta
enviar convites com privilégios administrativos. O botão **Criar convite**
grava uma solicitação pendente em `team_invitations`. Para concluir uma
solicitação no MVP:

1. Se o convidado ainda não tiver conta, ele deve criar uma conta no
   BarberFlow usando o mesmo e-mail (confirmação de e-mail segue as regras do
   provedor). Quando existe exatamente um convite pendente, a migration
   associa a nova conta diretamente ao tenant e marca o convite como
   concluído.
2. Para um e-mail que já tinha conta quando a migration foi aplicada (ou para
   convites ambíguos), um administrador do projeto abre o **SQL Editor** do
   Supabase e executa o bloco abaixo, substituindo o e-mail. Execute-o apenas
   como administrador do projeto, nunca pelo cliente:

   ```sql
   do $$
   declare
     invitation_row public.team_invitations%rowtype;
     invited_user_id uuid;
   begin
     select * into invitation_row
     from public.team_invitations
     where lower(email) = lower('barbeiro@exemplo.com')
       and status = 'pending'
       and expires_at > now()
     order by created_at desc
     limit 1;

     if invitation_row.id is null then
       raise exception 'Convite pendente não encontrado ou expirado';
     end if;

     select id into invited_user_id
     from auth.users
     where lower(email) = lower(invitation_row.email)
     limit 1;

     if invited_user_id is null then
       raise exception 'O convidado ainda não criou a conta';
     end if;

     -- Cada conta tem uma única associação no schema atual; a operação
     -- transfere a associação existente para o tenant do convite.
     update public.barber_shop_members
     set tenant_id = invitation_row.tenant_id, role = invitation_row.role
     where user_id = invited_user_id;

     if not found then
       insert into public.barber_shop_members (tenant_id, user_id, role)
       values (invitation_row.tenant_id, invited_user_id, invitation_row.role);
     end if;

     update public.team_invitations
     set status = 'accepted', accepted_at = now()
     where id = invitation_row.id;
   end $$;
   ```

   O bloco deve ser executado com uma conexão administrativa do Supabase; não
   copie a `service_role` para `.env`, para o navegador ou para o GitHub.
3. Depois de o convidado entrar novamente, a equipe aparecerá no tenant
   correto. Para automatizar a conclusão administrativa de contas existentes,
   encapsule o mesmo processo em uma Supabase Edge Function que valide o
   JWT/e-mail do convidado e use `SUPABASE_SERVICE_ROLE_KEY` somente como
   secret da função. A função não deve aceitar `tenant_id`, `user_id` ou
   `role` arbitrários do navegador: leia esses valores do convite pendente e
   valide o e-mail autenticado.

As policies de RLS permitem que qualquer membro veja a própria equipe, mas
somente `owner`/`manager` conseguem ver solicitações e executar as funções de
convite, alteração e remoção. Os convites expiram em sete dias e a migration
impede alterar/remover o proprietário ou promover alguém a proprietário pelo
cliente.

## Funcionalidades conectadas

- Carregamento de appointments, clientes, serviços e movimentações financeiras
  da barbearia vinculada ao usuário autenticado.
- Criação, edição, cancelamento e mudança de status de agendamentos. A agenda
  oferece filtros e navegação por dia, semana e mês; os conflitos de horário
  são rejeitados pelo Supabase e exibidos em português.
- Criação de clientes, serviços e receitas/despesas.
- Cadastro e edição de telefone, aniversário, preferências e observações dos
  clientes. A tela de clientes mostra o último atendimento e o total gasto
  somente em agendamentos concluídos, além do histórico completo.
- Métricas do dashboard e financeiro derivadas dos dados carregados.
- Busca de clientes e índices para as consultas mais frequentes.

### Segurança da agenda

A migration `20260909220000_barberflow_appointment_safety.sql` deve ser
executada **depois** das duas migrations anteriores. Ela preenche `ends_at`
dos agendamentos existentes a partir da duração do serviço e cria a constraint
`appointments_active_barber_no_overlap`, usando uma faixa `[starts_at, ends_at)`
por `tenant_id` e barbeiro. Agendamentos `cancelled` e `completed` não ocupam
horário; os demais não podem se sobrepor. O trigger também recalcula o fim
quando o serviço ou horário muda e registra `cancelled_at`.

Se o banco já tiver agendamentos ativos conflitantes, resolva-os (alterando o
horário ou cancelando um deles) antes de executar essa migration; a criação da
constraint deve ser atômica e não deve ser ignorada. O RLS continua permitindo
que barbeiros operem somente os agendamentos do próprio tenant, sem conceder
permissões de gerenciamento da equipe.

## Publicação no GitHub Pages

O repositório já inclui o workflow `.github/workflows/deploy-pages.yml`.
No GitHub, configure em **Settings > Pages > Build and deployment** a opção
**Source: GitHub Actions** e crie os secrets do repositório
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Depois de enviar a branch
`main`, o workflow publicará em:

`https://cristianoalves226.github.io/barberflow/`
