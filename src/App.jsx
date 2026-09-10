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
  UserPlus,
  Trash2,
} from 'lucide-react';
import {
  createAppointmentRecord,
  updateAppointmentRecord,
  cancelAppointmentRecord,
  createClientRecord,
  updateClientRecord,
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
  loadClientHistory,
  loadTeamData,
  createTeamInvitation,
  updateTeamMemberRole,
  removeTeamMember,
  subscribeToAuthState,
} from './lib/supabase';

const REPORT_DATE = '2026-09-09';
const EMPTY_DATA = {
  appointments: [],
  clients: [],
  services: [],
  finance: [],
};

const EMPTY_TEAM = {
  role: 'barber',
  members: [],
  invitations: [],
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

const dateKey = (date) => date.toISOString().slice(0, 10);

function shiftDate(dateValue, amount, unit = 'day') {
  const date = new Date(`${dateValue}T12:00:00`);
  if (unit === 'month') date.setMonth(date.getMonth() + amount);
  else date.setDate(date.getDate() + amount);
  return dateKey(date);
}

function startOfWeek(dateValue) {
  const date = new Date(`${dateValue}T12:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return dateKey(date);
}

function formatAgendaDate(dateValue, options) {
  return new Intl.DateTimeFormat('pt-BR', options).format(new Date(`${dateValue}T12:00:00`));
}

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
  const [team, setTeam] = useState(EMPTY_TEAM);

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
      const [nextData, nextTeam] = await Promise.all([
        loadBarberFlowData(),
        loadTeamData(),
      ]);
      setData(nextData);
      setTeam(nextTeam);
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
      if (appointment.clientId && appointment.statusKey === 'completed') {
        result[appointment.clientId] = (result[appointment.clientId] || 0) + appointment.amountCents;
      }
      return result;
    }, {});
    const lastVisits = data.appointments.reduce((result, appointment) => {
      if (
        appointment.clientId &&
        appointment.statusKey === 'completed' &&
        (!result[appointment.clientId] || appointment.date > result[appointment.clientId])
      ) {
        result[appointment.clientId] = appointment.date;
      }
      return result;
    }, {});
    return {
      ...data,
      clients: data.clients.map((client) => ({
        ...client,
        lastVisitAt: lastVisits[client.id] || client.lastVisitAt,
        last: lastVisits[client.id]
          ? formatAgendaDate(lastVisits[client.id], { day: '2-digit', month: '2-digit', year: 'numeric' })
          : client.last,
        totalCents: client.totalCents || totals[client.id] || 0,
        total: money(client.totalCents || totals[client.id] || 0),
      })),
    };
  }, [data]);

  const save = async (type, values) => {
    setSaving(true);
    setError('');
    try {
      if (type === 'appointment') {
        if (values.id) await updateAppointmentRecord(values);
        else await createAppointmentRecord(values);
      }
      if (type === 'client') {
        if (values.id) await updateClientRecord(values);
        else await createClientRecord(values);
      }
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

  const manageTeam = async (action) => {
    setSaving(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (teamError) {
      setError(teamError.message || 'Não foi possível atualizar a equipe.');
      throw teamError;
    } finally {
      setSaving(false);
    }
  };

  const openNewAppointment = () => setModal({ type: 'appointment', appointment: null });
  const openEditAppointment = (appointment) =>
    setModal({ type: 'appointment', appointment });
  const openNewClient = () => setModal({ type: 'client', client: null });
  const openEditClient = (client) => setModal({ type: 'client', client });
  const openClientDetail = (client) => setModal({ type: 'client-detail', client });

  const cancelAppointment = async ({ id: appointmentId, reason = '' }) => {
    if (!window.confirm('Cancelar este agendamento?')) return;
    setSaving(true);
    setError('');
    try {
      await cancelAppointmentRecord({ id: appointmentId, reason });
      await refresh();
      setModal(null);
    } catch (cancelError) {
      setError(cancelError.message || 'Não foi possível cancelar o agendamento.');
    } finally {
      setSaving(false);
    }
  };
  const nav = [
    ['Dashboard', LayoutDashboard],
    ['Agenda', CalendarDays],
    ['Clientes', Users],
    ['Serviços', Scissors],
    ['Financeiro', WalletCards],
    ['Configurações', Settings],
  ];

  const renderContent = () => {
    if (active === 'Agenda') {
      return (
        <Agenda
          data={derivedData}
          onNew={openNewAppointment}
          onEdit={openEditAppointment}
        />
      );
    }
    if (active === 'Clientes') {
      return (
        <Clients
          data={derivedData}
          onNew={openNewClient}
          onEdit={openEditClient}
          onView={openClientDetail}
        />
      );
    }
    if (active === 'Serviços') return <Services data={derivedData} onNew={() => setModal('service')} />;
    if (active === 'Financeiro') return <Finance data={derivedData} onNew={() => setModal('finance')} />;
    if (active === 'Configurações') {
      return (
        <Team
          data={team}
          currentUserId={session.user.id}
          saving={saving}
          onInvite={(values) => manageTeam(() => createTeamInvitation(values))}
          onRoleChange={(values) => manageTeam(() => updateTeamMemberRole(values))}
          onRemove={(userId) => manageTeam(() => removeTeamMember(userId))}
        />
      );
    }
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

      {modal?.type === 'appointment' && (
        <AppointmentModal
          data={derivedData}
          barbers={team.members}
          appointment={modal.appointment}
          saving={saving}
          onClose={() => setModal(null)}
          onCancel={cancelAppointment}
          onSubmit={(values) => save('appointment', values)}
        />
      )}
      {modal?.type === 'client' && (
        <ClientFormModal
          client={modal.client}
          saving={saving}
          onClose={() => setModal(null)}
          onSubmit={(values) => save('client', values)}
        />
      )}
      {modal?.type === 'client-detail' && (
        <ClientDetail
          client={modal.client}
          onClose={() => setModal(null)}
          onEdit={() => openEditClient(modal.client)}
        />
      )}
      {modal === 'service' && <NewService saving={saving} onClose={() => setModal(null)} onSubmit={(values) => save('service', values)} />}
      {modal === 'finance' && <NewFinance saving={saving} onClose={() => setModal(null)} onSubmit={(values) => save('finance', values)} />}
    </div>
  );
}

function addFallbackRecord(current, type, values) {
  const id = `local-${Date.now()}`;
  if (type === 'client') {
    return {
      ...current,
      clients: [
        ...current.clients,
        {
          id,
          name: values.name,
          phone: values.phone || '—',
          notes: values.notes || '',
          birthday: values.birthday || '',
          preferences: values.preferences || '',
          last: '—',
          total: money(0),
          totalCents: 0,
        },
      ],
    };
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

function Agenda({ data, onNew, onEdit }) {
  const [view, setView] = useState('day');
  const [selectedDate, setSelectedDate] = useState(REPORT_DATE);
  const weekStart = startOfWeek(selectedDate);
  const monthStart = `${selectedDate.slice(0, 7)}-01`;
  const visibleAppointments = data.appointments.filter((appointment) => {
    if (view === 'day') return appointment.date === selectedDate;
    if (view === 'week') {
      const weekEnd = shiftDate(weekStart, 6);
      return appointment.date >= weekStart && appointment.date <= weekEnd;
    }
    return appointment.date.startsWith(selectedDate.slice(0, 7));
  });
  const heading =
    view === 'day'
      ? formatAgendaDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })
      : view === 'week'
        ? `${formatAgendaDate(weekStart, { day: 'numeric', month: 'short' })} – ${formatAgendaDate(shiftDate(weekStart, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`
        : formatAgendaDate(monthStart, { month: 'long', year: 'numeric' });
  const viewStep = view === 'month' ? 1 : view === 'week' ? 7 : 1;
  return (
    <section className="content">
      <div className="page-head">
        <div><h2>Agenda</h2><p>Organize os atendimentos da sua equipe.</p></div>
        <button className="primary" onClick={onNew}><Plus size={18}/> Novo agendamento</button>
      </div>
      <div className="calendar-bar">
        <button aria-label="Período anterior" onClick={() => setSelectedDate(shiftDate(selectedDate, -viewStep, view === 'month' ? 'month' : 'day'))}>‹</button>
        <strong>{heading}</strong>
        <button aria-label="Próximo período" onClick={() => setSelectedDate(shiftDate(selectedDate, viewStep, view === 'month' ? 'month' : 'day'))}>›</button>
        <button className="secondary calendar-today" onClick={() => setSelectedDate(REPORT_DATE)}>Hoje</button>
        <div className="view-switch" aria-label="Visualização da agenda">
          {['day', 'week', 'month'].map((option) => (
            <button key={option} className={view === option ? 'selected' : ''} onClick={() => setView(option)}>
              {option === 'day' ? 'Dia' : option === 'week' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <div><h3>{view === 'day' ? 'Atendimentos do dia' : 'Atendimentos no período'}</h3><p>{visibleAppointments.length} agendamento(s)</p></div>
        </div>
        <AppointmentRows appointments={visibleAppointments} onEdit={onEdit} />
      </div>
      {view !== 'day' && (
        <p className="agenda-hint">Use os botões Dia, Semana e Mês para filtrar a agenda. Clique em um atendimento para editar ou cancelar.</p>
      )}
    </section>
  );
}

function AppointmentRows({ appointments, compact = false, onEdit }) {
  const visible = appointments.slice(0, compact ? 4 : appointments.length);
  if (!visible.length) return <div className="empty-state">Nenhum agendamento encontrado.</div>;
  return (
    <div className="appointments">
      {visible.map((appointment) => (
        <div className={`appointment ${onEdit ? 'appointment-clickable' : ''}`} key={appointment.id} onClick={() => onEdit?.(appointment)}>
          <div className="time">{appointment.time}</div>
          <div className="appointment-main"><div className="client-avatar">{initials(appointment.client)}</div><div><strong>{appointment.client}</strong><span>{appointment.service} · {appointment.barber}</span></div></div>
          <span className={`status ${appointment.statusKey || appointment.status.toLowerCase().replaceAll(' ', '-')}`}>{appointment.status}</span>
          {onEdit ? <button className="more" onClick={(event) => { event.stopPropagation(); onEdit(appointment); }} aria-label={`Editar agendamento de ${appointment.client}`}><MoreHorizontal size={18}/></button> : <button className="more"><MoreHorizontal size={18}/></button>}
        </div>
      ))}
    </div>
  );
}

function Clients({ data, onNew, onEdit, onView }) {
  const [query, setQuery] = useState('');
  const visible = data.clients.filter((client) => `${client.name} ${client.phone}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="content">
      <div className="page-head">
        <div><h2>Clientes</h2><p>Gerencie sua base e acompanhe o histórico.</p></div>
        <button className="primary" onClick={onNew}><Plus size={18}/> Novo cliente</button>
      </div>
      <div className="toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente por nome ou telefone..." />
        <button className="filter">Todos os clientes ▾</button>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead><tr><th>Cliente</th><th>Telefone</th><th>Último atendimento</th><th>Total gasto</th><th /></tr></thead>
          <tbody>
            {visible.map((client) => (
              <tr key={client.id} className="client-row" onClick={() => onView(client)}>
                <td><div className="table-client"><div className="client-avatar">{initials(client.name)}</div><strong>{client.name}</strong></div></td>
                <td>{client.phone}</td>
                <td>{client.last}</td>
                <td>{money(client.totalCents)}</td>
                <td>
                  <button className="more" onClick={(event) => { event.stopPropagation(); onEdit(client); }} aria-label={`Editar ${client.name}`}>
                    <MoreHorizontal size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && <div className="empty-state">Nenhum cliente encontrado.</div>}
      </div>
    </section>
  );
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

const roleLabels = {
  owner: 'Proprietário',
  manager: 'Gerente',
  barber: 'Barbeiro',
};

function Team({ data, currentUserId, saving, onInvite, onRoleChange, onRemove }) {
  const [invite, setInvite] = useState({ email: '', role: 'barber' });
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const canManage = data.role === 'owner' || data.role === 'manager';

  const submitInvite = async (event) => {
    event.preventDefault();
    setMessage('');
    setFormError('');
    try {
      await onInvite(invite);
      setInvite({ email: '', role: 'barber' });
      setMessage('Solicitação criada. O convite ficará pendente até a conclusão pelo administrador do Supabase.');
    } catch (inviteError) {
      setFormError(inviteError.message || 'Não foi possível criar o convite.');
    }
  };

  const changeRole = async (member, role) => {
    setMessage('');
    setFormError('');
    try {
      await onRoleChange({ userId: member.id, role });
      setMessage('Função atualizada.');
    } catch (roleError) {
      setFormError(roleError.message || 'Não foi possível alterar a função.');
    }
  };

  const remove = async (member) => {
    if (!window.confirm(`Remover ${member.email} da equipe?`)) return;
    setMessage('');
    setFormError('');
    try {
      await onRemove(member.id);
      setMessage('Membro removido da equipe.');
    } catch (removeError) {
      setFormError(removeError.message || 'Não foi possível remover o membro.');
    }
  };

  return (
    <section className="content">
      <div className="page-head">
        <div>
          <h2>Equipe</h2>
          <p>Controle quem pode acessar e operar sua barbearia.</p>
        </div>
        <span className="role-badge">{roleLabels[data.role] || data.role}</span>
      </div>
      {(message || formError) && (
        <div className={formError ? 'team-feedback error' : 'team-feedback'} role={formError ? 'alert' : 'status'}>
          {formError || message}
        </div>
      )}

      <div className="panel team-panel">
        <div className="panel-head">
          <div>
            <h3>Membros da equipe</h3>
            <p>Barbeiros podem consultar a equipe, mas não podem gerenciá-la.</p>
          </div>
          <span className="badge">{data.members.length}</span>
        </div>
        <div className="team-list">
          {data.members.map((member) => {
            const isCurrentUser = member.id === currentUserId;
            const isOwner = member.role === 'owner';
            return (
              <div className="team-row" key={member.id}>
                <div className="client-avatar">{initials(member.email)}</div>
                <div className="team-member-info">
                  <strong>{member.email}</strong>
                  <small>{isCurrentUser ? 'Você · ' : ''}{roleLabels[member.role] || member.role}</small>
                </div>
                {canManage && !isOwner ? (
                  <select
                    className="team-role-select"
                    value={member.role}
                    disabled={saving || isCurrentUser}
                    onChange={(event) => changeRole(member, event.target.value)}
                    aria-label={`Função de ${member.email}`}
                  >
                    <option value="barber">Barbeiro</option>
                    <option value="manager">Gerente</option>
                  </select>
                ) : (
                  <span className="team-role">{roleLabels[member.role] || member.role}</span>
                )}
                {canManage && !isOwner && !isCurrentUser && (
                  <button className="team-remove" disabled={saving} onClick={() => remove(member)} aria-label={`Remover ${member.email}`}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            );
          })}
          {!data.members.length && <div className="empty-state">Nenhum membro encontrado.</div>}
        </div>
      </div>

      {canManage && (
        <div className="panel team-panel">
          <div className="panel-head">
            <div>
              <h3>Convidar membro</h3>
              <p>Crie uma solicitação segura para um novo acesso.</p>
            </div>
            <UserPlus size={19} className="team-heading-icon" />
          </div>
          <form className="team-invite-form" onSubmit={submitInvite}>
            <label>E-mail
              <input
                required
                type="email"
                value={invite.email}
                onChange={(event) => setInvite({ ...invite, email: event.target.value })}
                placeholder="barbeiro@exemplo.com"
              />
            </label>
            <label>Função
              <select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value })}>
                <option value="barber">Barbeiro</option>
                <option value="manager">Gerente</option>
              </select>
            </label>
            <button className="primary" disabled={saving}><UserPlus size={16} />{saving ? 'Salvando...' : 'Criar convite'}</button>
          </form>
          <p className="team-hint">O pedido não envia e-mail pelo navegador nem expõe a service_role. Novas contas com este e-mail entram automaticamente; contas existentes seguem o procedimento administrativo do README.</p>
        </div>
      )}

      <div className="panel team-panel">
        <div className="panel-head">
          <div>
            <h3>Convites pendentes</h3>
            <p>Acompanhe solicitações ainda não concluídas.</p>
          </div>
          <span className="badge">{data.invitations.filter((item) => item.status === 'pending').length}</span>
        </div>
        <div className="team-list">
          {data.invitations.map((invitation) => (
            <div className="team-row invitation-row" key={invitation.id}>
              <div className="client-avatar">{initials(invitation.email)}</div>
              <div className="team-member-info">
                <strong>{invitation.email}</strong>
                <small>{roleLabels[invitation.role] || invitation.role}</small>
              </div>
              <span className={`invite-status ${invitation.status}`}>{invitation.status === 'pending' ? 'Pendente' : invitation.status === 'accepted' ? 'Concluído' : 'Revogado'}</span>
            </div>
          ))}
          {!data.invitations.length && <div className="empty-state">Nenhum convite registrado.</div>}
        </div>
      </div>
    </section>
  );
}

function Modal({ title, description, onClose, children, wide = false }) {
  return <div className="modal-backdrop" onClick={onClose}><div className={`modal ${wide ? 'modal-wide' : ''}`} onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><h2>{title}</h2><p>{description}</p></div><button onClick={onClose}>×</button></div>{children}</div></div>;
}

function AppointmentModal({ data, barbers = [], appointment, saving, onClose, onCancel, onSubmit }) {
  const [form, setForm] = useState({
    id: appointment?.id,
    clientId: appointment?.clientId || data.clients[0]?.id || '',
    serviceId: appointment?.serviceId || data.services[0]?.id || '',
    date: appointment?.date || dateInputDefault(),
    time: appointment?.time || '16:00',
    barber: appointment?.barber || barbers[0]?.email || '',
    status: appointment?.statusKey || 'scheduled',
    notes: appointment?.notes || '',
  });
  const [cancellationReason, setCancellationReason] = useState('');
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const barberOptions = [...new Set([
    ...barbers.map((member) => member.email),
    ...(form.barber ? [form.barber] : []),
  ].filter(Boolean))];
  const editing = Boolean(appointment);
  const submit = (event) => {
    event.preventDefault();
    onSubmit(form);
  };
  return (
    <Modal
      title={editing ? 'Editar agendamento' : 'Novo agendamento'}
      description={editing ? 'Atualize o atendimento ou altere seu status.' : 'Cadastre um novo atendimento.'}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>Cliente<select required value={form.clientId} onChange={update('clientId')}>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
        <label>Serviço<select required value={form.serviceId} onChange={update('serviceId')}>{data.services.map((service) => <option key={service.id} value={service.id}>{service.name} — {service.price}</option>)}</select></label>
        <div className="form-grid">
          <label>Data<input required type="date" value={form.date} onChange={update('date')} /></label>
          <label>Horário<input required type="time" value={form.time} onChange={update('time')} /></label>
        </div>
        <label>Barbeiro
          {barberOptions.length ? (
            <select required value={form.barber} onChange={update('barber')}>
              {barberOptions.map((barber) => <option key={barber} value={barber}>{barber}</option>)}
            </select>
          ) : (
            <input required value={form.barber} onChange={update('barber')} placeholder="Nome do barbeiro" />
          )}
        </label>
        {editing && (
          <label>Status
            <select value={form.status} onChange={update('status')}>
              <option value="scheduled">Agendado</option>
              <option value="confirmed">Confirmado</option>
              <option value="in_progress">Em atendimento</option>
              <option value="completed">Concluído</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </label>
        )}
        <label>Observações<textarea value={form.notes} onChange={update('notes')} placeholder="Opcional" rows="3" /></label>
        {editing && (
          <div className="cancel-appointment">
            <label>Motivo do cancelamento (opcional)<input value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} placeholder="Ex.: cliente solicitou" /></label>
            <button type="button" className="danger-button" disabled={saving} onClick={() => onCancel({ id: appointment.id, reason: cancellationReason })}>Cancelar agendamento</button>
          </div>
        )}
        {(!data.clients.length || !data.services.length) && <p className="form-hint">Cadastre pelo menos um cliente e um serviço antes de agendar.</p>}
        <p className="form-hint appointment-conflict-hint">O sistema impede dois atendimentos do mesmo barbeiro no mesmo horário.</p>
        <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Fechar</button><button className="primary" disabled={saving || !data.clients.length || !data.services.length}>{saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Agendar'}</button></div>
      </form>
    </Modal>
  );
}

function ClientFormModal({ client, saving, onClose, onSubmit }) {
  const [form, setForm] = useState({
    id: client?.id,
    name: client?.name || '',
    phone: client?.phone === '—' ? '' : client?.phone || '',
    birthday: client?.birthday || '',
    preferences: client?.preferences || '',
    notes: client?.notes || '',
  });
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const editing = Boolean(client);

  return (
    <Modal
      title={editing ? 'Editar cliente' : 'Novo cliente'}
      description={editing ? 'Atualize os dados e preferências do cliente.' : 'Adicione um cliente à sua base.'}
      onClose={onClose}
    >
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
        <label>Nome<input required autoFocus value={form.name} onChange={update('name')} placeholder="Nome completo" /></label>
        <div className="form-grid">
          <label>Telefone<input value={form.phone} onChange={update('phone')} placeholder="(65) 99999-0000" /></label>
          <label>Aniversário<input type="date" value={form.birthday} onChange={update('birthday')} /></label>
        </div>
        <label>Preferências<textarea rows="2" value={form.preferences} onChange={update('preferences')} placeholder="Ex.: prefere máquina 2, água sem gás" /></label>
        <label>Observações<textarea rows="3" value={form.notes} onChange={update('notes')} placeholder="Anotações importantes sobre o cliente" /></label>
        <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Cadastrar'}</button></div>
      </form>
    </Modal>
  );
}

const clientHistoryStatusLabels = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  in_progress: 'Em atendimento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

function ClientDetail({ client, onClose, onEdit }) {
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoadingHistory(true);
    setHistoryError('');
    loadClientHistory(client.id)
      .then((records) => {
        if (mounted) setHistory(records);
      })
      .catch((error) => {
        if (mounted) setHistoryError(error.message || 'Não foi possível carregar o histórico.');
      })
      .finally(() => {
        if (mounted) setLoadingHistory(false);
      });
    return () => { mounted = false; };
  }, [client.id]);

  const completedTotal = history
    .filter((item) => item.statusKey === 'completed')
    .reduce((total, item) => total + item.amountCents, 0);
  const dateLabel = (timestamp) => timestamp
    ? new Intl.DateTimeFormat('pt-BR').format(new Date(timestamp))
    : '—';

  return (
    <Modal title={client.name} description="Dados do cliente e histórico de atendimentos." onClose={onClose} wide>
      <div className="client-detail-head">
        <div className="client-detail-avatar client-avatar">{initials(client.name)}</div>
        <div>
          <strong>{client.phone}</strong>
          <small>{client.birthday ? `Aniversário em ${dateLabel(`${client.birthday}T12:00:00`)}` : 'Aniversário não informado'}</small>
        </div>
        <button className="secondary" onClick={onEdit}>Editar</button>
      </div>
      <div className="client-detail-stats">
        <div><span>Último atendimento</span><strong>{client.last}</strong></div>
        <div><span>Total gasto</span><strong>{money(completedTotal)}</strong></div>
        <div><span>Atendimentos concluídos</span><strong>{history.filter((item) => item.statusKey === 'completed').length}</strong></div>
      </div>
      {(client.preferences || client.notes) && (
        <div className="client-notes-grid">
          {client.preferences && <div><span>Preferências</span><p>{client.preferences}</p></div>}
          {client.notes && <div><span>Observações</span><p>{client.notes}</p></div>}
        </div>
      )}
      <div className="client-history">
        <div className="panel-head"><div><h3>Histórico de atendimentos</h3><p>Valores contabilizados somente quando concluídos.</p></div></div>
        {loadingHistory && <div className="loading-state client-history-loading">Carregando histórico...</div>}
        {historyError && <div className="team-feedback error">{historyError}</div>}
        {!loadingHistory && !historyError && !history.length && <div className="empty-state">Nenhum atendimento registrado.</div>}
        {!loadingHistory && !historyError && history.map((item) => (
          <div className="client-history-row" key={item.id}>
            <div><strong>{dateLabel(item.startsAt)}</strong><small>{item.service} · {item.barber}</small></div>
            <span className={`status ${item.statusKey}`}>{clientHistoryStatusLabels[item.statusKey] || item.statusKey}</span>
            <b>{money(item.amountCents)}</b>
          </div>
        ))}
      </div>
    </Modal>
  );
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
