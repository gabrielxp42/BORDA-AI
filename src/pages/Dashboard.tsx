import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Layers, Calculator, ShoppingBag, Users, ArrowUpRight,
  Sparkles, Package, CheckCircle2, Clock, Plus,
  UserPlus, FileText, ChevronRight, RefreshCw, Kanban, Boxes, Wrench,
  ChevronDown, ChevronUp, Layers3
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import { CreateOrderModal } from '@/components/orders/CreateOrderModal';
import { CreateClientModal } from '@/components/clients/CreateClientModal';
import { OrderDetailsModal } from '@/components/orders/OrderDetailsModal';
import { toast } from 'sonner';

interface RecentOrder {
  id: string;
  order_number?: number;
  client_id: string;
  status: string;
  payment_status: 'pending' | 'paid' | 'half_paid';
  total_amount: number;
  created_at: string;
  clients?: { name: string; phone?: string; company_name?: string };
}

export const Dashboard: React.FC = () => {
  const { settings } = useCompanySettings();
  const pc = settings.primaryColor;
  const navigate = useNavigate();

  const [counts, setCounts] = useState({
    matrices: 0,
    clients: 0,
    pendingOrders: 0,
    doneOrders: 0,
  });
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);
  const [isCreateClientOpen, setIsCreateClientOpen] = useState(false);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<RecentOrder | null>(null);

  // Mobile accordions state (by default open 'vendas' on mobile)
  const [openSection, setOpenSection] = useState<string | null>('vendas');

  const toggleSection = (section: string) => {
    setOpenSection(prev => (prev === section ? null : section));
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [matricesRes, clientsRes, pendingRes, doneRes, recentOrdersRes] = await Promise.all([
        supabase.from('matrices').select('id', { count: 'exact', head: true }),
        supabase.from('clients').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('id', { count: 'exact', head: true }).neq('payment_status', 'paid'),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('payment_status', 'paid'),
        supabase.from('orders')
          .select('id, order_number, client_id, status, payment_status, total_amount, created_at, clients(name, phone, company_name)')
          .order('created_at', { ascending: false })
          .limit(5)
      ]);

      setCounts({
        matrices: matricesRes.count || 0,
        clients: clientsRes.count || 0,
        pendingOrders: pendingRes.count || 0,
        doneOrders: doneRes.count || 0,
      });

      setRecentOrders((recentOrdersRes.data as RecentOrder[]) || []);
    } catch (err) {
      console.error('Erro ao carregar dados do Dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('realtime-dashboard-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const stats = [
    {
      title: 'Matrizes na Biblioteca',
      value: loading ? '—' : counts.matrices.toString(),
      sub: 'Arquivos cadastrados',
      icon: Layers,
      color: pc,
      to: '/matrizes',
    },
    {
      title: 'Clientes Cadastrados',
      value: loading ? '—' : counts.clients.toString(),
      sub: 'Na base de dados',
      icon: Users,
      color: '#06b6d4',
      to: '/clientes',
    },
    {
      title: 'Pedidos em Aberto',
      value: loading ? '—' : counts.pendingOrders.toString(),
      sub: 'Aguardando pagamento / entrega',
      icon: Clock,
      color: '#f59e0b',
      to: '/pedidos',
    },
    {
      title: 'Pedidos Concluídos',
      value: loading ? '—' : counts.doneOrders.toString(),
      sub: 'Pagos e finalizados',
      icon: CheckCircle2,
      color: '#10b981',
      to: '/pedidos',
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Pago</span>;
      case 'half_paid':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">Sinal / 50%</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">Pendente</span>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* Banner de Boas-Vindas + Ações de Acesso Rápido */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-white/10 shadow-xl bg-white dark:bg-[#0d0d14]">
        {/* Degradê dinâmico da cor primária que transiciona suavemente para o fundo (branco no claro, escuro no escuro) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(135deg, ${pc}35 0%, ${pc}10 40%, transparent 100%)`,
          }}
        />

        <div
          className="absolute inset-0 opacity-[0.05] dark:opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, ${pc} 0, ${pc} 1px, transparent 0, transparent 50%)`,
            backgroundSize: '20px 20px'
          }}
        />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-widest shadow-xs"
              style={{ backgroundColor: `${pc}15`, borderColor: `${pc}30`, color: pc }}
            >
              <Sparkles className="h-3.5 w-3.5" /> Painel Operacional
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              Bem-vindo ao <span style={{ color: pc }}>{settings.systemName}</span>
            </h2>
            <p className="text-sm text-slate-600 dark:text-zinc-300 max-w-xl">
              Crie pedidos rapidamente, cadastre clientes e gerencie sua produção de bordados sem complicação.
            </p>
          </div>

          {/* Botões Principais do Dia a Dia */}
          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={() => setIsCreateOrderOpen(true)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl font-bold text-white shadow-lg transition-all hover:scale-105 active:scale-95 cursor-pointer text-sm"
              style={{
                backgroundColor: pc,
                boxShadow: `0 8px 20px -4px ${pc}60`
              }}
            >
              <Plus className="h-5 w-5" />
              <span>Criar Novo Pedido</span>
            </button>

            <button
              onClick={() => setIsCreateClientOpen(true)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl font-semibold text-slate-800 dark:text-white bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 border border-slate-200 dark:border-white/20 backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer text-sm shadow-xs"
            >
              <UserPlus className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              <span>Novo Cliente</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPIs operacionais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <Link
              key={i}
              to={s.to}
              className="glass-panel p-4 rounded-3xl border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/25 transition-all group block"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 leading-tight">{s.title}</span>
                <div
                  className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                  style={{ backgroundColor: `${s.color}15` }}
                >
                  <Icon className="h-4 w-4" style={{ color: s.color }} />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white leading-none">{s.value}</p>
              <div className="flex items-center justify-between mt-2">
                <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium">{s.sub}</p>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500 group-hover:text-slate-900 dark:group-hover:text-white transition-colors" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Grade com Fila de Pedidos Recentes + Ações Rápidas por Área */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Lista de Pedidos Recentes (Fila de Trabalho) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-zinc-400 flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-amber-500 dark:text-amber-400" />
              Últimos Pedidos Cadastrados
            </h3>
            <Link
              to="/pedidos"
              className="text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 transition-colors"
            >
              Ver Todos <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="glass-panel rounded-3xl border border-slate-200 dark:border-white/10 overflow-hidden divide-y divide-slate-100 dark:divide-white/5">
            {loading ? (
              <div className="p-8 text-center text-slate-500 dark:text-zinc-500 text-sm flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" /> Carregando pedidos...
              </div>
            ) : recentOrders.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-slate-600 dark:text-zinc-400 text-sm font-medium">Nenhum pedido cadastrado ainda.</p>
                <button
                  onClick={() => setIsCreateOrderOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Criar o primeiro pedido
                </button>
              </div>
            ) : (
              recentOrders.map((ord) => {
                const clientName = ord.clients?.name || ord.clients?.company_name || 'Cliente não identificado';
                const formattedDate = new Date(ord.created_at).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div
                    key={ord.id}
                    onClick={() => setSelectedOrderForDetails(ord)}
                    className="p-4 hover:bg-slate-50/80 dark:hover:bg-white/5 transition-colors flex items-center justify-between gap-4 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-2xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-white/10 flex items-center justify-center shrink-0 font-bold text-xs text-slate-800 dark:text-white">
                        #{ord.order_number || ord.id.slice(0, 4)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                          {clientName}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-2">
                          <span>{formattedDate}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                          R$ {Number(ord.total_amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      {getStatusBadge(ord.payment_status)}
                      <ChevronRight className="h-4 w-4 text-slate-400 dark:text-zinc-600 group-hover:text-slate-900 dark:group-hover:text-white transition-colors" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Ferramentas por Fluxo de Trabalho (com Accordion em Mobile) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-zinc-400">
              Ferramentas do Dia a Dia
            </h3>
            <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-medium sm:hidden">
              (Toque para expandir)
            </span>
          </div>

          <div className="space-y-2.5">
            {/* Bloco 1: Vendas & Orçamentos */}
            <div className="glass-panel rounded-3xl border border-slate-200 dark:border-white/10 overflow-hidden transition-all">
              <button
                onClick={() => toggleSection('vendas')}
                className="w-full p-4 flex items-center justify-between text-left cursor-pointer sm:cursor-default"
              >
                <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                  <Calculator className="h-4 w-4" /> Orçamentos & Vendas
                </div>
                <div className="sm:hidden text-slate-400 dark:text-zinc-500">
                  {openSection === 'vendas' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              <div className={`p-4 pt-0 space-y-2 ${openSection === 'vendas' ? 'block' : 'hidden sm:block'}`}>
                <button
                  onClick={() => setIsCreateOrderOpen(true)}
                  className="w-full p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 transition-all flex items-center justify-between text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <Plus className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">Orçamentador & Novo Pedido</p>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400">Calcular preço por pontos e fechar pedido</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 dark:text-zinc-600 group-hover:text-slate-900 dark:group-hover:text-white" />
                </button>

                <Link
                  to="/calculadora"
                  className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 transition-all flex items-center justify-between text-left group block"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                      <Calculator className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">Simulador de Calculadora</p>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400">Simule valores rápidos por pontuação</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 dark:text-zinc-600 group-hover:text-slate-900 dark:group-hover:text-white" />
                </Link>
              </div>
            </div>

            {/* Bloco 2: Oficina & Produção */}
            <div className="glass-panel rounded-3xl border border-slate-200 dark:border-white/10 overflow-hidden transition-all">
              <button
                onClick={() => toggleSection('producao')}
                className="w-full p-4 flex items-center justify-between text-left cursor-pointer sm:cursor-default"
              >
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  <Kanban className="h-4 w-4" /> Produção & Oficina
                </div>
                <div className="sm:hidden text-slate-400 dark:text-zinc-500">
                  {openSection === 'producao' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              <div className={`p-4 pt-0 space-y-2 ${openSection === 'producao' ? 'block' : 'hidden sm:block'}`}>
                <Link
                  to="/pedidos"
                  className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 transition-all flex items-center justify-between text-left group block"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <Kanban className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">Kanban de Produção</p>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400">Acompanhar status da fila de bordado</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 dark:text-zinc-600 group-hover:text-slate-900 dark:group-hover:text-white" />
                </Link>

                <Link
                  to="/matrizes"
                  className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 transition-all flex items-center justify-between text-left group block"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                      <Layers className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">Acervo de Matrizes Wilcom</p>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400">Buscar, importar e visualizar arquivos</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 dark:text-zinc-600 group-hover:text-slate-900 dark:group-hover:text-white" />
                </Link>
              </div>
            </div>

            {/* Bloco 3: Cadastros Rápidos */}
            <div className="glass-panel rounded-3xl border border-slate-200 dark:border-white/10 overflow-hidden transition-all">
              <button
                onClick={() => toggleSection('cadastros')}
                className="w-full p-4 flex items-center justify-between text-left cursor-pointer sm:cursor-default"
              >
                <div className="flex items-center gap-2 text-xs font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">
                  <Users className="h-4 w-4" /> Clientes & Insumos
                </div>
                <div className="sm:hidden text-slate-400 dark:text-zinc-500">
                  {openSection === 'cadastros' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              <div className={`p-4 pt-0 space-y-2 ${openSection === 'cadastros' ? 'block' : 'hidden sm:block'}`}>
                <button
                  onClick={() => setIsCreateClientOpen(true)}
                  className="w-full p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 transition-all flex items-center justify-between text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                      <UserPlus className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">Cadastrar Cliente</p>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400">Adicionar novo cliente à base</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 dark:text-zinc-600 group-hover:text-slate-900 dark:group-hover:text-white" />
                </button>

                <Link
                  to="/estoque"
                  className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 transition-all flex items-center justify-between text-left group block"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                      <Boxes className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">Controle de Estoque & Linhas</p>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400">Gerenciar insumos e agulhas</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 dark:text-zinc-600 group-hover:text-slate-900 dark:group-hover:text-white" />
                </Link>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Modais Integrados no Dashboard */}
      {isCreateOrderOpen && (
        <CreateOrderModal
          isOpen={isCreateOrderOpen}
          onClose={() => setIsCreateOrderOpen(false)}
          onOrderCreated={() => {
            setIsCreateOrderOpen(false);
            toast.success('Pedido criado com sucesso!');
            loadData();
          }}
        />
      )}

      {isCreateClientOpen && (
        <CreateClientModal
          isOpen={isCreateClientOpen}
          onClose={() => setIsCreateClientOpen(false)}
          onClientCreated={() => {
            setIsCreateClientOpen(false);
            toast.success('Cliente cadastrado com sucesso!');
            loadData();
          }}
        />
      )}

      {selectedOrderForDetails && (
        <OrderDetailsModal
          isOpen={!!selectedOrderForDetails}
          onClose={() => setSelectedOrderForDetails(null)}
          order={selectedOrderForDetails}
          onDelete={() => {
            setSelectedOrderForDetails(null);
            loadData();
          }}
        />
      )}

    </div>
  );
};


