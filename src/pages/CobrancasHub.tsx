import React, { useState, useEffect, useMemo } from 'react';
import { 
  CreditCard, Search, Calendar, AlertTriangle, CheckCircle2, Clock, 
  Send, FileText, User, Building, Phone, DollarSign, Plus, ChevronRight, ChevronDown,
  Layers, ArrowUpRight, Filter, Sparkles, RefreshCw, X, ShieldAlert, Check,
  CheckSquare, Square, ShieldCheck, Loader2, Target, Eye, ExternalLink
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { printClientStatementPDF } from '@/services/pdfGenerator';
import { sendEvolutionText, getWhatsAppWebLink } from '@/services/whatsappService';
import { formatCurrency } from '@/utils/currencyFormatter';
import { format, differenceInDays, parseISO, addDays } from 'date-fns';
import { toast } from 'sonner';
import { OrderDetailsModal } from '@/components/orders/OrderDetailsModal';
import { WhatsAppBillingModal } from '@/components/billing/WhatsAppBillingModal';

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
  overdueDays: number;
  oldestDueDate?: string;
}

interface CobrancasHubProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CobrancasHub: React.FC<CobrancasHubProps> = ({ isOpen, onClose }) => {
  const { isUnlocked } = useProfile();
  const { settings } = useCompanySettings();
  const [loading, setLoading] = useState(true);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTopic, setFilterTopic] = useState<'all' | 'critical' | 'recent_overdue' | 'upcoming' | 'vip'>('all');

  // Accordion por cliente
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});

  // Modal de Detalhes do Pedido (quando o chefe clica no pedido para ver tudo)
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<any | null>(null);

  // Modal de WhatsApp com Evolution API para envio oficial de cobrança
  const [selectedClientForWhatsAppModal, setSelectedClientForWhatsAppModal] = useState<any | null>(null);

  // Multi-seleção de Clientes para Disparo em Massa
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [isMassSending, setIsMassSending] = useState(false);
  const [massSendProgress, setMassSendProgress] = useState({ current: 0, total: 0, currentName: '' });

  // Estado do Modal de Parcelamento / Junção de Pedidos
  const [selectedClientForInstallments, setSelectedClientForInstallments] = useState<ClientDebts | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [installmentCount, setInstallmentCount] = useState<number>(2);
  const [intervalDays, setIntervalDays] = useState<number>(15);
  const [firstDueDate, setFirstDueDate] = useState<string>(() => format(addDays(new Date(), 15), 'yyyy-MM-dd'));
  const [savingInstallments, setSavingInstallments] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchPendingOrders();
    }
  }, [isOpen]);

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
          client:clients (id, name, phone, company_name),
          order_items (id, description, quantity, unit_price, total_price)
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

  // Agrupa os débitos por cliente e classifica em tópicos inteligentes
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
          overdueDays: 0,
        };
      }

      map[cId].orders.push(o);
      map[cId].totalPending += pendingVal;

      const dueDate = o.due_date ? new Date(o.due_date) : new Date(o.created_at);
      if (dueDate < now) {
        map[cId].hasOverdue = true;
        const days = differenceInDays(now, dueDate);
        if (days > map[cId].overdueDays) {
          map[cId].overdueDays = days;
        }
      }

      if (!map[cId].oldestDueDate || new Date(dueDate) < new Date(map[cId].oldestDueDate!)) {
        map[cId].oldestDueDate = dueDate.toISOString();
      }
    });

    let list = Object.values(map);

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        c => c.clientName.toLowerCase().includes(term) || (c.clientCompany && c.clientCompany.toLowerCase().includes(term))
      );
    }

    if (filterTopic === 'critical') {
      list = list.filter(c => c.hasOverdue && c.overdueDays >= 30);
    } else if (filterTopic === 'recent_overdue') {
      list = list.filter(c => c.hasOverdue && c.overdueDays < 30);
    } else if (filterTopic === 'upcoming') {
      list = list.filter(c => !c.hasOverdue);
    } else if (filterTopic === 'vip') {
      list = list.filter(c => c.totalPending >= 1000);
    }

    return list.sort((a, b) => {
      if (a.hasOverdue && !b.hasOverdue) return -1;
      if (!a.hasOverdue && b.hasOverdue) return 1;
      if (b.overdueDays !== a.overdueDays) return b.overdueDays - a.overdueDays;
      return b.totalPending - a.totalPending;
    });
  }, [pendingOrders, searchTerm, filterTopic]);

  // Contagem de Clientes por Tópico
  const topicCounts = useMemo(() => {
    const map: Record<string, number> = { all: 0, critical: 0, recent_overdue: 0, upcoming: 0, vip: 0 };
    const now = new Date();

    const clientMap: Record<string, { hasOverdue: boolean; overdueDays: number; totalPending: number }> = {};
    pendingOrders.forEach(o => {
      if (!o.client?.id) return;
      const cId = o.client.id;
      const total = Number(o.total_amount || 0);
      const pendingVal = o.payment_status === 'half_paid' ? total * 0.5 : total;

      if (!clientMap[cId]) {
        clientMap[cId] = { hasOverdue: false, overdueDays: 0, totalPending: 0 };
      }
      clientMap[cId].totalPending += pendingVal;

      const dueDate = o.due_date ? new Date(o.due_date) : new Date(o.created_at);
      if (dueDate < now) {
        clientMap[cId].hasOverdue = true;
        const days = differenceInDays(now, dueDate);
        if (days > clientMap[cId].overdueDays) clientMap[cId].overdueDays = days;
      }
    });

    const clients = Object.values(clientMap);
    map.all = clients.length;
    map.critical = clients.filter(c => c.hasOverdue && c.overdueDays >= 30).length;
    map.recent_overdue = clients.filter(c => c.hasOverdue && c.overdueDays < 30).length;
    map.upcoming = clients.filter(c => !c.hasOverdue).length;
    map.vip = clients.filter(c => c.totalPending >= 1000).length;

    return map;
  }, [pendingOrders]);

  const grandTotalPendingVal = useMemo(() => {
    return clientDebtsList.reduce((acc, c) => acc + c.totalPending, 0);
  }, [clientDebtsList]);

  const toggleAccordion = (clientId: string) => {
    setExpandedClients(prev => ({
      ...prev,
      [clientId]: !prev[clientId]
    }));
  };

  const handleToggleSelectAll = () => {
    if (selectedClientIds.length === clientDebtsList.length) {
      setSelectedClientIds([]);
    } else {
      setSelectedClientIds(clientDebtsList.map(c => c.clientId));
    }
  };

  const handleToggleSelectClient = (clientId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedClientIds(prev =>
      prev.includes(clientId) ? prev.filter(id => id !== clientId) : [...prev, clientId]
    );
  };

  const handleSendStatementWhatsApp = async (debt: ClientDebts, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!debt.clientPhone) {
      toast.error('Cliente não possui telefone cadastrado.');
      return;
    }

    const toastId = toast.loading(`Gerando extrato e enviando cobrança para ${debt.clientName}...`);

    try {
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

      const ordersListText = debt.orders
        .map(o => {
          const val = o.payment_status === 'half_paid' ? Number(o.total_amount) * 0.5 : Number(o.total_amount);
          return `• Pedido #${o.order_number || o.id.slice(0, 4)}: R$ ${val.toFixed(2)} (${o.payment_status === 'half_paid' ? 'Sinal Pago 50%' : 'Pendente'})`;
        })
        .join('\n');

      const msg = `*${settings.systemName || 'GUAÇU BORDADOS'}* — Fechamento de Faturas em Aberto\n\n` +
        `Olá, *${debt.clientName}*! Segue o resumo das suas encomendas pendentes:\n\n` +
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

  const handleMassSendWhatsApp = async () => {
    const targets = clientDebtsList.filter(c => selectedClientIds.includes(c.clientId) && c.clientPhone);
    if (targets.length === 0) {
      toast.error('Selecione pelo menos 1 cliente com número de WhatsApp válido.');
      return;
    }

    setIsMassSending(true);
    setMassSendProgress({ current: 0, total: targets.length, currentName: targets[0].clientName });

    toast.info(`🚀 Disparando cobranças em massa para ${targets.length} clientes com proteção anti-ban...`, { duration: 5000 });

    for (let i = 0; i < targets.length; i++) {
      const debt = targets[i];
      setMassSendProgress({ current: i + 1, total: targets.length, currentName: debt.clientName });

      try {
        const ordersListText = debt.orders
          .map(o => `• Pedido #${o.order_number || o.id.slice(0, 4)}: R$ ${(o.payment_status === 'half_paid' ? Number(o.total_amount) * 0.5 : Number(o.total_amount)).toFixed(2)}`)
          .join('\n');

        const msg = `*${settings.systemName || 'GUAÇU BORDADOS'}* — Lembrete de Fechamento de Faturas 📋\n\n` +
          `Olá, *${debt.clientName}*! Esperamos que esteja bem.\n\n` +
          `Passando para lembrar das suas encomendas pendentes:\n${ordersListText}\n\n` +
          `💰 *Total:* R$ ${debt.totalPending.toFixed(2)}\n` +
          `${settings.pixKey ? `🔑 *Chave PIX:* ${settings.pixKey}\n` : ''}\n` +
          `Qualquer dúvida estamos à disposição!`;

        await sendEvolutionText(debt.clientPhone!, msg);
      } catch (err) {
        console.error(`Erro ao disparar para ${debt.clientName}:`, err);
      }

      if (i < targets.length - 1) {
        const randomDelay = Math.floor(Math.random() * 3000) + 4500;
        await new Promise(r => setTimeout(r, randomDelay));
      }
    }

    setIsMassSending(false);
    setSelectedClientIds([]);
    toast.success(`🎉 Disparo em massa concluído para ${targets.length} clientes!`);
  };

  const handleOpenInstallmentsModal = (debt: ClientDebts, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedClientForInstallments(debt);
    setSelectedOrderIds(debt.orders.map(o => o.id));
    setInstallmentCount(2);
    setIntervalDays(15);
    setFirstDueDate(format(addDays(new Date(), 15), 'yyyy-MM-dd'));
  };

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

      for (let i = 0; i < installmentCount; i++) {
        const installmentDate = addDays(baseDate, i * intervalDays);
        const dateStr = format(installmentDate, 'yyyy-MM-dd');

        const desc = `Parcela ${i + 1}/${installmentCount} - Acordo ${selectedClientForInstallments.clientName}`;

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-2xl animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-6xl max-h-[94vh] bg-[#0b0b13] border border-purple-500/20 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto text-white">
        
        {/* Banner do MODO DE COBRANÇA ATIVADO */}
        <div className="p-5 border-b border-purple-500/30 bg-gradient-to-r from-purple-950/80 via-zinc-900/90 to-black flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-xl shadow-purple-600/40 font-black animate-pulse shrink-0">
              <Target className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-purple-500/30 text-purple-300 border border-purple-500/40 text-[10px] font-black uppercase tracking-wider">
                  🎯 MODO DE COBRANÇA ATIVADO
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider">
                  <ShieldCheck className="h-3 w-3" /> Anti-Ban WhatsApp
                </span>
              </div>
              <h2 className="text-xl font-black text-white tracking-tight mt-0.5">
                Central Inteligente de Faturas & Parcelamento
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right hidden sm:block">
              <span className="text-[10px] font-black uppercase tracking-wider text-purple-300 block">Total a Receber Exibido</span>
              <span className="text-xl font-black text-purple-200">
                {formatCurrency(grandTotalPendingVal, true)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchPendingOrders}
                className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 text-xs font-bold transition-all cursor-pointer"
                title="Recarregar débitos"
              >
                <RefreshCw className="h-4 w-4 text-purple-400" />
              </button>
              <button
                onClick={onClose}
                className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* 🌟 Botões Filtros em Cards Maiores, Vistosos e Lado a Lado */}
        <div className="p-4 border-b border-white/10 bg-white/[0.01] space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
            
            {/* Card Filtro: Todos */}
            <button
              onClick={() => setFilterTopic('all')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                filterTopic === 'all'
                  ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-600/30 scale-[1.02]'
                  : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="h-4.5 w-4.5 shrink-0 text-purple-300" />
                <span className="text-xs font-black truncate">Todos</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-black/30 text-white shrink-0">
                {topicCounts.all}
              </span>
            </button>

            {/* Card Filtro: Críticos (+30 Dias) */}
            <button
              onClick={() => setFilterTopic('critical')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                filterTopic === 'critical'
                  ? 'bg-rose-600 border-rose-400 text-white shadow-lg shadow-rose-600/30 scale-[1.02]'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-rose-400" />
                <span className="text-xs font-black truncate">Críticos (+30d)</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-950/60 text-rose-200 border border-rose-500/30 shrink-0">
                {topicCounts.critical}
              </span>
            </button>

            {/* Card Filtro: Atrasados Recentes */}
            <button
              onClick={() => setFilterTopic('recent_overdue')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                filterTopic === 'recent_overdue'
                  ? 'bg-amber-600 border-amber-400 text-white shadow-lg shadow-amber-600/30 scale-[1.02]'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/20'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Clock className="h-4.5 w-4.5 shrink-0 text-amber-400" />
                <span className="text-xs font-black truncate">Atrasados Recentes</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-950/60 text-amber-200 border border-amber-500/30 shrink-0">
                {topicCounts.recent_overdue}
              </span>
            </button>

            {/* Card Filtro: A Vencer */}
            <button
              onClick={() => setFilterTopic('upcoming')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                filterTopic === 'upcoming'
                  ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/30 scale-[1.02]'
                  : 'bg-blue-500/10 border-blue-500/20 text-blue-300 hover:bg-blue-500/20'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Calendar className="h-4.5 w-4.5 shrink-0 text-blue-400" />
                <span className="text-xs font-black truncate">A Vencer</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-blue-950/60 text-blue-200 border border-blue-500/30 shrink-0">
                {topicCounts.upcoming}
              </span>
            </button>

            {/* Card Filtro: VIPs (+R$ 1.000) */}
            <button
              onClick={() => setFilterTopic('vip')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                filterTopic === 'vip'
                  ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-600/30 scale-[1.02]'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Sparkles className="h-4.5 w-4.5 shrink-0 text-emerald-400" />
                <span className="text-xs font-black truncate">VIPs (+R$1k)</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-950/60 text-emerald-200 border border-emerald-500/30 shrink-0">
                {topicCounts.vip}
              </span>
            </button>

          </div>

          {/* Busca & Seleção em Massa */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtrar por nome de cliente ou empresa..."
                className="w-full bg-black/50 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 text-xs font-extrabold transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              {selectedClientIds.length === clientDebtsList.length && clientDebtsList.length > 0 ? (
                <CheckSquare className="h-4 w-4 text-purple-400" />
              ) : (
                <Square className="h-4 w-4 text-zinc-400" />
              )}
              <span>Marcar Todos os Exibidos ({clientDebtsList.length})</span>
            </button>
          </div>
        </div>

        {/* Progresso de Disparo em Massa */}
        {isMassSending && (
          <div className="p-4 bg-purple-950/70 border-b border-purple-500/40 flex items-center justify-between text-xs animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 text-purple-400 animate-spin" />
              <div>
                <span className="font-black text-white">Disparando com delay humano anti-banimento...</span>
                <p className="text-[11px] text-purple-300">Enviando para: <strong>{massSendProgress.currentName}</strong> ({massSendProgress.current} de {massSendProgress.total})</p>
              </div>
            </div>
            <div className="w-48 bg-black/50 rounded-full h-2 overflow-hidden border border-purple-500/30">
              <div 
                className="bg-purple-500 h-full transition-all duration-300"
                style={{ width: `${(massSendProgress.current / massSendProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Lista Principal de Cards Accordion Interativos */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 scrollbar-thin scrollbar-thumb-white/10">
          {loading ? (
            <div className="h-64 flex items-center justify-center text-zinc-500 text-xs font-bold gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
              Carregando faturas pendentes...
            </div>
          ) : clientDebtsList.length === 0 ? (
            <div className="p-16 text-center border border-dashed border-white/10 rounded-3xl space-y-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
              <h3 className="text-lg font-black text-white">Nenhum débito pendente neste filtro!</h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                Todos os clientes desta categoria estão com os pagamentos quitados.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {clientDebtsList.map(debt => {
                const isSelected = selectedClientIds.includes(debt.clientId);
                const isExpanded = !!expandedClients[debt.clientId];

                return (
                  <div
                    key={debt.clientId}
                    className={`rounded-3xl border transition-all overflow-hidden ${
                      isSelected
                        ? 'bg-purple-950/20 border-purple-500/50 shadow-xl shadow-purple-950/30'
                        : debt.hasOverdue
                        ? 'bg-gradient-to-r from-rose-950/20 via-zinc-900/40 to-black border-rose-500/30'
                        : 'bg-white/[0.02] hover:bg-white/[0.04] border-white/10'
                    }`}
                  >
                    {/* Cabeçalho do Card Accordion */}
                    <div 
                      onClick={() => toggleAccordion(debt.clientId)}
                      className="p-4 flex items-center justify-between gap-3 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => handleToggleSelectClient(debt.clientId, e)}
                          className="p-1 text-zinc-400 hover:text-purple-400 transition-colors cursor-pointer shrink-0"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-5 w-5 text-purple-400" />
                          ) : (
                            <Square className="h-5 w-5" />
                          )}
                        </button>

                        <div className={`h-10 w-10 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 ${
                          debt.hasOverdue ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                        }`}>
                          <User className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-black text-white truncate">{debt.clientName}</h3>
                            {debt.clientCompany && (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-zinc-300">
                                🏢 {debt.clientCompany}
                              </span>
                            )}
                            {debt.hasOverdue && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[9px] font-black uppercase tracking-wider animate-pulse">
                                ⚠️ ATRASO {debt.overdueDays} DIAS
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            {debt.clientPhone ? `📞 ${debt.clientPhone}` : 'Sem WhatsApp'} • {debt.orders.length} encomendinha(s) pendente(s)
                          </p>
                        </div>
                      </div>

                      {/* Lado Direito: Total & Ações Rápida */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 block">A Pagar</span>
                          <span className={`text-base font-black ${debt.hasOverdue ? 'text-rose-400' : 'text-purple-300'}`}>
                            {formatCurrency(debt.totalPending, true)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              if (e) e.stopPropagation();
                              setSelectedClientForWhatsAppModal({
                                id: debt.clientId,
                                name: debt.clientName,
                                phone: debt.clientPhone,
                                totalAmount: debt.totalPending,
                                orderCount: debt.orders.length,
                                orders: debt.orders,
                              });
                            }}
                            className="px-3 py-1.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1 cursor-pointer"
                            title="Abrir Central de Cobrança WhatsApp (Evolution API + PDF)"
                          >
                            <Send className="h-3 w-3" /> Cobrar WhatsApp
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleOpenInstallmentsModal(debt, e)}
                            className="px-3 py-1.5 rounded-xl text-xs font-black bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/20 transition-all flex items-center gap-1 cursor-pointer"
                            title="Agrupar pedidos e parcelar"
                          >
                            <Layers className="h-3 w-3" /> Parcelar
                          </button>

                          <div className="p-1 rounded-lg text-zinc-400 hover:text-white">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Conteúdo Expandido do Accordion (Clique no Pedido abre OrderDetailsModal!) */}
                    {isExpanded && (
                      <div className="p-4 bg-black/40 border-t border-white/10 space-y-2.5 animate-in slide-in-from-top-1 duration-200">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-300">
                            Detalhamento das Encomendas de {debt.clientName}:
                          </span>
                          <span className="text-[10px] text-zinc-400 italic">
                            💡 Clique em qualquer pedido para abrir a Ficha Técnica Completa
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                          {debt.orders.map(ord => {
                            const totalVal = Number(ord.total_amount || 0);
                            const pendingVal = ord.payment_status === 'half_paid' ? totalVal * 0.5 : totalVal;

                            return (
                              <div
                                key={ord.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedOrderForDetails(ord);
                                }}
                                className="p-3.5 rounded-2xl bg-white/5 border border-white/10 hover:border-purple-500/50 hover:bg-white/10 cursor-pointer transition-all space-y-2 group shadow-sm"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-black text-white text-xs group-hover:text-purple-300 transition-colors flex items-center gap-1">
                                    Pedido #{ord.order_number || ord.id.slice(0, 4)}
                                    <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </span>
                                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                                    ord.payment_status === 'half_paid'
                                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  }`}>
                                    {ord.payment_status === 'half_paid' ? 'Sinal 50%' : 'Pendente'}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between text-[11px] pt-1">
                                  <span className="text-zinc-400">
                                    Data: {format(new Date(ord.created_at), 'dd/MM/yyyy')}
                                  </span>
                                  <span className="font-black text-purple-200">
                                    {formatCurrency(pendingVal, true)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Flutuante de Disparo em Massa Anti-Ban */}
        {selectedClientIds.length > 0 && (
          <div className="p-4 bg-gradient-to-r from-purple-950 via-zinc-900 to-black border-t border-purple-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center justify-center font-black">
                {selectedClientIds.length}
              </div>
              <div>
                <span className="text-xs font-black text-white block">
                  {selectedClientIds.length} Cliente(s) Selecionado(s) para Cobrança
                </span>
                <span className="text-[10px] text-purple-300">
                  Total Acumulado: {formatCurrency(clientDebtsList.filter(c => selectedClientIds.includes(c.clientId)).reduce((acc, c) => acc + c.totalPending, 0), true)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedClientIds([])}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors cursor-pointer"
              >
                Limpar Seleção
              </button>
              <button
                type="button"
                disabled={isMassSending}
                onClick={() => {
                  if (selectedClientIds.length === 1) {
                    const target = clientDebtsList.find(c => c.clientId === selectedClientIds[0]);
                    if (target) {
                      setSelectedClientForWhatsAppModal({
                        id: target.clientId,
                        name: target.clientName,
                        phone: target.clientPhone,
                        totalAmount: target.totalPending,
                        orderCount: target.orders.length,
                        orders: target.orders,
                      });
                    }
                  } else {
                    handleMassSendWhatsApp();
                  }
                }}
                className="px-7 py-3.5 text-sm font-black text-white bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-500 hover:brightness-110 shadow-2xl shadow-purple-600/50 rounded-2xl border border-purple-400/40 active:scale-95 transition-all flex items-center gap-2.5 cursor-pointer disabled:opacity-50"
              >
                <Send className="h-4.5 w-4.5" />
                <span>DISPARAR COBRANÇAS COM EXTRATO PDF ({selectedClientIds.length})</span>
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Modal Completo de Detalhes do Pedido (quando o chefe clica no card do pedido) */}
      {selectedOrderForDetails && (
        <OrderDetailsModal
          isOpen={!!selectedOrderForDetails}
          onClose={() => setSelectedOrderForDetails(null)}
          order={selectedOrderForDetails}
          onOrderUpdated={fetchPendingOrders}
        />
      )}

      {/* Modal de Cobrança Oficial via WhatsApp (Evolution API + PDF) */}
      {selectedClientForWhatsAppModal && (
        <WhatsAppBillingModal
          isOpen={!!selectedClientForWhatsAppModal}
          onClose={() => setSelectedClientForWhatsAppModal(null)}
          clientData={selectedClientForWhatsAppModal}
        />
      )}

      {/* Modal de Junção e Parcelamento Combinado */}
      {selectedClientForInstallments && (
        <div className="fixed inset-0 z-[9999999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
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
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors cursor-pointer"
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
