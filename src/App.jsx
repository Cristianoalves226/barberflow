import { useMemo, useState } from 'react';
import {
  CalendarDays, Users, Scissors, LayoutDashboard, WalletCards, Settings,
  Menu, Bell, Plus, Clock3, TrendingUp, UserRound, MessageCircle, MoreHorizontal
} from 'lucide-react';

const appointments = [
  { time: '09:00', client: 'Carlos Eduardo', service: 'Corte + Barba', barber: 'João', status: 'Confirmado' },
  { time: '10:00', client: 'Marcos Silva', service: 'Corte masculino', barber: 'Pedro', status: 'Em atendimento' },
  { time: '11:30', client: 'Rafael Souza', service: 'Barba', barber: 'João', status: 'Agendado' },
  { time: '14:00', client: 'Lucas Oliveira', service: 'Corte + Barba', barber: 'Carlos', status: 'Agendado' },
  { time: '15:30', client: 'André Lima', service: 'Corte masculino', barber: 'Pedro', status: 'Agendado' },
];

const clients = [
  { name: 'Carlos Eduardo', phone: '6599999-0001', last: 'Hoje', total: 'R$ 85,00' },
  { name: 'Marcos Silva', phone: '6599999-0002', last: 'Hoje', total: 'R$ 45,00' },
  { name: 'Rafael Souza', phone: '6599999-0003', last: '12/08/2026', total: 'R$ 180,00' },
  { name: 'Lucas Oliveira', phone: '6599999-0004', last: '05/08/2026', total: 'R$ 240,00' },
];

const services = [
  { name: 'Corte masculino', duration: '40 min', price: 'R$ 45,00' },
  { name: 'Barba', duration: '30 min', price: 'R$ 40,00' },
  { name: 'Corte + Barba', duration: '70 min', price: 'R$ 80,00' },
];

function App() {
  const [active, setActive] = useState('Dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const content = useMemo(() => {
    if (active === 'Agenda') return <Agenda onNew={() => setShowModal(true)} />;
    if (active === 'Clientes') return <Clients />;
    if (active === 'Serviços') return <Services />;
    if (active === 'Financeiro') return <Finance />;
    return <Dashboard onNew={() => setShowModal(true)} />;
  }, [active]);

  const nav = [
    ['Dashboard', LayoutDashboard], ['Agenda', CalendarDays], ['Clientes', Users],
    ['Serviços', Scissors], ['Financeiro', WalletCards], ['Configurações', Settings]
  ];

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
          <div className="top-actions"><button className="icon-btn"><Bell size={19} /><i /></button><div className="avatar">CA</div></div>
        </header>
        {content}
      </main>

      {showModal && <NewAppointment onClose={() => setShowModal(false)} />}
    </div>
  );
}

function Dashboard({ onNew }) {
  return <section className="content">
    <div className="welcome"><div><h2>Bom dia! 👋</h2><p>Acompanhe o movimento da sua barbearia hoje.</p></div><button className="primary" onClick={onNew}><Plus size={18} /> Novo agendamento</button></div>
    <div className="stats">
      <Stat icon={CalendarDays} label="Agendamentos hoje" value="12" detail="+2 comparado a ontem" positive />
      <Stat icon={TrendingUp} label="Faturamento hoje" value="R$ 680,00" detail="+12,5% esta semana" positive />
      <Stat icon={Users} label="Clientes ativos" value="248" detail="18 novos este mês" positive />
      <Stat icon={Clock3} label="Aguardando retorno" value="34" detail="Clientes para recuperar" />
    </div>
    <div className="grid-2">
      <div className="panel"><div className="panel-head"><div><h3>Agenda de hoje</h3><p>Próximos atendimentos</p></div><button className="text-btn" onClick={() => window.scrollTo(0,0)}>Ver agenda →</button></div><AppointmentRows compact /></div>
      <div className="panel recovery"><div className="panel-head"><div><h3>Clientes para recuperar</h3><p>Estão há mais de 30 dias sem voltar</p></div><span className="badge">34</span></div>{['Ricardo Mendes','Felipe Santos','Bruno Costa'].map((name, i) => <div className="recovery-row" key={name}><div className="client-avatar">{name.split(' ').map(x=>x[0]).slice(0,2).join('')}</div><div className="client-info"><strong>{name}</strong><small>Último corte há {42+i*8} dias</small></div><button className="whatsapp"><MessageCircle size={16} /> WhatsApp</button></div>)}</div>
    </div>
    <div className="panel"><div className="panel-head"><div><h3>Resumo de serviços</h3><p>Desempenho do mês</p></div></div><div className="service-summary">{services.map((s, i) => <div className="service-card" key={s.name}><div className="service-icon"><Scissors size={18}/></div><div><strong>{s.name}</strong><small>{[86, 62, 48][i]} atendimentos</small></div><b>{s.price}</b></div>)}</div></div>
  </section>;
}

