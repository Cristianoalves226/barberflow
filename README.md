# BarberFlow

**BarberFlow** é uma plataforma SaaS de gestão para barbearias, desenvolvida para centralizar agenda, clientes, serviços, equipe, financeiro e indicadores em um único sistema.

O projeto já possui uma base funcional com **React + Vite + Supabase**, autenticação, arquitetura multi-tenant, RLS, gestão de equipe, agenda com proteção contra conflitos, histórico de clientes, financeiro e estrutura de assinaturas.

Atualmente o projeto está em processo de transformação de MVP em **SaaS comercial**, com preparação para cobrança recorrente via **Cakto**, mantendo a integração existente com **Mercado Pago** durante a transição.

---

## 📌 Status atual

| Área | Status |
|---|---|
| Interface web | ✅ Implementada |
| React + Vite | ✅ Implementado |
| Supabase | ✅ Integrado |
| PostgreSQL | ✅ Estruturado |
| Autenticação | ✅ Implementada |
| Cadastro de barbearia | ✅ Implementado |
| Multi-tenant | ✅ Implementado |
| RLS / isolamento de dados | ✅ Implementado |
| Clientes | ✅ Implementado |
| Serviços | ✅ Implementado |
| Agenda | ✅ Implementada |
| Prevenção de conflitos | ✅ Implementada |
| Histórico de clientes | ✅ Implementado |
| Financeiro | ✅ Implementado |
| Equipe | ✅ Implementada |
| Papéis e permissões | ✅ Implementados |
| Planos | ✅ Estruturados |
| Assinaturas | 🟡 Implementadas |
| Mercado Pago | 🟡 Implementado / em testes |
| Abstração de billing | ✅ Implementada |
| Cakto | 🟡 Em integração |
| Webhook Cakto | 🟡 Implementado, aguardando validação final dos eventos reais |
| Checkout Cakto | 🟡 Função preparada |
| Landing page comercial | ✅ Criada |
| Administração global SaaS | ❌ Ainda não implementada |
| Termos/privacidade/políticas comerciais | ❌ Ainda pendentes |
| Produção comercial | 🟡 Em preparação |

---

# 🚀 Funcionalidades

## 🔐 Autenticação

O sistema utiliza o Supabase Auth.

Recursos:

- Cadastro com e-mail e senha
- Login
- Logout
- Recuperação de senha
- Sessão persistente
- Proteção das áreas privadas
- Associação automática do usuário à sua barbearia

Ao criar uma conta, o trigger `public.handle_new_user` cria a estrutura inicial da barbearia e sua associação em `barber_shop_members`.

---

## 🏢 Arquitetura Multi-Tenant

Cada barbearia possui seu próprio tenant.

O usuário autenticado é associado a uma barbearia através de:

`barber_shop_members`

Todas as consultas importantes utilizam o `tenant_id` e são protegidas por **Row Level Security (RLS)**.

Isso permite que várias barbearias utilizem a mesma aplicação sem compartilhar dados entre si.

### Isolamento

- Cada tenant possui seus próprios clientes
- Serviços separados por tenant
- Agendamentos separados por tenant
- Movimentações financeiras separadas por tenant
- Equipe separada por tenant
- Assinatura vinculada ao tenant
- Eventos de cobrança vinculados ao tenant

A `service_role` nunca deve ser exposta no frontend.

---

# 👥 Gestão de equipe

A aplicação possui os papéis:

- `owner`
- `manager`
- `barber`

### Owner

Pode:

- Gerenciar equipe
- Criar convites
- Alterar funções
- Remover membros
- Alterar plano
- Gerenciar a assinatura

### Manager

Pode:

- Consultar a equipe
- Gerenciar operações permitidas pelo sistema
- Consultar dados operacionais

### Barber

Pode:

- Trabalhar com os agendamentos permitidos
- Consultar informações necessárias para os atendimentos

As operações administrativas utilizam funções SQL `SECURITY DEFINER` com validação do usuário autenticado.

