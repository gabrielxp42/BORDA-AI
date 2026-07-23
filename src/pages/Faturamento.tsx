import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { 
  Lock, 
  FileSpreadsheet, 
  Send, 
  TrendingUp, 
  Search, 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Award, 
  PieChart, 
  BarChart3, 
  Download, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight, 
  Sparkles,
  Users
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart as RePieChart, Pie, Legend
} from 'recharts';
import { WhatsAppBillingModal } from '@/components/billing/WhatsAppBillingModal';
import { FinancialTransactionModal } from '@/components/billing/FinancialTransactionModal';
import { FinancialTransaction, FinancialTransactionType } from '@/types/stockTypes';
import { format, startOfMonth, endOfMonth, subMonths, eachMonthOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface ClientBillingData {
  id: string;
  name: string;
  phone: string;
  orderCount: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  orders: any[];
}

export const Faturamento: React.FC = () => {
  const { isUnlocked } = useProfile();
  const { settings } = useCompanySettings();
  
  const [loading, setLoading] = useState(false);
  const [billingData, setBillingData] = useState<ClientBillingData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonthOffset, setSelectedMonthOffset] = useState<number>(0); // 0 = este mês, -1 = mês passado

  // KPI calculations
  const [grandTotal, setGrandTotal] = useState(0);
  const [paidTotal, setPaidTotal] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [avgTicket, setAvgTicket] = useState(0);
  const [topClient, setTopClient] = useState<ClientBillingData | null>(null);

  // Modal State
  const [selectedClient, setSelectedClient] = useState<ClientBillingData | null>(null);

  // Manual Cash Flow State (Receitas & Despesas)
  const [financialTransactions, setFinancialTransactions] = useState<FinancialTransaction[]>(() => {
    const saved = localStorage.getItem('borda_financial_transactions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [isFinModalOpen, setIsFinModalOpen] = useState(false);
  const [finModalType, setFinModalType] = useState<FinancialTransactionType>('income');

  useEffect(() => {
    localStorage.setItem('borda_financial_transactions', JSON.stringify(financialTransactions));
  }, [financialTransactions]);

  const handleAddFinancialTransaction = (newTx: Omit<FinancialTransaction, 'id' | 'created_at'>) => {
    const created: FinancialTransaction = {
      ...newTx,
      id: Date.now().toString(),
      created_at: new Date().toISOString(),
    };
    setFinancialTransactions((prev) => [created, ...prev]);
  };

  const openFinModal = (type: FinancialTransactionType) => {
    setFinModalType(type);
    setIsFinModalOpen(true);
  };

  useEffect(() => {
    if (isUnlocked) {
      fetchBillingData();
    }
  }, [isUnlocked, selectedMonthOffset]);

  const fetchBillingData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const targetDate = subMonths(now, selectedMonthOffset);
      const start = startOfMonth(targetDate).toISOString();
      const end = endOfMonth(targetDate).toISOString();

      // Busca todos os pedidos do período selecionado
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id, 
          total_amount, 
          payment_status,
          created_at,
          clients (id, name, phone)
        `)
        .gte('created_at', start)
        .lte('created_at', end);

      if (ordersError) throw ordersError;

      let gTotal = 0;
      let pTotal = 0;
      let pendTotal = 0;
      let totalOrderCount = 0;

      // Agrupa por cliente
      const grouped = (orders || []).reduce((acc: Record<string, ClientBillingData>, order: any) => {
        const client = order.clients;
        if (!client) return acc;

        const val = Number(order.total_amount || 0);
        const status = order.payment_status;

        if (!acc[client.id]) {
          acc[client.id] = {
            id: client.id,
            name: client.name,
            phone: client.phone || '',
            orderCount: 0,
            totalAmount: 0,
            paidAmount: 0,
            pendingAmount: 0,
            orders: []
          };
        }

        acc[client.id].orderCount += 1;
        acc[client.id].totalAmount += val;

        if (status === 'paid') {
          acc[client.id].paidAmount += val;
          pTotal += val;
        } else if (status === 'half_paid') {
          acc[client.id].paidAmount += val * 0.5;
          acc[client.id].pendingAmount += val * 0.5;
          pTotal += val * 0.5;
          pendTotal += val * 0.5;
        } else {
          acc[client.id].pendingAmount += val;
          pendTotal += val;
        }

        acc[client.id].orders.push(order);
        gTotal += val;
        totalOrderCount += 1;

        return acc;
      }, {});

      const result = Object.values(grouped).sort((a, b) => b.totalAmount - a.totalAmount);
      setBillingData(result);

      setGrandTotal(gTotal);
      setPaidTotal(pTotal);
      setPendingTotal(pendTotal);
      setAvgTicket(totalOrderCount > 0 ? gTotal / totalOrderCount : 0);
      setTopClient(result[0] || null);

    } catch (err) {
      console.error("Erro ao buscar faturamento:", err);
      toast.error("Erro ao carregar faturamento.");
    } finally {
      setLoading(false);
    }
  };

  // Dados dos últimos 6 meses para o gráfico
  const allOrdersMonthly = useMemo(() => {
    const months = eachMonthOfInterval({
      start: subMonths(new Date(), 5),
      end: new Date(),
    });
    return months.map((month) => ({
      name: format(month, 'MMM', { locale: ptBR }).toUpperCase(),
      isCurrent: format(month, 'MM/yyyy') === format(subMonths(new Date(), selectedMonthOffset), 'MM/yyyy'),
    }));
  }, [selectedMonthOffset]);

  // Se for operador, mostra tela de bloqueio
  if (!isUnlocked) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-4 animate-in fade-in duration-300">
        <div className="h-20 w-20 rounded-3xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-6 shadow-2xl">
          <Lock className="h-10 w-10 text-purple-400" />
        </div>
        <h2 className="text-2xl font-black text-white mb-2">Acesso Restrito ao Financeiro</h2>
        <p className="text-zinc-400 max-w-md text-xs leading-relaxed">
          A área de Faturamento e DRE de Fechamento de Mês é exclusiva do perfil Chefe. Desbloqueie o acesso no topo da tela para visualizar os valores.
        </p>
      </div>
    );
  }

  const filteredData = billingData.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const targetMonthDate = subMonths(new Date(), selectedMonthOffset);
  const paidPercentage = grandTotal > 0 ? Math.round((paidTotal / grandTotal) * 100) : 0;



  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Top Bar Header & Seletor de Mês */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-purple-400" />
            Painel Financeiro & Faturamento
          </h1>
          <p className="text-zinc-400 text-xs mt-1">
            Gestão de faturas abertas, taxa de adimplência e cobranças via WhatsApp.
          </p>
        </div>

        {/* Filtro de Meses */}
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center gap-1">
            {[
              { offset: 0, label: 'Este Mês' },
              { offset: 1, label: 'Mês Passado' },
              { offset: 2, label: 'Há 2 Meses' },
            ].map(m => (
              <button
                key={m.offset}
                onClick={() => setSelectedMonthOffset(m.offset)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedMonthOffset === m.offset
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-500 dark:text-zinc-400 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 🟢🔴 DOIS BOTÕES GIGANTES DE ENTRADA E SAÍDA DE CAIXA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Botão Gigante 1: REGISTRAR RECEITA */}
        <button
          onClick={() => openFinModal('income')}
          className="group relative overflow-hidden p-6 rounded-3xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 via-emerald-900/20 to-black/60 hover:border-emerald-400 transition-all shadow-xl hover:shadow-emerald-950/50 text-left active:scale-[0.99]"
        >
          <div className="absolute -right-6 -bottom-6 opacity-10 group-hover:opacity-20 transition-opacity">
            <ArrowUpRight className="h-40 w-40 text-emerald-400" />
          </div>
          <div className="relative z-10 flex items-center justify-between">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider">
                🟢 Entrada de Caixa / Receita
              </span>
              <h2 className="text-2xl font-black text-white group-hover:text-emerald-300 transition-colors">
                + NOVA RECEITA
              </h2>
              <p className="text-xs text-zinc-400 max-w-sm">
                Lançar recebimento manual, venda direta no balcão ou serviço de matriz.
              </p>
            </div>
            <div className="h-14 w-14 rounded-2xl bg-emerald-500 text-black flex items-center justify-center font-black shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform shrink-0">
              <ArrowUpRight className="h-8 w-8 stroke-[3]" />
            </div>
          </div>
        </button>

        {/* Botão Gigante 2: REGISTRAR DESPESA */}
        <button
          onClick={() => openFinModal('expense')}
          className="group relative overflow-hidden p-6 rounded-3xl border border-rose-500/40 bg-gradient-to-br from-rose-950/40 via-rose-900/20 to-black/60 hover:border-rose-400 transition-all shadow-xl hover:shadow-rose-950/50 text-left active:scale-[0.99]"
        >
          <div className="absolute -right-6 -bottom-6 opacity-10 group-hover:opacity-20 transition-opacity">
            <ArrowDownRight className="h-40 w-40 text-rose-400" />
          </div>
          <div className="relative z-10 flex items-center justify-between">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-black uppercase tracking-wider">
                🔴 Saída de Caixa / Despesa
              </span>
              <h2 className="text-2xl font-black text-white group-hover:text-rose-300 transition-colors">
                - NOVA DESPESA / SAÍDA
              </h2>
              <p className="text-xs text-zinc-400 max-w-sm">
                Lançar compras de estoque, energia, manutenção de máquinas ou salários.
              </p>
            </div>
            <div className="h-14 w-14 rounded-2xl bg-rose-500 text-white flex items-center justify-center font-black shadow-lg shadow-rose-500/30 group-hover:scale-110 transition-transform shrink-0">
              <ArrowDownRight className="h-8 w-8 stroke-[3]" />
            </div>
          </div>
        </button>
      </div>

      {/* Grid de 4 KPIs Financeiros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Faturamento Bruto */}
        <div className="glass-panel p-5 rounded-3xl border border-slate-200 dark:border-white/10 relative overflow-hidden group hover:border-purple-500/50 transition-all shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Total Faturado</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(grandTotal)}
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 capitalize">
            {format(targetMonthDate, 'MMMM yyyy', { locale: ptBR })}
          </p>
        </div>

        {/* KPI 2: Total Recebido (Pago) */}
        <div className="glass-panel p-5 rounded-3xl border border-slate-200 dark:border-white/10 relative overflow-hidden group hover:border-emerald-500/50 transition-all shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Recebido (Pago)</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-emerald-400">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(paidTotal)}
          </h2>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {paidPercentage}% Liquidado
            </span>
          </div>
        </div>

        {/* KPI 3: A Receber (Pendente) */}
        <div className="glass-panel p-5 rounded-3xl border border-slate-200 dark:border-white/10 relative overflow-hidden group hover:border-amber-500/50 transition-all shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">A Receber / Pendente</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-amber-400">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pendingTotal)}
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
            Faturas em aberto
          </p>
        </div>

        {/* KPI 4: Top Cliente */}
        <div className="glass-panel p-5 rounded-3xl border border-slate-200 dark:border-white/10 relative overflow-hidden group hover:border-pink-500/50 transition-all shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Top Cliente do Mês</span>
            <div className="p-2 rounded-xl bg-pink-500/10 text-pink-400">
              <Award className="h-4 w-4" />
            </div>
          </div>
          <h2 className="text-base font-black text-slate-900 dark:text-white truncate">
            {topClient ? topClient.name : 'Nenhum'}
          </h2>
          <p className="text-xs font-bold text-purple-400 mt-0.5">
            {topClient ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(topClient.totalAmount) : 'R$ 0,00'}
          </p>
        </div>
      </div>

      {/* Gráfico Visual de Progresso Financeiro */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-200 dark:border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white flex items-center gap-2">
              <PieChart className="h-4 w-4 text-purple-400" /> Saúde Financeira do Mês
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
              Proporção de pagamentos liquidados vs pendentes
            </p>
          </div>
          <span className="text-xs font-black text-emerald-400">{paidPercentage}% Liquidado</span>
        </div>

        {/* Donut Chart — Adimplência */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
          <div className="flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height={180}>
              <RePieChart>
                <Pie
                  data={[
                    { name: 'Pago', value: paidTotal, fill: '#10b981' },
                    { name: 'Pendente', value: pendingTotal, fill: settings.primaryColor },
                  ].filter(d => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={4}
                  dataKey="value"
                  startAngle={90}
                  endAngle={-270}
                >
                  <Cell fill="#10b981" stroke="transparent" />
                  <Cell fill={settings.primaryColor} stroke="transparent" opacity={0.7} />
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-[#111118] border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
                        <p className="font-black" style={{ color: d.fill }}>
                          {d.name}: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.value)}
                        </p>
                      </div>
                    );
                  }}
                />
              </RePieChart>
            </ResponsiveContainer>

            <div className="text-center -mt-2">
              <p className="text-3xl font-black text-white">{paidPercentage}%</p>
              <p className="text-[11px] text-zinc-400 font-bold">Liquidado no mês</p>
            </div>
          </div>

          {/* Legenda e valores */}
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  Pago (Liquidado)
                </div>
                <span className="text-sm font-black text-white">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(paidTotal)}
                </span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${paidPercentage}%` }} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  Pendente / A Receber
                </div>
                <span className="text-sm font-black text-white">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pendingTotal)}
                </span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${100 - paidPercentage}%`, backgroundColor: settings.primaryColor }} />
              </div>
            </div>

            {grandTotal === 0 && (
              <p className="text-[11px] text-zinc-500 text-center pt-2">Nenhum pedido neste mês ainda.</p>
            )}
          </div>
        </div>

        {/* Ranking de clientes do mês (barras horizontais) */}
        {billingData.length > 0 && (
          <div className="pt-4 border-t border-white/10 space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <Users className="h-3 w-3" style={{ color: settings.primaryColor }} /> Ranking de Clientes — {format(targetMonthDate, 'MMMM', { locale: ptBR })}
            </h4>
            <ResponsiveContainer width="100%" height={Math.min(billingData.length * 36, 180)}>
              <BarChart data={billingData.slice(0, 5).map(d => ({ name: d.name.split(' ')[0], Total: Math.round(d.totalAmount) }))} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#52525b', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-[#111118] border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
                        <p className="text-zinc-400 font-bold">{label}</p>
                        <p className="font-black" style={{ color: settings.primaryColor }}>
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(payload[0].value as number)}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="Total" fill={settings.primaryColor} radius={[0, 6, 6, 0]} maxBarSize={22} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Tabela de Fechamento por Cliente */}
      <div className="glass-panel rounded-3xl border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-200 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50 dark:bg-white/5">
          <div>
            <h3 className="font-black text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-400" /> Faturas Agrupadas por Cliente
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Clique em "Cobrar via Zap" para disparar a fatura formatada.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
            <input 
              type="text" 
              placeholder="Buscar cliente..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white dark:bg-black/40 border border-slate-300 dark:border-white/10 rounded-2xl pl-9 pr-4 py-2 text-xs text-slate-900 dark:text-zinc-200 outline-none focus:border-purple-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 font-bold uppercase text-[10px] text-slate-500 dark:text-zinc-400">
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4 text-center">Pedidos no Mês</th>
                <th className="px-6 py-4 text-right">Pago</th>
                <th className="px-6 py-4 text-right">Pendente</th>
                <th className="px-6 py-4 text-right">Total Fatura</th>
                <th className="px-6 py-4 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/5 font-medium text-slate-800 dark:text-zinc-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Carregando balanço financeiro...
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Nenhuma fatura encontrada neste mês.
                  </td>
                </tr>
              ) : (
                filteredData.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900 dark:text-white">{client.name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">{client.phone || 'Sem telefone registrado'}</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full bg-slate-200 dark:bg-white/10 font-bold text-slate-700 dark:text-zinc-300">
                        {client.orderCount} pedido(s)
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-emerald-500">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(client.paidAmount)}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-amber-500">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(client.pendingAmount)}
                    </td>
                    <td className="px-6 py-4 text-right font-black text-slate-900 dark:text-white">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(client.totalAmount)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => setSelectedClient(client)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600/10 text-emerald-500 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-600 hover:text-white transition-all active:scale-95 shadow-sm"
                      >
                        <Send className="h-3.5 w-3.5" /> Cobrar via Zap
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Envio da Fatura WhatsApp */}
      <WhatsAppBillingModal 
        isOpen={!!selectedClient}
        onClose={() => setSelectedClient(null)}
        clientData={selectedClient}
      />

      {/* Modal de Lançamento de Receitas e Despesas (Caixa) */}
      <FinancialTransactionModal
        isOpen={isFinModalOpen}
        onClose={() => setIsFinModalOpen(false)}
        type={finModalType}
        onSubmitTransaction={handleAddFinancialTransaction}
      />
    </div>
  );
};
