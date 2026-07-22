import React, { useState, useEffect } from 'react';
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
import { WhatsAppBillingModal } from '@/components/billing/WhatsAppBillingModal';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
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

        {/* Barra Visual Progresso Dual Color */}
        <div className="h-4 w-full bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden p-0.5 flex">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-700 shadow-lg shadow-emerald-500/30"
            style={{ width: `${paidPercentage}%` }}
          />
          <div 
            className="h-full bg-amber-500/40 rounded-r-full transition-all duration-700"
            style={{ width: `${100 - paidPercentage}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs font-bold pt-1">
          <div className="flex items-center gap-2 text-emerald-400">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Pago: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(paidTotal)}</span>
          </div>
          <div className="flex items-center gap-2 text-amber-400">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Pendente: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pendingTotal)}</span>
          </div>
        </div>
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
    </div>
  );
};
