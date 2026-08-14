import React, { useState, useEffect, useMemo } from 'react';
import { 
  CreditCard, Search, Calendar, AlertTriangle, CheckCircle2, Clock, 
  Send, FileText, User, Building, Phone, DollarSign, Plus, ChevronRight, 
  Layers, ArrowUpRight, Filter, Sparkles, RefreshCw, X, ShieldAlert, Check
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { printClientStatementPDF } from '@/services/pdfGenerator';
import { sendEvolutionText, getWhatsAppWebLink } from '@/services/whatsappService';
import { parsePaymentMetadata, formatPaymentMethodName } from '@/utils/paymentHelper';
import { formatCurrency } from '@/utils/currencyFormatter';
import { format, differenceInDays, parseISO, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface PendingOrder {
  id: string;
  order_number?: number;
  client_id: string;
  total_amount: number;
  payment_status: 'pending' | 'half_paid';
  created_at: string;
  due_date?: string;
  notes?: string;
  client?: {
    id: string;
    name: string;
    phone?: string;
    company_name?: string;
  };
}

interface ClientDebts {
  clientId: string;
  clientName: string;
  clientPhone?: string;
  clientCompany?: string;
  orders: PendingOrder[];
  totalPending: number;
  hasOverdue: boolean;
  oldestDueDate?: string;
}

export const CobrancasHub: React.FC = () => {
  const { isUnlocked } = useProfile();
  const { settings } = useCompanySettings();
  const [loading, setLoading] = useState(true);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'overdue' | 'upcoming'>('all');

  // Estado do Modal de Parcelamento / Junção de Pedidos
  const [selectedClientForInstallments, setSelectedClientForInstallments] = useState<ClientDebts | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [installmentCount, setInstallmentCount] = useState<number>(2);
  const [intervalDays, setIntervalDays] = useState<number>(15);
  const [firstDueDate, setFirstDueDate] = useState<string>(() => format(addDays(new Date(), 15), 'yyyy-MM-dd'));
  const [savingInstallments, setSavingInstallments] = useState(false);

  useEffect(() => {
    fetchPendingOrders();
  }, []);

  const fetchPendingOrders = async () => {
    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) return;

      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, order_number, client_id, total_amount, payment_status, created_at, due_date, notes,
          client:clients (id, name, phone, company_name)
        `)
        .eq('user_id', userId)
        .or('payment_status.neq.paid,payment_status.is.null')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPendingOrders((data as any) || []);
    } catch (err) {
      console.error('Erro ao carregar débitos:', err);
      toast.error('Erro ao carregar faturas a receber.');
    } finally {
      setLoading(false);
    }
  };

  // Agrupa os débitos por cliente e ordena pelos vencimentos mais antigos
  const clientDebtsList = useMemo(() => {
    const map: Record<string, ClientDebts> = {};
    const now = new Date();

    pendingOrders.forEach(o => {
      if (!o.client?.id) return;
      const cId = o.client.id;
      const total = Number(o.total_amount || 0);
      const pendingVal = o.payment_status === 'half_paid' ? total * 0.5 : total;

      if (!map[cId]) {
        map[cId] = {
          clientId: cId,
          clientName: o.client.name,
          clientPhone: o.client.phone,
          clientCompany: o.client.company_name,
          orders: [],
          totalPending: 0,
          hasOverdue: false,
        };
      }

      map[cId].orders.push(o);
      map[cId].totalPending += pendingVal;

      // Verifica atraso
      const dueDate = o.due_date ? new Date(o.due_date) : new Date(o.created_at);
      if (dueDate < now) {
        map[cId].hasOverdue = true;
      }

      if (!map[cId].oldestDueDate || new Date(dueDate) < new Date(map[cId].oldestDueDate!)) {
        map[cId].oldestDueDate = dueDate.toISOString();
      }
    });

    let list = Object.values(map);

    // Filtro por busca
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        c => c.clientName.toLowerCase().includes(term) || (c.clientCompany && c.clientCompany.toLowerCase().includes(term))
      );
    }

    // Filtro por categoria
    if (filterType === 'overdue') {
      list = list.filter(c => c.hasOverdue);
    } else if (filterType === 'upcoming') {
      list = list.filter(c => !c.hasOverdue);
    }

    // Ordena do mais antigo para o mais recente (Maior urgência de cobrança no topo)
    return list.sort((a, b) => {
      if (a.hasOverdue && !b.hasOverdue) return -1;
      if (!a.hasOverdue && b.hasOverdue) return 1;
      return b.totalPending - a.totalPending;
    });
  }, [pendingOrders, searchTerm, filterType]);

  // Resumo Global do Hub
  const stats = useMemo(() => {
    let grandTotalPending = 0;
    let overdueCount = 0;
    let overdueTotal = 0;
    const now = new Date();

    pendingOrders.forEach(o => {
      const total = Number(o.total_amount || 0);
      const pendingVal = o.payment_status === 'half_paid' ? total * 0.5 : total;
      grandTotalPending += pendingVal;

      const dueDate = o.due_date ? new Date(o.due_date) : new Date(o.created_at);
      if (dueDate < now) {
        overdueCount++;
        overdueTotal += pendingVal;
      }
    });

    return {
      grandTotalPending,
      totalClients: clientDebtsList.length,
      overdueCount,
      overdueTotal,
    };
  }, [pendingOrders, clientDebtsList]);

  // Dispara Extrato PDF Unificado e Mensagem no WhatsApp
  const handleSendStatementWhatsApp = async (debt: ClientDebts) => {
    if (!debt.clientPhone) {
      toast.error('Cliente não possui telefone cadastrado.');
      return;
    }

    const toastId = toast.loading(`Gerando extrato e enviando cobrança para ${debt.clientName}...`);

    try {
      // 1. Abre visualizador de impressão do Extrato PDF (Sem Pontos)
      printClientStatementPDF({
        clientName: debt.clientName,
        clientPhone: debt.clientPhone,
        clientCompany: debt.clientCompany,
        orders: debt.orders.map(o => ({
          id: o.id,
          orderNumber: o.order_number || o.id.slice(0, 4),
          createdAt: o.created_at,
          dueDate: o.due_date,
          totalAmount: Number(o.total_amount || 0),
          paymentStatus: o.payment_status || 'pending',
          pendingAmount: o.payment_status === 'half_paid' ? Number(o.total_amount || 0) * 0.5 : Number(o.total_amount || 0),
        })),
        grandPending: debt.totalPending,
        companyName: settings.systemName || 'GUAÇU BORDADOS',
        companyColor: settings.primaryColor || '#8B5CF6',
        pixKey: settings.pixKey,
      });

      // 2. Monta mensagem amigável de cobrança no WhatsApp
      const ordersListText = debt.orders
        .map(o => {
          const val = o.payment_status === 'half_paid' ? Number(o.total_amount) * 0.5 : Number(o.total_amount);
          return `• Pedido #${o.order_number || o.id.slice(0, 4)}: R$ ${val.toFixed(2)} (${o.payment_status === 'half_paid' ? 'Sinal Pago 50%' : 'Pendente'})`;
        })
        .join('\n');

      const msg = `*${settings.systemName || 'GUAÇU BORDADOS'}* — Fechamento de Faturas em Aberto\n\n` +
        `Olá, *${debt.clientName}*! Segue o resumo quinzenal das suas encomendas pendentes:\n\n` +
        `${ordersListText}\n\n` +
        `💰 *Valor Total a Pagar:* R$ ${debt.totalPending.toFixed(2)}\n` +
        `${settings.pixKey ? `🔑 *Chave PIX:* ${settings.pixKey}\n` : ''}\n` +
        `Qualquer dúvida ou necessitando de ajuste na data de pagamento, por favor nos avise!`;

      const res = await sendEvolutionText(debt.clientPhone, msg);
      if (res && res.success) {
        toast.success(`✅ Extrato e cobrança enviados no WhatsApp de ${debt.clientName}!`, { id: toastId });
      } else {
        toast.info('Abrindo WhatsApp Web...', { id: toastId });
        window.open(getWhatsAppWebLink(debt.clientPhone, msg), '_blank');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao enviar cobrança.', { id: toastId });
    }
  };

  // Abre Modal de Junção e Parcelamento
  const handleOpenInstallmentsModal = (debt: ClientDebts) => {
    setSelectedClientForInstallments(debt);
    setSelectedOrderIds(debt.orders.map(o => o.id));
    setInstallmentCount(2);
    setIntervalDays(15);
    setFirstDueDate(format(addDays(new Date(), 15), 'yyyy-MM-dd'));
  };

  // Processa o Parcelamento e salva as parcelas futuras
  const handleConfirmInstallments = async () => {
    if (!selectedClientForInstallments) return;

    const selectedOrders = selectedClientForInstallments.orders.filter(o => selectedOrderIds.includes(o.id));
    if (selectedOrders.length === 0) {
      toast.error('Selecione pelo menos um pedido para agrupar e parcelar.');
      return;
    }

    const totalToParcel = selectedOrders.reduce((acc, o) => {
      const val = o.payment_status === 'half_paid' ? Number(o.total_amount) * 0.5 : Number(o.total_amount);
      return acc + val;
    }, 0);

    setSavingInstallments(true);
    const toastId = toast.loading('Gerando plano de parcelamento unificado...');

    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) throw new Error('Usuário não autenticado');

      const valPerInstallment = totalToParcel / installmentCount;
      const baseDate = parseISO(firstDueDate);

      // Cria N lançamentos futuros em financial_transactions
      for (let i = 0; i < installmentCount; i++) {
        const installmentDate = addDays(baseDate, i * intervalDays);
        const dateStr = format(installmentDate, 'yyyy-MM-dd');

        const desc = `Parcela ${i + 1}/${installmentCount} - Fechamento Acordo ${selectedClientForInstallments.clientName}`;
        
        await supabase.from('financial_transactions').insert({
          user_id: userId,
          type: 'income',
          amount: valPerInstallment,
          description: desc,
          category: 'Acordo / Parcelamento Fatura',
          payment_method: 'other',
          date: dateStr,
          due_date: dateStr,
          status: 'pending',
          notes: JSON.stringify({
            clientName: selectedClientForInstallments.clientName,
            installmentIndex: i + 1,
            totalInstallments: installmentCount,
            associatedOrders: selectedOrders.map(o => o.order_number || o.id.slice(0, 4))
          })
        });
      }

      toast.success(`🎉 ${installmentCount} parcelas de ${formatCurrency(valPerInstallment, true)} programadas com sucesso!`, { id: toastId });
      
      // Envia notificação do parcelamento no WhatsApp
      if (selectedClientForInstallments.clientPhone) {
        const msg = `*${settings.systemName || 'GUAÇU BORDADOS'}* — Acordo de Parcelamento Confirmado 📝\n\n` +
          `Olá, *${selectedClientForInstallments.clientName}*! Registramos o parcelamento das suas encomendas de total *R$ ${totalToParcel.toFixed(2)}*:\n\n` +
          `💳 *Condições:* ${installmentCount}x de *R$ ${valPerInstallment.toFixed(2)}* a cada ${intervalDays} dias.\n` +
          `📅 *Primeira Parcela:* ${format(baseDate, 'dd/MM/yyyy')}\n\n` +
          `${settings.pixKey ? `🔑 *Chave PIX:* ${settings.pixKey}\n` : ''}\n` +
          `Agradecemos pela parceria!`;

        sendEvolutionText(selectedClientForInstallments.clientPhone, msg);
      }

      setSelectedClientForInstallments(null);
      fetchPendingOrders();
    } catch (err: any) {
      console.error('Erro ao parcelar:', err);
      toast.error('Erro ao salvar parcelamento: ' + err.message, { id: toastId });
    } finally {
      setSavingInstallments(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16">
      
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-purple-950/40 via-zinc-900/60 to-black p-6 rounded-3xl border border-purple-500/20 shadow-2xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-black uppercase tracking-wider">
            <CreditCard className="h-3.5 w-3.5" /> Central de Fechamento & Cobranças
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Hub Inteligente de Cobranças
          </h1>
          <p className="text-zinc-400 text-xs max-w-xl">
            Gestão unificada de faturas em aberto, junção de pedidos por cliente, parcelamento e disparo de extratos PDF sem pontos via WhatsApp.
          </p>
        </div>

        <button
          onClick={fetchPendingOrders}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 text-xs font-bold transition-all active:scale-95 cursor-pointer shrink-0"
        >
          <RefreshCw className="h-4 w-4 text-purple-400" /> Atualizar Faturas
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total a Receber Acumulado */}
        <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-purple-400" /> Total Pendente Acumulado
          </span>
          <p className="text-2xl font-black text-purple-300">
            {formatCurrency(stats.grandTotalPending, true)}
          </p>
          <p className="text-[10px] text-zinc-400">
            Distribuídos entre {stats.totalClients} clientes
          </p>
        </div>

        {/* Faturas Vencidas */}
        <div className="p-5 rounded-3xl bg-rose-500/10 border border-rose-500/20 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Faturas Vencidas (Em Atraso)
          </span>
          <p className="text-2xl font-black text-rose-300">
            {formatCurrency(stats.overdueTotal, true)}
          </p>
          <p className="text-[10px] text-rose-400/80 font-bold">
            {stats.overdueCount} pedidos com prazo de pagamento estourado
          </p>
        </div>

        {/* Clientes com Débito */}
        <div className="p-5 rounded-3xl bg-amber-500/10 border border-amber-500/20 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" /> Clientes p/ Fechamento
          </span>
          <p className="text-2xl font-black text-amber-300">
            {stats.totalClients} Clientes
          </p>
          <p className="text-[10px] text-amber-400/80 font-bold">
            Aguardando extrato quinzenal / mensal
          </p>
        </div>
      </div>

      {/* Controles de Pesquisa e Filtro */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white/5 p-3.5 rounded-2xl border border-white/10">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome do cliente ou empresa..."
            className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterType === 'all' ? 'bg-purple-600 text-white shadow-md' : 'text-zinc-400 hover:bg-white/5'
            }`}
          >
            Todos ({clientDebtsList.length})
          </button>
          <button
            onClick={() => setFilterType('overdue')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterType === 'overdue' ? 'bg-rose-600 text-white shadow-md' : 'text-zinc-400 hover:bg-white/5'
            }`}
          >
            🚨 Vencidos
          </button>
          <button
            onClick={() => setFilterType('upcoming')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterType === 'upcoming' ? 'bg-amber-600 text-white shadow-md' : 'text-zinc-400 hover:bg-white/5'
            }`}
          >
            ⏳ A Vencer
          </button>
        </div>
      </div>

      {/* Lista de Clientes & Débitos Agrupados */}
      {loading ? (
        <div className="h-48 flex items-center justify-center text-zinc-500 text-xs font-bold">
          Carregando débitos dos clientes...
        </div>
      ) : clientDebtsList.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-white/10 rounded-3xl space-y-2">
          <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
          <h3 className="text-base font-bold text-white">Nenhum débito pendente encontrado!</h3>
          <p className="text-xs text-zinc-400">Todos os clientes estão com as contas em dia ou o filtro não retornou resultados.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {clientDebtsList.map(debt => {
            const overdueDays = debt.oldestDueDate ? differenceInDays(new Date(), new Date(debt.oldestDueDate)) : 0;

            return (
              <div
                key={debt.clientId}
                className={`p-5 rounded-3xl border transition-all space-y-4 ${
                  debt.hasOverdue
                    ? 'bg-gradient-to-r from-rose-950/30 via-zinc-900/40 to-black border-rose-500/30'
                    : 'bg-white/[0.02] hover:bg-white/[0.04] border-white/10'
                }`}
              >
                {/* Header do Cliente */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className={`h-11 w-11 rounded-2xl flex items-center justify-center font-black text-sm ${
                      debt.hasOverdue ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                    }`}>
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-black text-white">{debt.clientName}</h3>
                        {debt.clientCompany && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-zinc-300">
                            🏢 {debt.clientCompany}
                          </span>
                        )}
                        {debt.hasOverdue && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[9px] font-black uppercase tracking-wider animate-pulse">
                            ⚠️ EM ATRASO ({overdueDays} dias)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {debt.clientPhone ? `📞 WhatsApp: ${debt.clientPhone}` : 'Sem telefone cadastrado'} • {debt.orders.length} pedido(s) em aberto
                      </p>
                    </div>
                  </div>

                  {/* Valor Pendente & Ações Rápida */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">Total a Pagar</span>
                      <span className={`text-xl font-black ${debt.hasOverdue ? 'text-rose-400' : 'text-purple-300'}`}>
                        {formatCurrency(debt.totalPending, true)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSendStatementWhatsApp(debt)}
                        className="px-3.5 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                        title="Gerar Extrato PDF e enviar cobrança no WhatsApp"
                      >
                        <Send className="h-3.5 w-3.5" /> Extrato WhatsApp
                      </button>

                      <button
                        onClick={() => handleOpenInstallmentsModal(debt)}
                        className="px-3.5 py-2 rounded-xl text-xs font-black bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                        title="Agrupar pedidos e programar parcelamento quinzenal"
                      >
                        <Layers className="h-3.5 w-3.5" /> Agrupar / Parcelar
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sub-tabela de Pedidos do Cliente */}
                <div className="space-y-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                    Encomendas Pendentes deste Cliente:
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {debt.orders.map(ord => {
                      const totalVal = Number(ord.total_amount || 0);
                      const pendingVal = ord.payment_status === 'half_paid' ? totalVal * 0.5 : totalVal;

                      return (
                        <div
                          key={ord.id}
                          className="p-3 rounded-2xl bg-white/5 border border-white/5 space-y-1.5 hover:bg-white/10 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-white text-xs">
                              Pedido #{ord.order_number || ord.id.slice(0, 4)}
                            </span>
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                              ord.payment_status === 'half_paid'
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}>
                              {ord.payment_status === 'half_paid' ? 'Sinal 50%' : '100% Pendente'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] pt-1">
                            <span className="text-zinc-400">
                              Entrada: {format(new Date(ord.created_at), 'dd/MM/yyyy')}
                            </span>
                            <span className="font-black text-zinc-200">
                              {formatCurrency(pendingVal, true)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Junção de Pedidos e Parcelamento */}
      {selectedClientForInstallments && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
          <div className="relative w-full max-w-xl bg-[#0e0e17] border border-white/10 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-5 my-auto text-white">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    Junção & Parcelamento Combinado
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Cliente: <strong>{selectedClientForInstallments.clientName}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedClientForInstallments(null)}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Seleção de Pedidos para Agrupar */}
            <div className="space-y-2">
              <label className="text-xs font-extrabold uppercase tracking-wider text-zinc-300 block">
                1. Selecione as encomendas para unificar:
              </label>

              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {selectedClientForInstallments.orders.map(ord => {
                  const isChecked = selectedOrderIds.includes(ord.id);
                  const val = ord.payment_status === 'half_paid' ? Number(ord.total_amount) * 0.5 : Number(ord.total_amount);

                  return (
                    <label
                      key={ord.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-purple-500/10 border-purple-500/40 text-purple-300'
                          : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedOrderIds(prev => prev.filter(id => id !== ord.id));
                            } else {
                              setSelectedOrderIds(prev => [...prev, ord.id]);
                            }
                          }}
                          className="rounded border-white/20 text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-xs font-bold text-white">
                          Pedido #{ord.order_number || ord.id.slice(0, 4)} ({format(new Date(ord.created_at), 'dd/MM/yyyy')})
                        </span>
                      </div>
                      <span className="text-xs font-black">
                        {formatCurrency(val, true)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Configuração de Parcelas */}
            <div className="space-y-3 p-4 rounded-2xl bg-white/5 border border-white/10">
              <label className="text-xs font-extrabold uppercase tracking-wider text-zinc-300 block">
                2. Condições de Parcelamento:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                    Nº de Parcelas
                  </label>
                  <select
                    value={installmentCount}
                    onChange={(e) => setInstallmentCount(Number(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value={2} className="bg-[#111118]">2 Parcelas</option>
                    <option value={3} className="bg-[#111118]">3 Parcelas</option>
                    <option value={4} className="bg-[#111118]">4 Parcelas</option>
                    <option value={5} className="bg-[#111118]">5 Parcelas</option>
                    <option value={6} className="bg-[#111118]">6 Parcelas</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                    Intervalo (Dias)
                  </label>
                  <select
                    value={intervalDays}
                    onChange={(e) => setIntervalDays(Number(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value={15} className="bg-[#111118]">15 em 15 Dias</option>
                    <option value={30} className="bg-[#111118]">Mensal (30 Dias)</option>
                    <option value={7} className="bg-[#111118]">Semanal (7 Dias)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                    1º Vencimento
                  </label>
                  <input
                    type="date"
                    value={firstDueDate}
                    onChange={(e) => setFirstDueDate(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
            </div>

            {/* Resumo do Parcelamento */}
            {selectedOrderIds.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-between text-xs font-bold">
                <span>
                  Valor Total: {formatCurrency(selectedClientForInstallments.orders.filter(o => selectedOrderIds.includes(o.id)).reduce((acc, o) => acc + (o.payment_status === 'half_paid' ? Number(o.total_amount) * 0.5 : Number(o.total_amount)), 0), true)}
                </span>
                <span className="text-purple-300 font-black">
                  {installmentCount}x de {formatCurrency(selectedClientForInstallments.orders.filter(o => selectedOrderIds.includes(o.id)).reduce((acc, o) => acc + (o.payment_status === 'half_paid' ? Number(o.total_amount) * 0.5 : Number(o.total_amount)), 0) / installmentCount, true)}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedClientForInstallments(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingInstallments || selectedOrderIds.length === 0}
                onClick={handleConfirmInstallments}
                className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-purple-600 hover:bg-purple-500 shadow-lg shadow-purple-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                <span>{savingInstallments ? 'Salvando...' : 'Confirmar & Notificar no WhatsApp'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