---

# 📅 Agenda

A agenda permite:

- Criar agendamento
- Editar agendamento
- Cancelar atendimento
- Alterar status
- Navegar por dia
- Navegar por semana
- Navegar por mês
- Filtrar horários
- Vincular cliente
- Vincular barbeiro
- Vincular serviço

## Proteção contra conflitos

A migration:

`supabase/migrations/20260909220000_barberflow_appointment_safety.sql`

adiciona:

- `ends_at`
- cálculo automático do término do atendimento
- controle de horários ocupados
- proteção contra sobreposição do mesmo barbeiro
- tratamento de cancelamentos
- registro de `cancelled_at`

A constraint:

`appointments_active_barber_no_overlap`

impede que dois atendimentos ativos do mesmo barbeiro se sobreponham dentro da mesma barbearia.

Agendamentos `cancelled` e `completed` não bloqueiam novos horários.

---

# 👤 Clientes

O módulo de clientes permite:

- Cadastro
- Edição
- Telefone
- Aniversário
- Preferências
- Observações
- Histórico
- Último atendimento
- Total gasto em atendimentos concluídos
- Busca

O histórico é obtido de forma segura através da função:

`get_client_history`

respeitando o isolamento por tenant.

---

# ✂️ Serviços

O sistema permite cadastrar e administrar os serviços da barbearia.

Cada serviço pode possuir:

- Nome
- Preço
- Duração
- Status

A duração do serviço também é utilizada pela agenda para calcular automaticamente o horário de término.

---

# 💰 Financeiro

O módulo financeiro permite registrar:

- Receitas
- Despesas
- Movimentações
- Valores
- Datas
- Descrições

O dashboard utiliza os dados carregados do tenant para apresentar indicadores da operação.

---

# 📊 Dashboard

O dashboard centraliza indicadores da barbearia.

Entre as informações utilizadas estão:

- Agendamentos
- Clientes
- Serviços
- Receitas
- Despesas
- Movimentações
- Indicadores financeiros

---

# 💳 Sistema de Billing

O projeto possui uma camada de cobrança preparada para trabalhar com diferentes provedores.

Atualmente estão preparados:

- Mercado Pago
- Cakto

A arquitetura evita deixar o sistema dependente de um único gateway.

## Estrutura

```text
Billing
├── Mercado Pago
└── Cakto
```

---

# 🗄️ Banco de dados

Principais estruturas utilizadas:

- `barber_shops`
- `barber_shop_members`
- `team_invitations`
- `clients`
- `services`
- `appointments`
- tabelas financeiras
- `billing_plans`
- `tenant_subscriptions`
- `billing_payment_events`

---

# 📦 Planos comerciais

Os planos comerciais definidos para o BarberFlow são:

| Plano | Preço |
|---|---:|
| Essencial | **R$ 29,90/mês** |
| Profissional | **R$ 49,90/mês** |
| Premium | **R$ 79,90/mês** |

Os preços comerciais são apresentados na landing page de vendas.

> Os valores exibidos na aplicação e no banco devem ser mantidos sincronizados com os preços e ofertas efetivamente cadastrados no provedor de pagamento.

---

# 🧾 Assinaturas

A tabela:

`tenant_subscriptions`

controla a assinatura de cada barbearia.

Ela armazena informações como:

- Tenant
- Plano atual
- Plano solicitado
- Provedor
- Cliente no provedor
- Produto no provedor
- Oferta no provedor
- Assinatura no provedor
- Status
- Período atual
- Trial
- Cancelamento

Status suportados:

- `trialing`
- `active`
- `past_due`
- `canceled`
- `incomplete`
- `pending`

---

# 🧱 Abstração de provedores

Foi adicionada a migration:

`supabase/migrations/20260915150000_billing_provider_abstraction.sql`

Ela adiciona à assinatura:

- `provider_customer_id`
- `provider_product_id`
- `provider_offer_id`

Também permite os provedores:

- `mercado_pago`
- `cakto`

Foram criados índices para os identificadores externos.

A tabela `billing_payment_events` passou a funcionar como um **ledger de eventos de cobrança independente do provedor**, facilitando idempotência e reconciliação.

---

# 🔄 Seleção de provedor

A função:

`request_subscription_plan(target_plan_code, target_provider)`

permite registrar a intenção de assinatura utilizando:

- `mercado_pago`
- `cakto`

A operação exige usuário autenticado com papel `owner`.

Ao trocar de provedor, identificadores antigos do provedor podem ser limpos para evitar associação incorreta.

---

# 💳 Mercado Pago

O projeto possui integração com Mercado Pago para assinaturas recorrentes.

Edge Functions:

```text
supabase/functions/create-mercado-pago-subscription
supabase/functions/mercado-pago-webhook
```

## Checkout

A função:

`create-mercado-pago-subscription`

é responsável por:

1. Validar autenticação
2. Validar proprietário da barbearia
3. Consultar o plano
4. Consultar o preço no banco
5. Criar/reutilizar a assinatura conforme as regras atuais
6. Registrar o identificador externo
7. Retornar a URL de checkout

## Webhook

A função:

`mercado-pago-webhook`

processa eventos de assinatura e pagamentos.

Ela possui:

- validação HMAC
- identificação do evento
- registro de eventos
- idempotência
- consulta da assinatura no Mercado Pago
- atualização do status local

O fluxo Mercado Pago ainda deve ser considerado **em ambiente de testes até a validação completa dos eventos reais**.

---

# 🟡 Integração Cakto

O BarberFlow está sendo preparado para comercialização através da Cakto.

Foi criada uma estrutura específica para separar o billing do restante do sistema.

## Webhook

Foi criada:

`supabase/functions/cakto-webhook/index.ts`

Responsabilidades previstas:

- Receber eventos da Cakto
- Validar a requisição
- Identificar o evento
- Identificar produto/oferta/assinatura
- Localizar o tenant
- Registrar o evento
- Evitar processamento duplicado
- Atualizar `tenant_subscriptions`

A tabela:

`billing_payment_events`

é utilizada para idempotência através do identificador do evento.

### Eventos comerciais esperados

A integração está preparada para trabalhar com eventos como:

- Compra aprovada
- Assinatura cancelada
- Renovação
- Reembolso
- Falha de pagamento/inadimplência

**Importante:** antes de colocar a integração Cakto em produção, os nomes exatos dos eventos, payloads e mecanismo de assinatura/autenticação do webhook devem ser conferidos na documentação atual da Cakto e testados com eventos reais de teste.

---

# 🛒 Checkout Cakto

Foi criada:

`supabase/functions/create-cakto-checkout/index.ts`

A função:

1. Autentica o usuário
2. Verifica se ele é `owner`
3. Recebe o código do plano
4. Seleciona a oferta correspondente
5. Registra o provedor como `cakto`
6. Registra os identificadores comerciais
7. Monta a URL de checkout
8. Retorna a URL para o frontend

As URLs e IDs comerciais serão configurados através de secrets/configuração da Edge Function.

Variáveis previstas:

```text
CAKTO_ESSENCIAL_CHECKOUT_URL
CAKTO_PROFISSIONAL_CHECKOUT_URL
CAKTO_PREMIUM_CHECKOUT_URL

CAKTO_ESSENCIAL_OFFER_ID
CAKTO_PROFISSIONAL_OFFER_ID
CAKTO_PREMIUM_OFFER_ID

CAKTO_PRODUCT_ID
```

**Nunca coloque tokens privados da Cakto no frontend.**

---

# 🌐 Landing Page Comercial

Foi criada a landing page:

`public/vendas/index.html`

Ela apresenta o BarberFlow como produto SaaS.

URL esperada no GitHub Pages:

```text
https://cristianoalves226.github.io/barberflow/vendas/
```

A página contém:

- Hero comercial
- Apresentação do produto
- Recursos
- Agenda
- Clientes
- Serviços
- Equipe
- Financeiro
- Dashboard
- Planos
- Preços
- Como funciona
- CTA de conversão
- Layout responsivo
- SEO básico
- Meta description
- Meta theme-color

Os CTAs dos planos estão preparados para receber posteriormente os links reais de checkout da Cakto.

---

# 📣 Oferta comercial

### Essencial — R$ 29,90/mês

Indicado para barbearias que desejam organizar a operação.

Inclui:

- Agenda
- Clientes
- Serviços
- Histórico
- Dashboard básico

### Profissional — R$ 49,90/mês

Indicado para barbearias em crescimento.

Inclui:

- Recursos do Essencial
- Gestão de equipe
- Financeiro
- Relatórios
- Recursos adicionais de gestão

### Premium — R$ 79,90/mês

Indicado para operações que precisam de uma gestão mais completa.

Inclui:

- Recursos do Profissional
- Indicadores avançados
- Relatórios completos
- Gestão ampliada
- Recursos avançados

Os recursos comerciais devem ser mantidos alinhados com o que estiver efetivamente liberado no sistema para cada plano.

---

# 🔒 Segurança

O projeto utiliza diversas camadas de proteção:

- Supabase Auth
- RLS
- Multi-tenancy
- Funções `SECURITY DEFINER`
- Validação de `auth.uid()`
- Controle por papel
- Webhooks separados do frontend
- Secrets nas Edge Functions
- Não exposição da `service_role`
- Idempotência dos eventos de cobrança
- Constraint contra conflito de agenda

## Variáveis sensíveis

Nunca versionar:

- `SUPABASE_SERVICE_ROLE_KEY`
- Tokens de Mercado Pago
- Segredos de webhook
- Tokens da Cakto
- Credenciais administrativas

O frontend deve utilizar somente variáveis públicas necessárias, como:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica
```

---

# ⚙️ Configuração local

## Requisitos

- Node.js
- npm
- Projeto Supabase
- Git

## Instalação

```bash
git clone https://github.com/Cristianoalves226/barberflow.git
cd barberflow
npm install
```

Crie o arquivo:

`.env`

com:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica-do-supabase
```

Execute:

```bash
npm run dev
```

Para build:

```bash
npm run build
```

---

# 🗃️ Migrations

As principais migrations do projeto são executadas em ordem.

Entre as principais:

```text
20260909180000_barberflow_mvp.sql
20260909200000_barberflow_team_management.sql
20260909220000_barberflow_appointment_safety.sql
20260909230000_barberflow_client_history.sql
20260910100000_barberflow_billing.sql
20260910120000_barberflow_professional_price.sql
20260910121000_barberflow_billing_event_subscription_id.sql
20260915150000_billing_provider_abstraction.sql
20260922180000_billing_provider_request.sql
```

As migrations mais recentes adicionam a abstração de billing e suporte ao provedor Cakto.

---

# ☁️ Supabase Edge Functions

Atualmente relacionadas ao billing:

```text
create-mercado-pago-subscription
mercado-pago-webhook
create-mercado-pago-test-buyer
cakto-webhook
create-cakto-checkout
```

No arquivo:

`supabase/config.toml`

as funções de webhook são configuradas sem JWT, pois precisam receber chamadas externas do gateway.

A função de criação de checkout exige autenticação.

---

# 🌍 GitHub Pages

O projeto possui workflow:

`.github/workflows/deploy-pages.yml`

A publicação utiliza **GitHub Actions**.

URL principal:

```text
https://cristianoalves226.github.io/barberflow/
```

Landing comercial:

```text
https://cristianoalves226.github.io/barberflow/vendas/
```

No GitHub Pages, a fonte deve ser:

**Settings → Pages → Build and deployment → GitHub Actions**

---

# 🌿 Branch de comercialização

As alterações relacionadas à transformação do BarberFlow em SaaS comercial estão sendo desenvolvidas na branch:

