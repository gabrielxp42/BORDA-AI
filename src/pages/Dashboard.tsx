import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Layers, Calculator, ShoppingBag, Users, ArrowUpRight,
  Sparkles, Package, CheckCircle2, Clock, Plus,
  UserPlus, FileText, ChevronRight, RefreshCw, Kanban, Boxes,
  DollarSign, TrendingUp, Award, Phone, MessageCircle, AlertCircle, HandCoins
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import { useProfile } from '../contexts/ProfileContext';
import { CreateOrderModal } from '@/components/orders/CreateOrderModal';
import { CreateClientModal } from '@/components/clients/CreateClientModal';
import { OrderDetailsModal } from '@/components/orders/OrderDetailsModal';
import { PaymentStatusModal } from '@/components/orders/PaymentStatusModal';
import { toast } from 'sonner';
import { GabiHeroWidget } from '@/components/gabi/GabiHeroWidget';
import { formatCurrency } from '@/utils/currencyFormatter';
import { parsePaymentMetadata, formatOrderPaymentBadgeDetails } from '@/utils/paymentHelper';
import { format, subMonths, startOfMonth, endOfMonth, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OrderRecord {
  id: string;
  order_number?: number;
  client_id: string;
  status: string;
  payment_status: 'pending' | 'paid' | 'half_paid';
  payment_method?: string;
  total_amount: number;
  notes?: string;
  created_at: string;
  due_date?: string;
  clients?: { id: string; name: string; phone?: string; company_name?: string };
}

export const Dashboard: React.FC = () => {
  const { settings } = useCompanySettings();
  const { permissions, isUnlocked } = useProfile();
  const canSeeFinancials = isUnlocked || (permissions?.canSeeFinancials === true);
  const pc = settings.primaryColor;

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [matricesCount, setMatricesCount] = useState<number>(0);
  const [clientsCount, setClientsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Modais State
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);
  const [isCreateClientOpen, setIsCreateClientOpen] = useState(false);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<OrderRecord | null>(null);
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<OrderRecord | null>(null);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;

      const [matricesRes, clientsRes, ordersRes] = await Promise.all([
        supabase.from('matrices').select('id', { count: 'exact', head: true }),
        supabase.from('clients').select('id', { count: 'exact', head: true }),
        supabase
          .from('orders')
          .select(`
            id, order_number, client_id, status, payment_status, payment_method, total_amount, notes, created_at, due_date,
            clients (id, name, phone, company_name)
          `)
          .order('created_at', { ascending: false })
      ]);

      setMatricesCount(matricesRes.count || 0);
      setClientsCount(clientsRes.count || 0);
      setOrders((ordersRes.data as unknown as OrderRecord[]) || []);
    } catch (err) {
      console.error('Erro ao carregar dados do Dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();

    const channel = supabase
      .channel('realtime-dashboard-orders-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadDashboardData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 1. CÁLCULO DE MÉTRICAS EXECUTIVAS (2 ANOS DE HISTÓRICO)
  const metrics = useMemo(() => {
    let totalBilledAllTime = 0;
    let paidOrdersCount = 0;
    let totalPendingReceivables = 0;

    let pendentesCount = 0;
    let inProductionCount = 0;
    let unpaidOrdersCount = 0;
    let readyCount = 0;
    let deliveredCount = 0;

    orders.forEach(ord => {
      const val = Number(ord.total_amount || 0);
      const { metadata } = parsePaymentMetadata(ord.notes);

      if (ord.payment_status === 'paid') {
        totalBilledAllTime += val;
        paidOrdersCount += 1;
      } else if (ord.payment_status === 'half_paid') {
        const deposit = metadata.depositAmount || val / 2;
        totalBilledAllTime += deposit;
        totalPendingReceivables += Math.max(0, val - deposit);
        paidOrdersCount += 0.5;
        unpaidOrdersCount += 1;
      } else {
        totalPendingReceivables += val;
        unpaidOrdersCount += 1;
      }

      // Status do Kanban / Pedido
      const st = (ord.status || '').toLowerCase();
      if (st === 'producao' || st === 'em_producao') {
        inProductionCount++;
      } else if (st === 'pronto' || st === 'aguardando') {
        readyCount++;
      } else if (st === 'entregue' || st === 'concluido') {
        deliveredCount++;
      } else {
        pendentesCount++;
      }
    });

    const averageTicket = paidOrdersCount > 0 ? totalBilledAllTime / Math.max(1, paidOrdersCount) : 0;
    const totalOrdersCount = orders.length;

    return {
      totalBilledAllTime,
      totalOrdersCount,
      paidOrdersCount: Math.floor(paidOrdersCount),
      averageTicket,
      totalPendingReceivables,
      pendentesCount,
      inProductionCount,
      unpaidOrdersCount,
      readyCount,
      deliveredCount
    };
  }, [orders]);

  // 2. DADOS DO GRÁFICO MENSAL (ÚLTIMOS 12 MESES)
  const monthlyChartData = useMemo(() => {
    const monthsData: Record<string, { monthLabel: string; faturamento: number; pedidos: number }> = {};

    // Inicializar os últimos 12 meses em ordem cronológica
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, 'yyyy-MM');
      const monthLabel = format(d, 'MMM/yy', { locale: ptBR }).toUpperCase();
      monthsData[key] = { monthLabel, faturamento: 0, pedidos: 0 };
    }

    orders.forEach(ord => {
      if (!ord.created_at) return;
      const key = format(new Date(ord.created_at), 'yyyy-MM');
      if (monthsData[key]) {
        const val = Number(ord.total_amount || 0);
        const { metadata } = parsePaymentMetadata(ord.notes);

        monthsData[key].pedidos += 1;
        if (ord.payment_status === 'paid') {
          monthsData[key].faturamento += val;
        } else if (ord.payment_status === 'half_paid') {
          monthsData[key].faturamento += (metadata.depositAmount || val / 2);
        }
      }
    });

    return Object.values(monthsData);
  }, [orders]);

  // 3. TOP 5 CLIENTES VIPs (MAIORES COMPRADORES HISTÓRICOS)
  const topClients = useMemo(() => {
    const map: Record<string, { id: string; name: string; phone?: string; company?: string; totalSpent: number; orderCount: number }> = {};

    orders.forEach(ord => {
      if (!ord.clients?.id) return;
      const cId = ord.clients.id;
      const val = Number(ord.total_amount || 0);

      if (!map[cId]) {
        map[cId] = {
          id: cId,
          name: ord.clients.name || 'Cliente sem nome',
          phone: ord.clients.phone,
          company: ord.clients.company_name,
          totalSpent: 0,
          orderCount: 0
        };
      }

      map[cId].orderCount += 1;
      if (ord.payment_status === 'paid') {
        map[cId].totalSpent += val;
      } else if (ord.payment_status === 'half_paid') {
        const { metadata } = parsePaymentMetadata(ord.notes);
        map[cId].totalSpent += (metadata.depositAmount || val / 2);
      }
    });

    return Object.values(map)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);
  }, [orders]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">

      {/* Banner Executivo de Boas-Vindas + Botões Principais */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-white/10 shadow-xl bg-white dark:bg-[#0d0d14]">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(135deg, ${pc}35 0%, ${pc}10 40%, transparent 100%)`,
          }}
        />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-widest shadow-xs"
              style={{ backgroundColor: `${pc}15`, borderColor: `${pc}30`, color: pc }}
            >
              <Sparkles className="h-3.5 w-3.5" /> Centro de Comando & Operação
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              Painel Geral do <span style={{ color: pc }}>{settings.systemName}</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-300 max-w-xl">
              Visão consolidada de produção, faturamento acumulado, fluxo de pedidos e acervo Wilcom.
            </p>
          </div>

          {/* Botões de Ação Rápida */}
          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={() => setIsCreateOrderOpen(true)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl font-bold text-white shadow-lg transition-all hover:scale-105 active:scale-95 cursor-pointer text-xs uppercase tracking-wider"
              style={{
                backgroundColor: pc,
                boxShadow: `0 8px 20px -4px ${pc}60`
              }}
            >
              <Plus className="h-4 w-4" />
              <span>Criar Novo Pedido</span>
            </button>

            <button
              onClick={() => setIsCreateClientOpen(true)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl font-bold text-slate-800 dark:text-white bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 border border-slate-200 dark:border-white/20 transition-all hover:scale-105 active:scale-95 cursor-pointer text-xs uppercase tracking-wider shadow-xs"
            >
              <UserPlus className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              <span>Novo Cliente</span>
            </button>
          </div>
        </div>
      </div>

      {/* 🤖 Assistente Virtual GABI IA */}
      <GabiHeroWidget />

      {/* CARDS EXECUTIVOS (KPIs DE DESEMPENHO DE 2 ANOS) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        
        {/* Card 1: Faturamento Acumulado */}
        <div className="glass-panel p-5 rounded-3xl border border-slate-200 dark:border-white/10 hover:border-emerald-500/40 transition-all relative overflow-hidden group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">Faturamento Acumulado</span>
            <div className="h-9 w-9 rounded-2xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-none">
            {loading ? '—' : formatCurrency(metrics.totalBilledAllTime, canSeeFinancials)}
          </p>
          <p className="text-[11px] text-emerald-500 font-bold mt-2.5 flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" /> Total histórico recebido
          </p>
        </div>

        {/* Card 2: Ticket Médio por Pedido */}
        <div className="glass-panel p-5 rounded-3xl border border-slate-200 dark:border-white/10 hover:border-purple-500/40 transition-all relative overflow-hidden group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">Ticket Médio p/ Pedido</span>
            <div className="h-9 w-9 rounded-2xl bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
              <Calculator className="h-5 w-5" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-none">
            {loading ? '—' : formatCurrency(metrics.averageTicket, canSeeFinancials)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium mt-2.5">
            Média por pedido finalizado
          </p>
        </div>

        {/* Card 3: Total de Pedidos Produzidos */}
        <div className="glass-panel p-5 rounded-3xl border border-slate-200 dark:border-white/10 hover:border-blue-500/40 transition-all relative overflow-hidden group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">Total de Pedidos</span>
            <div className="h-9 w-9 rounded-2xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
              <ShoppingBag className="h-5 w-5" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-none">
            {loading ? '—' : `${metrics.totalOrdersCount} pedidos`}
          </p>
          <p className="text-[11px] text-blue-400 font-bold mt-2.5 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> {metrics.paidOrdersCount} totalmente quitados
          </p>
        </div>

        {/* Card 4: Matrizes & Acervo Wilcom */}
        <Link 
          to="/matrizes"
          className="glass-panel p-5 rounded-3xl border border-slate-200 dark:border-white/10 hover:border-cyan-500/40 transition-all relative overflow-hidden group block"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">Acervo de Matrizes</span>
            <div className="h-9 w-9 rounded-2xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Layers className="h-5 w-5" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-none">
            {loading ? '—' : `${matricesCount} arquivos`}
          </p>
          <p className="text-[11px] text-cyan-400 font-bold mt-2.5 flex items-center justify-between">
            <span>Ver Biblioteca Wilcom</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </p>
        </Link>

      </div>

      {/* 📊 BARRA STATUS DOS PEDIDOS (NOVO PAINEL SOLICITADO) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400 flex items-center gap-2">
            <Kanban className="h-4 w-4 text-purple-500" /> STATUS DOS PEDIDOS
          </h3>
          <Link to="/pedidos-kanban" className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1">
            Ver Quadro Kanban <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          
          {/* Card 1: PENDENTES */}
          <Link
            to="/pedidos-kanban"
            className="p-4 rounded-2xl bg-white dark:bg-[#0d0d14] border border-amber-500/30 hover:border-amber-500 text-center transition-all hover:scale-105 active:scale-95 group shadow-sm"
          >
            <Clock className="h-5 w-5 text-amber-500 mx-auto mb-1.5 group-hover:rotate-12 transition-transform" />
            <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 leading-none">
              {loading ? '—' : metrics.pendentesCount}
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mt-1.5 block">
              PENDENTES
            </span>
          </Link>

          {/* Card 2: PROCESSANDO / EM PRODUÇÃO */}
          <Link
            to="/pedidos-kanban"
            className="p-4 rounded-2xl bg-white dark:bg-[#0d0d14] border border-cyan-500/30 hover:border-cyan-500 text-center transition-all hover:scale-105 active:scale-95 group shadow-sm"
          >
            <Boxes className="h-5 w-5 text-cyan-500 mx-auto mb-1.5 group-hover:rotate-12 transition-transform" />
            <div className="text-xl sm:text-2xl font-black text-cyan-600 dark:text-cyan-400 leading-none">
              {loading ? '—' : metrics.inProductionCount}
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mt-1.5 block">
              PROCESSANDO
            </span>
          </Link>

          {/* Card 3: FALTAM PAGAR / A RECEBER */}
          <Link
            to="/faturamento"
            className="p-4 rounded-2xl bg-white dark:bg-[#0d0d14] border border-rose-500/30 hover:border-rose-500 text-center transition-all hover:scale-105 active:scale-95 group shadow-sm relative overflow-hidden"
          >
            <DollarSign className="h-5 w-5 text-rose-500 mx-auto mb-1.5 group-hover:scale-110 transition-transform" />
            <div className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 leading-none">
              {loading ? '—' : metrics.unpaidOrdersCount}
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 mt-1.5 block">
              FALTAM PAGAR
            </span>
          </Link>

          {/* Card 4: AGUARDANDO / PRONTO */}
          <Link
            to="/pedidos-kanban"
            className="p-4 rounded-2xl bg-white dark:bg-[#0d0d14] border border-purple-500/30 hover:border-purple-500 text-center transition-all hover:scale-105 active:scale-95 group shadow-sm"
          >
            <Package className="h-5 w-5 text-purple-500 mx-auto mb-1.5 group-hover:rotate-12 transition-transform" />
            <div className="text-xl sm:text-2xl font-black text-purple-600 dark:text-purple-400 leading-none">
              {loading ? '—' : metrics.readyCount}
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mt-1.5 block">
              AGUARDANDO
            </span>
          </Link>

          {/* Card 5: ENTREGUES */}
          <Link
            to="/pedidos-kanban"
            className="p-4 rounded-2xl bg-white dark:bg-[#0d0d14] border border-emerald-500/30 hover:border-emerald-500 text-center transition-all hover:scale-105 active:scale-95 group shadow-sm"
          >
            <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto mb-1.5 group-hover:scale-110 transition-transform" />
            <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 leading-none">
              {loading ? '—' : metrics.deliveredCount}
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mt-1.5 block">
              ENTREGUES
            </span>
          </Link>

        </div>
      </div>

      {/* PAINEL CENTRAL: GRÁFICO DE EVOLUÇÃO MENSAL + TOP CLIENTES VIPS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* GRÁFICO RECHARTS DE EVOLUÇÃO DO FATURAMENTO (12 MESES) */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-3xl border border-slate-200 dark:border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Desempenho Mensal de Vendas (Últimos 12 Meses)
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Evolução cronológica do faturamento da oficina</p>
            </div>
            <Link to="/faturamento" className="text-xs font-bold text-purple-400 hover:underline flex items-center gap-1">
              Faturamento Completo <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyChartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashboardRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={pc} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={pc} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="monthLabel" tick={{ fill: '#888', fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#888', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#12121a', borderColor: '#ffffff20', borderRadius: '16px', fontSize: '12px', fontWeight: 'bold' }}
                  formatter={(value: any) => [`R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Faturamento']}
                />
                <Area type="monotone" dataKey="faturamento" stroke={pc} strokeWidth={3} fillOpacity={1} fill="url(#dashboardRevenueGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* RANKING TOP CLIENTES VIPS */}
        <div className="glass-panel p-6 rounded-3xl border border-slate-200 dark:border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-400" />
              Maiores Clientes Históricos
            </h3>
            <Link to="/clientes" className="text-xs font-bold text-cyan-400 hover:underline">
              Ver Todos
            </Link>
          </div>

          <div className="space-y-2.5">
            {topClients.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-zinc-500 py-6 text-center">Nenhum cliente com pedidos registrado.</p>
            ) : (
              topClients.map((client, idx) => (
                <div 
                  key={client.id}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-between gap-3 hover:border-amber-500/30 transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-8 w-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                      idx === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
                      idx === 1 ? 'bg-slate-300/20 text-slate-300 border border-slate-400/30' :
                      idx === 2 ? 'bg-amber-700/20 text-amber-600 border border-amber-700/30' :
                      'bg-white/10 text-zinc-400'
                    }`}>
                      #{idx + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {client.name}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400">
                        {client.orderCount} {client.orderCount === 1 ? 'pedido' : 'pedidos'} salvos
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xs font-black text-slate-900 dark:text-white">
                      {formatCurrency(client.totalSpent, canSeeFinancials)}
                    </p>
                    {client.phone && (
                      <a
                        href={`https://wa.me/${client.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 hover:underline mt-0.5"
                      >
                        <MessageCircle className="h-3 w-3" /> Contatar
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* FILA DE TRABALHO DA OFICINA + ATALHOS FLUXO DE TRABALHO */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Fila dos Últimos Pedidos */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-zinc-400 flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-amber-500 dark:text-amber-400" />
              Fila Recente de Pedidos da Oficina
            </h3>
            <Link
              to="/pedidos"
              className="text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 transition-colors"
            >
              Ver Kanban Completo <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="glass-panel rounded-3xl border border-slate-200 dark:border-white/10 overflow-hidden divide-y divide-slate-100 dark:divide-white/5">
            {loading ? (
              <div className="p-8 text-center text-slate-500 dark:text-zinc-500 text-sm flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" /> Carregando pedidos...
              </div>
            ) : orders.length === 0 ? (
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
              orders.slice(0, 6).map((ord) => {
                const clientName = ord.clients?.name || ord.clients?.company_name || 'Cliente não identificado';
                const formattedDate = new Date(ord.created_at).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                const badgeDetails = formatOrderPaymentBadgeDetails(ord.payment_status, ord.total_amount, ord.notes, ord.payment_method, canSeeFinancials);

                return (
                  <div
                    key={ord.id}
                    onClick={() => setSelectedOrderForDetails(ord)}
                    className="p-4 hover:bg-slate-50/80 dark:hover:bg-white/5 transition-colors flex items-center justify-between gap-4 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-2xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-white/10 flex items-center justify-center shrink-0 font-black text-xs text-slate-800 dark:text-white">
                        #{ord.order_number || ord.id.slice(0, 4)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-purple-400 transition-colors">
                          {clientName}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                          {formattedDate}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                          {formatCurrency(ord.total_amount || 0, canSeeFinancials)}
                        </p>
                      </div>
                      
                      {/* Badge de Pagamento Interativo */}
                      <span 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedOrderForPayment(ord);
                        }}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border cursor-pointer hover:scale-105 transition-transform ${
                          badgeDetails.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                          badgeDetails.status === 'half_paid' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                          'bg-amber-500/20 text-amber-400 border-amber-500/30'
                        }`}
                        title="Clique para lançar pagamento"
                      >
                        {badgeDetails.shortLabel}
                      </span>

                      <ChevronRight className="h-4 w-4 text-slate-400 dark:text-zinc-600 group-hover:text-slate-900 dark:group-hover:text-white transition-colors" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Ferramentas de Trabalho da Oficina */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-zinc-400">
              Ferramentas de Produção
            </h3>
          </div>

          <div className="space-y-2.5">
            <Link
              to="/pedidos"
              className="p-4 rounded-3xl glass-panel border border-slate-200 dark:border-white/10 hover:border-emerald-500/40 transition-all flex items-center justify-between group block"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                  <Kanban className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">Kanban da Oficina</p>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400">Gerenciar esteira de bordado</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 dark:text-zinc-600 group-hover:text-white" />
            </Link>

            <Link
              to="/calculadora"
              className="p-4 rounded-3xl glass-panel border border-slate-200 dark:border-white/10 hover:border-cyan-500/40 transition-all flex items-center justify-between group block"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-2xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0">
                  <Calculator className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">Simulador por Pontos</p>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400">Calcular valores rápidos</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 dark:text-zinc-600 group-hover:text-white" />
            </Link>

            <Link
              to="/estoque"
              className="p-4 rounded-3xl glass-panel border border-slate-200 dark:border-white/10 hover:border-rose-500/40 transition-all flex items-center justify-between group block"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
                  <Boxes className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">Estoque de Linhas & Agulhas</p>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400">Gerenciar insumos e agulhas</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 dark:text-zinc-600 group-hover:text-white" />
            </Link>
          </div>
        </div>

      </div>

      {/* MODAIS INTEGRADOS */}
      {isCreateOrderOpen && (
        <CreateOrderModal
          isOpen={isCreateOrderOpen}
          onClose={() => setIsCreateOrderOpen(false)}
          onOrderCreated={() => {
            setIsCreateOrderOpen(false);
            toast.success('Pedido criado com sucesso!');
            loadDashboardData();
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
            loadDashboardData();
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
            loadDashboardData();
          }}
          onOrderUpdated={(updatedOrder) => {
            if (updatedOrder) {
              setSelectedOrderForDetails(updatedOrder);
            }
            loadDashboardData();
          }}
        />
      )}

      {selectedOrderForPayment && (
        <PaymentStatusModal
          isOpen={!!selectedOrderForPayment}
          onClose={() => setSelectedOrderForPayment(null)}
          order={selectedOrderForPayment}
          onStatusUpdated={() => {
            setSelectedOrderForPayment(null);
            loadDashboardData();
          }}
        />
      )}

    </div>
  );
};
