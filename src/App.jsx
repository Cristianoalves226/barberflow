import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Users,
  Scissors,
  LayoutDashboard,
  WalletCards,
  Settings,
  Menu,
  Bell,
  Plus,
  Clock3,
  TrendingUp,
  MessageCircle,
  MoreHorizontal,
} from 'lucide-react';
import {
  createAppointmentRecord,
  createClientRecord,
  createFinanceMovement,
  createServiceRecord,
  getAuthSession,
  resetPasswordForEmail,
  signInWithPassword,
  signUpWithPassword,
  signOut,
  updatePassword,
  isSupabaseConfigured,
  loadBarberFlowData,
  subscribeToAuthState,
} from './lib/supabase';

const REPORT_DATE = '2026-09-09';
const EMPTY_DATA = {
  appointments: [],
  clients: [],
  services: [],
  finance: [],
};

const FALLBACK_DATA = {
  appointments: [
    {
      id: 'fallback-1',
      date: REPORT_DATE,
      time: '09:00',
      client: 'Carlos Eduardo',
      service: 'Corte + Barba',
      barber: 'João',
      status: 'Confirmado',
      amountCents: 8000,
    },
    {
      id: 'fallback-2',
      date: REPORT_DATE,
      time: '10:00',
      client: 'Marcos Silva',
      service: 'Corte masculino',
      barber: 'Pedro',
      status: 'Em atendimento',
      amountCents: 4500,
    },
    {
      id: 'fallback-3',
      date: REPORT_DATE,
      time: '11:30',
      client: 'Rafael Souza',
      service: 'Barba',
      barber: 'João',
      status: 'Agendado',
      amountCents: 4000,
    },
    {
      id: 'fallback-4',
      date: REPORT_DATE,
      time: '14:00',
      client: 'Lucas Oliveira',
      service: 'Corte + Barba',
      barber: 'Carlos',
      status: 'Agendado',
      amountCents: 8000,
    },
    {
      id: 'fallback-5',
      date: REPORT_DATE,
      time: '15:30',
      client: 'André Lima',
      service: 'Corte masculino',
      barber: 'Pedro',
      status: 'Agendado',
      amountCents: 4500,
    },
  ],
  clients: [
    { id: 'fallback-client-1', name: 'Carlos Eduardo', phone: '6599999-0001', last: 'Hoje', lastVisitAt: REPORT_DATE, totalCents: 8500 },
    { id: 'fallback-client-2', name: 'Marcos Silva', phone: '6599999-0002', last: 'Hoje', lastVisitAt: REPORT_DATE, totalCents: 4500 },
    { id: 'fallback-client-3', name: 'Rafael Souza', phone: '6599999-0003', last: '12/08/2026', lastVisitAt: '2026-08-12', totalCents: 18000 },
    { id: 'fallback-client-4', name: 'Lucas Oliveira', phone: '6599999-0004', last: '05/08/2026', lastVisitAt: '2026-08-05', totalCents: 24000 },
  ],
  services: [
    { id: 'fallback-service-1', name: 'Corte masculino', duration: '40 min', durationMinutes: 40, price: 'R$ 45,00', priceCents: 4500, count: 86 },
    { id: 'fallback-service-2', name: 'Barba', duration: '30 min', durationMinutes: 30, price: 'R$ 40,00', priceCents: 4000, count: 62 },
    { id: 'fallback-service-3', name: 'Corte + Barba', duration: '70 min', durationMinutes: 70, price: 'R$ 80,00', priceCents: 8000, count: 48 },
  ],
  finance: [
    { id: 'fallback-finance-1', type: 'income', amountCents: 8000, description: 'Corte + Barba', date: REPORT_DATE, dateLabel: '09/09/2026' },
    { id: 'fallback-finance-2', type: 'expense', amountCents: 32000, description: 'Compra de produtos', date: '2026-09-08', dateLabel: '08/09/2026' },
    { id: 'fallback-finance-3', type: 'income', amountCents: 4500, description: 'Corte masculino', date: '2026-09-08', dateLabel: '08/09/2026' },
  ],
};

const money = (cents) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    (cents || 0) / 100
  );

const initials = (name) =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');

const dateInputDefault = () => new Date().toISOString().slice(0, 10);