function Stat({ icon: Icon, label, value, detail, positive }) { return <div className="stat"><div className="stat-icon"><Icon size={20}/></div><div><span>{label}</span><strong>{value}</strong><small className={positive ? 'positive' : ''}>{detail}</small></div></div>; }
function Agenda({ onNew }) { return <section className="content"><div className="page-head"><div><h2>Agenda</h2><p>Organize os atendimentos da sua equipe.</p></div><button className="primary" onClick={onNew}><Plus size={18}/> Novo agendamento</button></div><div className="calendar-bar"><button>‹</button><strong>Hoje, 09 de setembro</strong><button>›</button><div className="view-switch"><button className="selected">Dia</button><button>Semana</button><button>Mês</button></div></div><div className="panel"><AppointmentRows /></div></section>; }
function AppointmentRows({ compact = false }) { return <div className="appointments">{appointments.slice(0, compact ? 4 : 5).map(a => <div className="appointment" key={a.time}><div className="time">{a.time}</div><div className="appointment-main"><div className="client-avatar">{a.client.split(' ').map(x=>x[0]).slice(0,2).join('')}</div><div><strong>{a.client}</strong><span>{a.service} · {a.barber}</span></div></div><span className={`status ${a.status.toLowerCase().replaceAll(' ','-')}`}>{a.status}</span><button className="more"><MoreHorizontal size={18}/></button></div>)}</div>; }
function Clients() { return <section className="content"><div className="page-head"><div><h2>Clientes</h2><p>Gerencie sua base e acompanhe o histórico.</p></div><button className="primary"><Plus size={18}/> Novo cliente</button></div><div className="toolbar"><input placeholder="Buscar cliente por nome ou telefone..."/><button className="filter">Todos os clientes ▾</button></div><div className="panel table-wrap"><table><thead><tr><th>Cliente</th><th>Telefone</th><th>Último atendimento</th><th>Total gasto</th><th></th></tr></thead><tbody>{clients.map(c=><tr key={c.name}><td><div className="table-client"><div className="client-avatar">{c.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</div><strong>{c.name}</strong></div></td><td>{c.phone}</td><td>{c.last}</td><td>{c.total}</td><td><button className="more"><MoreHorizontal size={18}/></button></td></tr>)}</tbody></table></div></section>; }
function Services() { return <section className="content"><div className="page-head"><div><h2>Serviços</h2><p>Cadastre os serviços oferecidos pela barbearia.</p></div><button className="primary"><Plus size={18}/> Novo serviço</button></div><div className="service-list">{services.map(s=><div className="panel service-line" key={s.name}><div className="service-icon"><Scissors size={20}/></div><div><strong>{s.name}</strong><small><Clock3 size={14}/> {s.duration}</small></div><b>{s.price}</b><button className="more"><MoreHorizontal size={18}/></button></div>)}</div></section>; }
function Finance() { return <section className="content"><div className="page-head"><div><h2>Financeiro</h2><p>Acompanhe receitas e resultados da sua barbearia.</p></div><button className="primary"><Plus size={18}/> Lançar movimentação</button></div><div className="stats"><Stat icon={TrendingUp} label="Receita no mês" value="R$ 8.420,00" detail="+18,2% vs. mês anterior" positive/><Stat icon={WalletCards} label="Despesas" value="R$ 2.180,00" detail="12 lançamentos"/><Stat icon={WalletCards} label="Resultado" value="R$ 6.240,00" detail="Margem de 74,1%" positive/></div><div className="panel"><div className="panel-head"><div><h3>Movimentações recentes</h3><p>Setembro de 2026</p></div></div><div className="finance-row"><span>09/09 · Corte + Barba</span><b>+ R$ 80,00</b></div><div className="finance-row"><span>08/09 · Compra de produtos</span><b className="expense">- R$ 320,00</b></div><div className="finance-row"><span>08/09 · Corte masculino</span><b>+ R$ 45,00</b></div></div></section>; }
function NewAppointment({ onClose }) { return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><h2>Novo agendamento</h2><p>Cadastre um novo atendimento.</p></div><button onClick={onClose}>×</button></div><label>Cliente<input placeholder="Nome do cliente"/></label><label>Serviço<select><option>Corte masculino — R$ 45,00</option><option>Barba — R$ 40,00</option><option>Corte + Barba — R$ 80,00</option></select></label><div className="form-grid"><label>Data<input type="date" defaultValue="2026-09-09"/></label><label>Horário<input type="time" defaultValue="16:00"/></label></div><label>Barbeiro<select><option>João</option><option>Pedro</option><option>Carlos</option></select></label><div className="modal-actions"><button className="secondary" onClick={onClose}>Cancelar</button><button className="primary" onClick={onClose}>Agendar</button></div></div></div>; }

export default App;