```text
feat/cakto-billing-foundation
```

O objetivo é validar a nova arquitetura antes de incorporá-la à `main`.

## Pull Request

Foi criado o PR:

```text
feat: adicionar landing page comercial do BarberFlow
```

PR #20:

https://github.com/Cristianoalves226/barberflow/pull/20

O PR permanece em desenvolvimento/validação e não deve ser considerado incorporado à `main` até a conclusão dos testes.

---

# 🧭 Arquitetura atual

Visão simplificada:

```text
                         ┌─────────────────────┐
                         │     BarberFlow      │
                         │   React + Vite      │
                         └──────────┬──────────┘
                                    │
                 ┌──────────────────┼──────────────────┐
                 │                  │                  │
                 ▼                  ▼                  ▼
             Supabase             Auth              Billing
                 │                                     │
        ┌────────┼────────┐                   ┌────────┴────────┐
        │        │        │                   │                 │
        ▼        ▼        ▼                   ▼                 ▼
      Banco     RLS     Functions        Mercado Pago         Cakto
        │                                     │                 │
        └─────────────────────────────────────┴─────────────────┘
```

---

# 🛣️ Próximas etapas

Para transformar o projeto em um SaaS comercial completo:

### 1. Finalizar Cakto

- Criar produto na Cakto
- Criar as três ofertas
- Configurar:
  - Essencial — R$ 29,90/mês
  - Profissional — R$ 49,90/mês
  - Premium — R$ 79,90/mês
- Obter IDs de produto/ofertas
- Obter URLs de checkout
- Configurar webhook
- Validar payloads reais
- Testar aprovação
- Testar renovação
- Testar cancelamento
- Testar reembolso
- Testar falha de pagamento

### 2. Conectar o frontend

- Substituir os CTAs temporários da landing page
- Conectar os planos aos checkouts Cakto
- Atualizar a tela de assinatura
- Exibir o provedor correto
- Atualizar status após webhook

### 3. Experiência comercial

- Melhorar onboarding
- Trial
- Tela de assinatura
- Tela de status da assinatura
- Cancelamento
- Expiração
- Bloqueio de recursos conforme plano

### 4. SaaS Admin

Criar área administrativa global para:

- Número de barbearias
- Usuários
- Assinaturas
- Trials
- Cancelamentos
- Planos
- Eventos de webhook
- Receita recorrente
- Monitoramento

### 5. Produção

- Domínio próprio
- HTTPS
- SMTP
- Políticas de privacidade
- Termos de uso
- Política de cancelamento/reembolso
- Suporte
- Monitoramento
- Backups
- Logs
- Proteção contra abuso
- Testes de carga e segurança

---

# 🧪 Checklist antes da venda

- [ ] Cakto product criado
- [ ] Oferta Essencial criada
- [ ] Oferta Profissional criada
- [ ] Oferta Premium criada
- [ ] IDs cadastrados
- [ ] URLs de checkout cadastradas
- [ ] Webhook configurado
- [ ] Compra aprovada testada
- [ ] Renovação testada
- [ ] Cancelamento testado
- [ ] Reembolso testado
- [ ] Falha de pagamento testada
- [ ] Idempotência testada
- [ ] Status da assinatura atualizado no BarberFlow
- [ ] Acesso conforme plano validado
- [ ] Landing page validada
- [ ] Termos de uso publicados
- [ ] Política de privacidade publicada
- [ ] Política comercial publicada
- [ ] Domínio definido
- [ ] Backup configurado
- [ ] Monitoramento configurado
- [ ] Build de produção validada

---

# 📄 Licença

Projeto proprietário em desenvolvimento.

O código deste repositório não deve ser redistribuído ou comercializado sem autorização do proprietário.

---

## 👨‍💻 Projeto

**BarberFlow**

Plataforma SaaS para gestão de barbearias.

GitHub:

https://github.com/Cristianoalves226/barberflow