function authErrorMessage(error, fallback) {
  const message = error?.message?.toLowerCase() || '';
  if (message.includes('invalid login credentials')) {
    return 'E-mail ou senha inválidos.';
  }
  if (message.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar.';
  }
  if (message.includes('user already registered')) {
    return 'Este e-mail já está cadastrado. Tente entrar ou recuperar sua senha.';
  }
  if (message.includes('password should be at least')) {
    return 'A senha deve ter pelo menos 6 caracteres.';
  }
  if (message.includes('same password')) {
    return 'A nova senha precisa ser diferente da senha atual.';
  }
  if (message.includes('expired') || message.includes('invalid token')) {
    return 'Este link de recuperação expirou ou não é mais válido. Solicite um novo link.';
  }
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  }
  return fallback;
}

function App() {
  const [session, setSession] = useState(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [authError, setAuthError] = useState('');
  const [active, setActive] = useState('Dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(EMPTY_DATA);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return undefined;
    }

    let mounted = true;
    let recoveryDetected = false;
    const unsubscribe = subscribeToAuthState((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') {
        recoveryDetected = true;
        setPasswordRecovery(true);
      }
      if (event === 'SIGNED_OUT') setPasswordRecovery(false);
      setAuthError('');
      setError('');
    });

    getAuthSession()
      .then((currentSession) => {
        if (mounted && (currentSession || !recoveryDetected)) setSession(currentSession);
      })
      .catch((sessionError) => {
        if (mounted) setAuthError(authErrorMessage(sessionError, 'Não foi possível verificar sua sessão. Tente novamente.'));
      })
      .finally(() => {
        if (mounted) setAuthLoading(false);
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!session) {
      return;
    }

    setLoading(true);
    try {
      setError('');
      setData(await loadBarberFlowData());
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar os dados do Supabase.');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) refresh();
  }, [refresh, session]);

  const derivedData = useMemo(() => {
    const totals = data.appointments.reduce((result, appointment) => {
      if (appointment.clientId) {
        result[appointment.clientId] = (result[appointment.clientId] || 0) + appointment.amountCents;
      }
      return result;
    }, {});
    return {
      ...data,
      clients: data.clients.map((client) => ({
        ...client,
        totalCents: client.totalCents || totals[client.id] || 0,
        total: money(client.totalCents || totals[client.id] || 0),
      })),
    };
  }, [data]);

  const save = async (type, values) => {
    setSaving(true);
    setError('');
    try {
      if (type === 'appointment') await createAppointmentRecord(values);
      if (type === 'client') await createClientRecord(values);
      if (type === 'service') await createServiceRecord(values);
      if (type === 'finance') await createFinanceMovement(values);
      await refresh();
      setModal(null);
    } catch (saveError) {
      setError(saveError.message || 'Não foi possível salvar este registro.');
    } finally {
      setSaving(false);
    }
  };

  const openNewAppointment = () => setModal('appointment');
  const nav = [
    ['Dashboard', LayoutDashboard],
    ['Agenda', CalendarDays],
    ['Clientes', Users],
    ['Serviços', Scissors],
    ['Financeiro', WalletCards],
    ['Configurações', Settings],
  ];

  const renderContent = () => {
    if (active === 'Agenda') return <Agenda data={derivedData} onNew={openNewAppointment} />;
    if (active === 'Clientes') return <Clients data={derivedData} onNew={() => setModal('client')} />;
    if (active === 'Serviços') return <Services data={derivedData} onNew={() => setModal('service')} />;
    if (active === 'Financeiro') return <Finance data={derivedData} onNew={() => setModal('finance')} />;
    return <Dashboard data={derivedData} onNew={openNewAppointment} />;
  };

  if (!isSupabaseConfigured) {
    return <AuthPanel configured={false} />;
  }

  if (authLoading) {
    return <div className="auth-shell"><div className="loading-state">Verificando sua sessão...</div></div>;
  }

  if (passwordRecovery) {
    return <UpdatePasswordPanel onComplete={() => setPasswordRecovery(false)} />;
  }

  if (!session) {
    return <AuthPanel error={authError} onError={setAuthError} />;
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand"><span className="brand-mark">B</span><span>Barber<span>Flow</span></span></div>
        <nav>
          {nav.map(([label, Icon]) => (
            <button key={label} className={active === label ? 'nav-item active' : 'nav-item'} onClick={() => { setActive(label); setMenuOpen(false); }}>
              <Icon size={19} /> <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom"><div className="plan">Plano <strong>Profissional</strong><small>23 dias restantes</small></div></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}><Menu size={22} /></button>
          <div><p className="eyebrow">QUARTA-FEIRA, 09 DE SETEMBRO</p><h1>{active}</h1></div>
          <div className="top-actions"><button className="icon-btn"><Bell size={19} /><i /></button><div className="avatar">{initials(session.user.email || 'U')}</div><button className="logout-btn" onClick={() => signOut().catch((signOutError) => setError(authErrorMessage(signOutError, 'Não foi possível sair da conta. Tente novamente.')))}>Sair</button></div>
        </header>
        {error && <div className="error-banner" role="alert"><strong>Não foi possível concluir a operação.</strong><span>{error}</span><button onClick={refresh}>Tentar novamente</button></div>}
        {loading ? <div className="loading-state">Carregando dados da sua barbearia...</div> : renderContent()}
      </main>

      {modal === 'appointment' && <NewAppointment data={derivedData} saving={saving} onClose={() => setModal(null)} onSubmit={(values) => save('appointment', values)} />}
      {modal === 'client' && <NewClient saving={saving} onClose={() => setModal(null)} onSubmit={(values) => save('client', values)} />}
      {modal === 'service' && <NewService saving={saving} onClose={() => setModal(null)} onSubmit={(values) => save('service', values)} />}
      {modal === 'finance' && <NewFinance saving={saving} onClose={() => setModal(null)} onSubmit={(values) => save('finance', values)} />}
    </div>
  );
}

function addFallbackRecord(current, type, values) {
  const id = `local-${Date.now()}`;
  if (type === 'client') {
    return { ...current, clients: [...current.clients, { id, name: values.name, phone: values.phone || '—', last: '—', total: money(0), totalCents: 0 }] };
  }
  if (type === 'service') {
    return {
      ...current,
      services: [...current.services, { id, name: values.name, durationMinutes: values.durationMinutes, duration: `${values.durationMinutes} min`, priceCents: values.priceCents, price: money(values.priceCents), count: 0 }],
    };
  }
  if (type === 'finance') {
    return { ...current, finance: [{ id, ...values, dateLabel: values.date }, ...current.finance] };
  }
  const client = current.clients.find((item) => item.id === values.clientId);
  const service = current.services.find((item) => item.id === values.serviceId);
  return {
    ...current,
    appointments: [...current.appointments, { id, date: values.date, time: values.time, clientId: values.clientId, serviceId: values.serviceId, client: client?.name || 'Cliente', service: service?.name || 'Serviço', barber: values.barber, status: 'Agendado', amountCents: service?.priceCents || 0 }],
  };
}

function AuthPanel({ configured = true, error = '', onError }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', passwordConfirm: '', shopName: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setFormError('');
    setNotice('');
    onError?.('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setFormError('');
    setNotice('');
    onError?.('');

    if (mode === 'signup' && form.password !== form.passwordConfirm) {
      setFormError('As senhas não conferem.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await signInWithPassword(form);
      } else if (mode === 'signup') {
        const result = await signUpWithPassword(form);
        if (!result.session) {
          setNotice('Cadastro realizado. Verifique seu e-mail para confirmar a conta antes de entrar.');
        }
      } else {
        await resetPasswordForEmail(form.email);
        setNotice('Se o e-mail estiver cadastrado, enviaremos um link para redefinir sua senha. Verifique também a caixa de spam.');
      }
    } catch (authSubmitError) {
      const message = authErrorMessage(
        authSubmitError,
        mode === 'forgot'
          ? 'Não foi possível enviar o link de recuperação. Tente novamente.'
          : 'Não foi possível concluir a autenticação. Tente novamente.'
      );
      setFormError(message);
      onError?.(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!configured) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="brand auth-brand"><span className="brand-mark">B</span><span>Barber<span>Flow</span></span></div>
          <h1>Configure o acesso</h1>
          <p className="auth-description">Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env para habilitar o login seguro.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand auth-brand"><span className="brand-mark">B</span><span>Barber<span>Flow</span></span></div>
        <h1>{mode === 'login' ? 'Entre na sua conta' : mode === 'signup' ? 'Crie sua conta' : 'Recupere sua senha'}</h1>
        <p className="auth-description">
          {mode === 'login'
            ? 'Acesse a gestão da sua barbearia.'
            : mode === 'signup'
              ? 'Sua conta receberá uma barbearia pessoal automaticamente.'
              : 'Informe seu e-mail e enviaremos um link para criar uma nova senha.'}
        </p>
        {mode === 'signup' && <p className="auth-helper">Depois do cadastro, confirme seu e-mail para liberar o acesso.</p>}
        {(formError || error) && <div className="auth-error" role="alert">{formError || error}</div>}
        {notice && <div className="auth-notice" role="status">{notice}</div>}
        <form onSubmit={submit} className="auth-form">
          {mode === 'signup' && <label>Nome da barbearia<input required value={form.shopName} onChange={update('shopName')} placeholder="Ex.: BarberFlow Centro" /></label>}
          <label>E-mail<input required type="email" autoComplete="email" value={form.email} onChange={update('email')} placeholder="voce@exemplo.com" /></label>
          {mode !== 'forgot' && <label>Senha<input required minLength="6" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={update('password')} placeholder="Mínimo de 6 caracteres" /></label>}
          {mode === 'signup' && <label>Confirme a senha<input required minLength="6" type="password" autoComplete="new-password" value={form.passwordConfirm} onChange={update('passwordConfirm')} /></label>}
          <button className="primary auth-submit" disabled={submitting}>{submitting ? 'Aguarde...' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link de recuperação'}</button>
        </form>
        {mode === 'login' && <button type="button" className="auth-link" onClick={() => switchMode('forgot')}>Esqueci minha senha</button>}
        <button type="button" className="auth-switch" onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'Ainda não tenho uma conta' : 'Voltar para entrar'}
        </button>
      </div>
    </div>
  );
}

function UpdatePasswordPanel({ onComplete }) {
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (password !== passwordConfirm) {
      setError('As senhas não conferem.');
      return;
    }

    setSubmitting(true);
    try {
      await updatePassword(password);
      setNotice('Senha atualizada com sucesso. Agora você pode continuar para o painel.');
    } catch (passwordError) {
      setError(authErrorMessage(passwordError, 'Não foi possível atualizar sua senha. Solicite um novo link e tente novamente.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand auth-brand"><span className="brand-mark">B</span><span>Barber<span>Flow</span></span></div>
        <h1>Crie uma nova senha</h1>
        <p className="auth-description">Escolha uma senha com pelo menos 6 caracteres para voltar a acessar sua conta.</p>
        {error && <div className="auth-error" role="alert">{error}</div>}
        {notice && <div className="auth-notice" role="status">{notice}</div>}
        {!notice && <form onSubmit={submit} className="auth-form">
          <label>Nova senha<input required minLength="6" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label>Confirme a nova senha<input required minLength="6" type="password" autoComplete="new-password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} /></label>
          <button className="primary auth-submit" disabled={submitting}>{submitting ? 'Salvando...' : 'Atualizar senha'}</button>
        </form>}
        {notice && <button type="button" className="auth-switch" onClick={onComplete}>Continuar para o painel</button>}
      </div>
    </div>
  );
}

function Dashboard({ data, onNew }) {
  const todayAppointments = data.appointments.filter((item) => item.date === REPORT_DATE);
  const todayRevenue = todayAppointments.reduce((sum, item) => sum + item.amountCents, 0);
  const waiting = data.clients.filter((client) => client.lastVisitAt && (new Date(REPORT_DATE) - new Date(client.lastVisitAt)) / 86400000 > 30).length;
  return <section className="content">
    <div className="welcome"><div><h2>Bom dia! 👋</h2><p>Acompanhe o movimento da sua barbearia hoje.</p></div><button className="primary" onClick={onNew}><Plus size={18} /> Novo agendamento</button></div>
    <div className="stats">
      <Stat icon={CalendarDays} label="Agendamentos hoje" value={todayAppointments.length} detail="Dados carregados do Supabase" positive />
      <Stat icon={TrendingUp} label="Faturamento hoje" value={money(todayRevenue)} detail="Com base nos serviços agendados" positive />
      <Stat icon={Users} label="Clientes ativos" value={data.clients.length} detail="Clientes cadastrados" positive />
      <Stat icon={Clock3} label="Aguardando retorno" value={waiting} detail="Mais de 30 dias sem voltar" />
    </div>
    <div className="grid-2">
      <div className="panel"><div className="panel-head"><div><h3>Agenda de hoje</h3><p>Próximos atendimentos</p></div><button className="text-btn" onClick={onNew}>Novo →</button></div><AppointmentRows appointments={todayAppointments} compact /></div>
      <div className="panel recovery"><div className="panel-head"><div><h3>Clientes para recuperar</h3><p>Estão há mais de 30 dias sem voltar</p></div><span className="badge">{waiting}</span></div>{data.clients.filter((client) => client.lastVisitAt && (new Date(REPORT_DATE) - new Date(client.lastVisitAt)) / 86400000 > 30).slice(0, 3).map((client) => <div className="recovery-row" key={client.id}><div className="client-avatar">{initials(client.name)}</div><div className="client-info"><strong>{client.name}</strong><small>Último corte em {client.last}</small></div><button className="whatsapp"><MessageCircle size={16} /> WhatsApp</button></div>)}{waiting === 0 && <div className="empty-state">Nenhum cliente pendente.</div>}</div>
    </div>
    <div className="panel"><div className="panel-head"><div><h3>Resumo de serviços</h3><p>Atendimentos carregados</p></div></div><div className="service-summary">{data.services.map((service) => <div className="service-card" key={service.id}><div className="service-icon"><Scissors size={18}/></div><div><strong>{service.name}</strong><small>{service.count || 0} atendimentos</small></div><b>{service.price}</b></div>)}</div></div>
  </section>;
}

function Stat({ icon: Icon, label, value, detail, positive }) { return <div className="stat"><div className="stat-icon"><Icon size={20}/></div><div><span>{label}</span><strong>{value}</strong><small className={positive ? 'positive' : ''}>{detail}</small></div></div>; }

function Agenda({ data, onNew }) {
  return <section className="content"><div className="page-head"><div><h2>Agenda</h2><p>Organize os atendimentos da sua equipe.</p></div><button className="primary" onClick={onNew}><Plus size={18}/> Novo agendamento</button></div><div className="calendar-bar"><button>‹</button><strong>Hoje, 09 de setembro</strong><button>›</button><div className="view-switch"><button className="selected">Dia</button><button>Semana</button><button>Mês</button></div></div><div className="panel"><AppointmentRows appointments={data.appointments} /></div></section>;
}

function AppointmentRows({ appointments, compact = false }) {
  const visible = appointments.slice(0, compact ? 4 : appointments.length);
  if (!visible.length) return <div className="empty-state">Nenhum agendamento encontrado.</div>;
  return <div className="appointments">{visible.map((appointment) => <div className="appointment" key={appointment.id}><div className="time">{appointment.time}</div><div className="appointment-main"><div className="client-avatar">{initials(appointment.client)}</div><div><strong>{appointment.client}</strong><span>{appointment.service} · {appointment.barber}</span></div></div><span className={`status ${appointment.status.toLowerCase().replaceAll(' ','-')}`}>{appointment.status}</span><button className="more"><MoreHorizontal size={18}/></button></div>)}</div>;
}

function Clients({ data, onNew }) {
  const [query, setQuery] = useState('');
  const visible = data.clients.filter((client) => `${client.name} ${client.phone}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="content"><div className="page-head"><div><h2>Clientes</h2><p>Gerencie sua base e acompanhe o histórico.</p></div><button className="primary" onClick={onNew}><Plus size={18}/> Novo cliente</button></div><div className="toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente por nome ou telefone..."/><button className="filter">Todos os clientes ▾</button></div><div className="panel table-wrap"><table><thead><tr><th>Cliente</th><th>Telefone</th><th>Último atendimento</th><th>Total gasto</th><th></th></tr></thead><tbody>{visible.map((client)=><tr key={client.id}><td><div className="table-client"><div className="client-avatar">{initials(client.name)}</div><strong>{client.name}</strong></div></td><td>{client.phone}</td><td>{client.last}</td><td>{money(client.totalCents)}</td><td><button className="more"><MoreHorizontal size={18}/></button></td></tr>)}</tbody></table>{!visible.length && <div className="empty-state">Nenhum cliente encontrado.</div>}</div></section>;
}

function Services({ data, onNew }) {
  return <section className="content"><div className="page-head"><div><h2>Serviços</h2><p>Cadastre os serviços oferecidos pela barbearia.</p></div><button className="primary" onClick={onNew}><Plus size={18}/> Novo serviço</button></div><div className="service-list">{data.services.map((service)=><div className="panel service-line" key={service.id}><div className="service-icon"><Scissors size={20}/></div><div><strong>{service.name}</strong><small><Clock3 size={14}/> {service.duration}</small></div><b>{money(service.priceCents)}</b><button className="more"><MoreHorizontal size={18}/></button></div>)}{!data.services.length && <div className="empty-state">Nenhum serviço cadastrado.</div>}</div></section>;
}

function Finance({ data, onNew }) {
  const monthFinance = data.finance.filter((item) => item.date?.startsWith(REPORT_DATE.slice(0, 7)));
  const revenue = monthFinance.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amountCents, 0);
  const expenses = monthFinance.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amountCents, 0);
  return <section className="content"><div className="page-head"><div><h2>Financeiro</h2><p>Acompanhe receitas e resultados da sua barbearia.</p></div><button className="primary" onClick={onNew}><Plus size={18}/> Lançar movimentação</button></div><div className="stats"><Stat icon={TrendingUp} label="Receita no mês" value={money(revenue)} detail="Entradas do mês" positive/><Stat icon={WalletCards} label="Despesas" value={money(expenses)} detail={`${monthFinance.filter((item) => item.type === 'expense').length} lançamentos`}/><Stat icon={WalletCards} label="Resultado" value={money(revenue - expenses)} detail="Receitas menos despesas" positive/></div><div className="panel"><div className="panel-head"><div><h3>Movimentações recentes</h3><p>Setembro de 2026</p></div></div>{data.finance.map((movement) => <div className="finance-row" key={movement.id}><span>{movement.dateLabel} · {movement.description}</span><b className={movement.type === 'expense' ? 'expense' : ''}>{movement.type === 'expense' ? '- ' : '+ '}{money(movement.amountCents)}</b></div>)}{!data.finance.length && <div className="empty-state">Nenhuma movimentação cadastrada.</div>}</div></section>;
}

function Modal({ title, description, onClose, children }) {
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><h2>{title}</h2><p>{description}</p></div><button onClick={onClose}>×</button></div>{children}</div></div>;
}

function NewAppointment({ data, saving, onClose, onSubmit }) {
  const [form, setForm] = useState({ clientId: data.clients[0]?.id || '', serviceId: data.services[0]?.id || '', date: dateInputDefault(), time: '16:00', barber: 'João' });
  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });
  return <Modal title="Novo agendamento" description="Cadastre um novo atendimento." onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}><label>Cliente<select required value={form.clientId} onChange={update('clientId')}>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label>Serviço<select required value={form.serviceId} onChange={update('serviceId')}>{data.services.map((service) => <option key={service.id} value={service.id}>{service.name} — {service.price}</option>)}</select></label><div className="form-grid"><label>Data<input required type="date" value={form.date} onChange={update('date')} /></label><label>Horário<input required type="time" value={form.time} onChange={update('time')} /></label></div><label>Barbeiro<input required value={form.barber} onChange={update('barber')} /></label>{(!data.clients.length || !data.services.length) && <p className="form-hint">Cadastre pelo menos um cliente e um serviço antes de agendar.</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving || !data.clients.length || !data.services.length}>{saving ? 'Salvando...' : 'Agendar'}</button></div></form></Modal>;
}

function NewClient({ saving, onClose, onSubmit }) {
  const [form, setForm] = useState({ name: '', phone: '' });
  return <Modal title="Novo cliente" description="Adicione um cliente à sua base." onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}><label>Nome<input required autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nome completo" /></label><label>Telefone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="(65) 99999-0000" /></label><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving ? 'Salvando...' : 'Cadastrar'}</button></div></form></Modal>;
}

function NewService({ saving, onClose, onSubmit }) {
  const [form, setForm] = useState({ name: '', durationMinutes: 40, price: '' });
  const submit = (event) => { event.preventDefault(); onSubmit({ ...form, durationMinutes: Number(form.durationMinutes), priceCents: Math.round(Number(form.price.replace(',', '.')) * 100) }); };
  return <Modal title="Novo serviço" description="Cadastre um serviço e seu preço." onClose={onClose}><form onSubmit={submit}><label>Nome<input required autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Corte masculino" /></label><div className="form-grid"><label>Duração (min)<input required min="1" type="number" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })} /></label><label>Preço (R$)<input required min="0" step="0.01" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="45,00" /></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving ? 'Salvando...' : 'Cadastrar'}</button></div></form></Modal>;
}

function NewFinance({ saving, onClose, onSubmit }) {
  const [form, setForm] = useState({ type: 'income', amount: '', description: '', date: dateInputDefault() });
  const submit = (event) => { event.preventDefault(); onSubmit({ ...form, amountCents: Math.round(Number(form.amount.replace(',', '.')) * 100) }); };
  return <Modal title="Lançar movimentação" description="Registre uma entrada ou despesa." onClose={onClose}><form onSubmit={submit}><label>Tipo<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="income">Receita</option><option value="expense">Despesa</option></select></label><label>Descrição<input required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ex.: Corte masculino" /></label><div className="form-grid"><label>Valor (R$)<input required min="0.01" step="0.01" type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="80,00" /></label><label>Data<input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving ? 'Salvando...' : 'Lançar'}</button></div></form></Modal>;
}

export default App;
