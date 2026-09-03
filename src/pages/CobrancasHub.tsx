import React, { useState, useEffect, useMemo } from 'react';
import { parseLocalDate, toLocalDateInput } from '@/utils/dateHelper';
import { 
  CreditCard, Search, Calendar, AlertTriangle, CheckCircle2, Clock, 
  Send, FileText, User, Building, Phone, DollarSign, Plus, ChevronRight, ChevronDown,
  Layers, ArrowUpRight, Filter, Sparkles, RefreshCw, X, ShieldAlert, Check,
  CheckSquare, Square, ShieldCheck, Loader2, Target, Eye, ExternalLink,
  Package, Trophy, History, TrendingUp, Zap, Flame, Award, Activity, Trash2,
  CalendarClock
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { printClientStatementPDF } from '@/services/pdfGenerator';
import { sendEvolutionText } from '@/services/whatsappService';
import { groupIntoAgreements, Agreement } from '@/services/installmentService';
import { AgreementsPanel } from '@/components/billing/AgreementsPanel';
import { AgreementDetailsModal } from '@/components/billing/AgreementDetailsModal';
import { ChefeOverviewPanel } from '@/components/billing/ChefeOverviewPanel';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { parsePaymentMetadata } from '@/utils/paymentHelper';
import { formatCurrency } from '@/utils/currencyFormatter';
import { format, differenceInDays, parseISO, addDays } from 'date-fns';
import { toast } from 'sonner';
import { OrderDetailsModal } from '@/components/orders/OrderDetailsModal';
import { CollectionActionModal } from '@/components/orders/CollectionActionModal';
import { CreateInstallmentAgreementModal } from '@/components/billing/CreateInstallmentAgreementModal';
import { PaymentStatusModal, calculateOrderPendingVal, calculateOrderExactValue } from '@/components/orders/PaymentStatusModal';
import { WebGLDustTransition } from '@/components/effects/WebGLDustTransition';

interface PendingItem {
  id: string;
  order_number?: number;
  client_id?: string;
  total_amount: number;
  payment_status: 'pending' | 'half_paid' | 'in_agreement' | string;
  created_at: string;
  due_date?: string;
  notes?: string;
  description?: string;
  isManualTx?: boolean;
  isAgreementParcel?: boolean;
  order_items?: any[];
  items?: any[];
  rawTx?: any;
  metadata?: any;
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
  orders: PendingItem[];
  manualTxs: PendingItem[];
  totalPending: number;
  hasOverdue: boolean;
  overdueDays: number;
  oldestDueDate?: string;
}

interface RecentPaidOrder {
  id: string;
  order_number?: number;
  total_amount: number;
  updated_at: string;
  payment_status: string;
  payment_method?: string;
  client?: {
    name: string;
    company_name?: string;
  };
}

interface CobrancasHubProps {
  /** Omitido quando o hub é usado como PÁGINA (rota /cobrancas): fica sempre aberto. */
  isOpen?: boolean;
  onClose?: () => void;
}

export const CobrancasHub: React.FC<CobrancasHubProps> = ({ isOpen, onClose }) => {
  // Como página não existe prop isOpen; nesse caso o hub está sempre visível.
  const modoPagina = isOpen === undefined;
  const aberto = modoPagina ? true : !!isOpen;
  const fechar = onClose ?? (() => {});
  const { isUnlocked } = useProfile();
  const { settings } = useCompanySettings();
  const [loading, setLoading] = useState(true);
  const [pendingOrders, setPendingOrders] = useState<PendingItem[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<any[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [vista, setVista] = useState<'chefe' | 'faturas' | 'parcelas'>('chefe');
  const [acordoAberto, setAcordoAberto] = useState<Agreement | null>(null);
  const [recentPaidOrders, setRecentPaidOrders] = useState<RecentPaidOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTopic, setFilterTopic] = useState<'all' | 'critical' | 'recent_overdue' | 'upcoming' | 'vip'>('all');

  // Accordion por cliente
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});

  // Modais
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<any | null>(null);
  const [selectedClientForWhatsAppModal, setSelectedClientForWhatsAppModal] = useState<any | null>(null);
  const [selectedOrderForCollectionModal, setSelectedOrderForCollectionModal] = useState<any | null>(null);
  const [selectedOrderForPaymentModal, setSelectedOrderForPaymentModal] = useState<any | null>(null);
  const [selectedClientOrdersForPaymentModal, setSelectedClientOrdersForPaymentModal] = useState<any[] | null>(null);
  const [txToDelete, setTxToDelete] = useState<any | null>(null);
  const [optimisticSettledTxIds, setOptimisticSettledTxIds] = useState<Set<string>>(new Set());

  // Multi-seleção de Clientes para Disparo em Massa
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [isMassSending, setIsMassSending] = useState(false);
  const [massSendProgress, setMassSendProgress] = useState({ current: 0, total: 0, currentName: '' });
  const [massSendReport, setMassSendReport] = useState<{ success: number; failures: { name: string; phone: string; reason: string }[] } | null>(null);

  // Estado do Modal de Parcelamento / Junção de Pedidos
  const [selectedClientForInstallments, setSelectedClientForInstallments] = useState<ClientDebts | null>(null);

  useEffect(() => {
    if (aberto) {
      fetchPendingData();
      fetchAgreements();
      fetchRecentPaidOrders();
    }

    const handleOrdersChanged = () => {
      fetchPendingData();
      fetchAgreements();
      fetchRecentPaidOrders();
    };

    window.addEventListener('borda_orders_changed', handleOrdersChanged);
    return () => {
      window.removeEventListener('borda_orders_changed', handleOrdersChanged);
    };
  }, [aberto]);

  const handleCloseHub = () => {
    fechar();
  };

  // Suporte a Tecla ESC inteligente para fechar o modo de cobrança
  useEffect(() => {
    if (!aberto) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedOrderForDetails) {
          setSelectedOrderForDetails(null);
          return;
        }
        if (selectedClientForWhatsAppModal) {
          setSelectedClientForWhatsAppModal(null);
          return;
        }
        if (selectedOrderForCollectionModal) {
          setSelectedOrderForCollectionModal(null);
          return;
        }
        if (selectedOrderForPaymentModal || selectedClientOrdersForPaymentModal) {
          setSelectedOrderForPaymentModal(null);
          setSelectedClientOrdersForPaymentModal(null);
          return;
        }
        if (selectedClientForInstallments) {
          setSelectedClientForInstallments(null);
          return;
        }
        handleCloseHub();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    aberto,
    fechar,
    selectedOrderForDetails,
    selectedClientForWhatsAppModal,
    selectedOrderForCollectionModal,
    selectedOrderForPaymentModal,
    selectedClientOrdersForPaymentModal,
    selectedClientForInstallments
  ]);

  // Carrega tanto Encomendas quanto Entradas Manuais/Acordos (Tudo a receber em um só lugar!)
  const fetchPendingData = async () => {
    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) return;

      const [ordersRes, txsRes] = await Promise.all([
        supabase
          .from('orders')
          .select(`
            id, order_number, client_id, total_amount, payment_status, created_at, due_date, notes,
            client:clients (id, name, phone, company_name),
            order_items (id, description, quantity, unit_price, total_price)
          `)
          .eq('user_id', userId)
          .or('payment_status.neq.paid,payment_status.is.null')
          .order('created_at', { ascending: true }),

        supabase
          .from('financial_transactions')
          .select('*')
          .eq('user_id', userId)
          .eq('type', 'income')
          .eq('status', 'pending')
          .order('due_date', { ascending: true })
      ]);

      if (ordersRes.error) throw ordersRes.error;

      // Pedido já coberto por acordo de parcelamento não entra avulso aqui: quem
      // representa a dívida passa a ser a parcela do acordo.
      const semDuplicidade = ((ordersRes.data as any) || []).filter((o: any) => {
        if (o.payment_status === 'paid') return false;
        if (o.payment_status === 'in_agreement') return false;
        return !parsePaymentMetadata(o.notes).metadata.agreementId;
      });

      // Filtra transações pendentes excluindo qualquer uma que já tenha sido quitada
      const txs = ((txsRes.data as any) || []).filter((t: any) => {
        if (t.status && t.status !== 'pending') return false;
        if (t.notes && typeof t.notes === 'string') {
          try {
            const meta = JSON.parse(t.notes);
            if (meta.paidAt) return false;
          } catch (e) {}
        }
        return true;
      });

      setPendingOrders(semDuplicidade);
      setPendingTransactions(txs);
    } catch (err) {
      console.error('Erro ao carregar débitos e faturas:', err);
      toast.error('Erro ao carregar faturas a receber.');
    } finally {
      setLoading(false);
    }
  };

  /** Carrega os acordos de parcelamento e os agrupa por identidade. */
  const fetchAgreements = async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) return;

      const { data: txs, error } = await supabase
        .from('financial_transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'income')
        .order('due_date', { ascending: true });

      if (error) throw error;

      // Agrupa todas as transações de parcelas em acordos legíveis
      const agrupados = groupIntoAgreements(txs || []);
      setAgreements(agrupados);
    } catch (err) {
      console.error('Erro ao carregar acordos:', err);
    }
  };

  const fetchRecentPaidOrders = async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) return;

      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, order_number, total_amount, updated_at, payment_status, payment_method,
          client:clients (name, company_name)
        `)
        .eq('user_id', userId)
        .eq('payment_status', 'paid')
        .order('updated_at', { ascending: false })
        .limit(5);

      if (!error && data) {
        setRecentPaidOrders(data as any);
      }
    } catch (err) {
      console.warn('Erro ao carregar últimos pagamentos:', err);
    }
  };

  // Quitar Lançamento Manual / Parcela de Acordo com 1 clique
  const handleMarkManualTxPaid = async (txId: string) => {
    // 0ms Latência Otimista: esconde visualmente a parcela quitada na hora!
    setOptimisticSettledTxIds(prev => new Set(prev).add(txId));
    try {
      const { error } = await supabase
        .from('financial_transactions')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', txId);

      if (error) throw error;
      toast.success('Lançamento a receber quitado e registrado no caixa!');
      window.dispatchEvent(new CustomEvent('borda_orders_changed'));
      fetchPendingData();
      fetchRecentPaidOrders();
    } catch (err: any) {
      console.error('Erro ao quitar lançamento manual:', err);
      setOptimisticSettledTxIds(prev => {
        const next = new Set(prev);
        next.delete(txId);
        return next;
      });
      toast.error('Erro ao quitar lançamento: ' + (err.message || ''));
    }
  };

  // Agrupa os débitos por cliente (Encomendas + Entradas Manuais + Acordos)
  const { clientDebtsList, rawMap } = useMemo(() => {
    const map: Record<string, ClientDebts> = {};
    const now = new Date();

    // 1. Processa Encomendas (Orders)
    pendingOrders.forEach(o => {
      if (o.payment_status === 'paid') return;
      const isInAgreement = o.payment_status === 'in_agreement' || (o.notes && o.notes.includes('[ACORDO_ATIVO')) || Boolean(parsePaymentMetadata(o.notes).metadata.agreementId);
      if (isInAgreement) return; // Débito coberto por acordo é gerenciado pelas parcelas

      const pendingVal = calculateOrderPendingVal(o as any);

      const cId = o.client?.id || (o.notes && o.notes.includes('client_') ? o.notes : `order_client_${o.id}`);
      const cName = o.client?.name || 'Cliente Geral';
      const cPhone = o.client?.phone || '';
      const cCompany = o.client?.company_name || '';

      if (!map[cId]) {
        map[cId] = {
          clientId: cId,
          clientName: cName,
          clientPhone: cPhone,
          clientCompany: cCompany,
          orders: [],
          manualTxs: [],
          totalPending: 0,
          hasOverdue: false,
          overdueDays: 0,
        };
      }

      map[cId].orders.push({
        ...o,
        isManualTx: false,
      });
      map[cId].totalPending += pendingVal;

      const dueDate = parseLocalDate(o.due_date) || new Date(o.created_at);
      if (dueDate < now) {
        map[cId].hasOverdue = true;
        const days = differenceInDays(now, dueDate);
        if (days > map[cId].overdueDays) {
          map[cId].overdueDays = days;
        }
      }

      if (!map[cId].oldestDueDate || dueDate < (parseLocalDate(map[cId].oldestDueDate) || new Date(8640000000000000))) {
        map[cId].oldestDueDate = dueDate.toISOString();
      }
    });

    // 2. Processa Lançamentos Manuais / Parcelas de Acordo (financial_transactions)
    pendingTransactions.forEach(t => {
      if (t.status && t.status !== 'pending') return;
      if (optimisticSettledTxIds.has(t.id)) return;
      const amountVal = Number(t.amount || 0);
      if (amountVal <= 0) return;

      let metadata: any = {};
      try {
        if (t.notes && t.notes.startsWith('{')) {
          metadata = JSON.parse(t.notes);
        }
      } catch (e) {}

      const clientName = metadata.clientName || t.description || 'Entrada Futura';
      const clientPhone = metadata.clientPhone || '';
      const isAgreement = t.category === 'Parcela de Acordo' || Boolean(metadata.associatedOrders);

      // Vincula ao cliente correspondente por Telefone ou Nome
      let targetKey: string | null = null;
      for (const key of Object.keys(map)) {
        const c = map[key];
        if (clientPhone && c.clientPhone && clientPhone.replace(/\D/g, '') === c.clientPhone.replace(/\D/g, '')) {
          targetKey = key;
          break;
        }
        if (c.clientName.trim().toLowerCase() === clientName.trim().toLowerCase()) {
          targetKey = key;
          break;
        }
      }

      if (!targetKey) {
        targetKey = `tx_client_${t.id}`;
        map[targetKey] = {
          clientId: targetKey,
          clientName: clientName,
          clientPhone: clientPhone,
          orders: [],
          manualTxs: [],
          totalPending: 0,
          hasOverdue: false,
          overdueDays: 0,
        };
      }

      const dueDate = parseLocalDate(t.due_date) || parseLocalDate(t.date) || new Date(t.created_at);

      map[targetKey].manualTxs.push({
        id: t.id,
        isManualTx: true,
        isAgreementParcel: isAgreement,
        description: t.description,
        total_amount: amountVal,
        payment_status: 'pending',
        created_at: t.date || t.created_at,
        due_date: t.due_date || t.date,
        rawTx: t,
        metadata
      });
      map[targetKey].totalPending += amountVal;

      if (dueDate < now) {
        map[targetKey].hasOverdue = true;
        const days = differenceInDays(now, dueDate);
        if (days > map[targetKey].overdueDays) {
          map[targetKey].overdueDays = days;
        }
      }

      if (!map[targetKey].oldestDueDate || new Date(dueDate) < new Date(map[targetKey].oldestDueDate!)) {
        map[targetKey].oldestDueDate = dueDate.toISOString();
      }
    });

    let list = Object.values(map).filter(c => c.orders.length > 0 || c.manualTxs.length > 0);

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

    // Ordenação estrita por data do débito mais antigo (sequência cronológica: da mais antiga para a mais recente)
    const sorted = list.sort((a, b) => {
      const dateA = a.oldestDueDate ? new Date(a.oldestDueDate).getTime() : 9999999999999;
      const dateB = b.oldestDueDate ? new Date(b.oldestDueDate).getTime() : 9999999999999;
      return dateA - dateB;
    });

    return { clientDebtsList: sorted, rawMap: map };
  }, [pendingOrders, pendingTransactions, searchTerm, filterTopic]);

  // Contagem por Tópicos Inteligentes
  const topicCounts = useMemo(() => {
    const map: Record<string, number> = { all: 0, critical: 0, recent_overdue: 0, upcoming: 0, vip: 0 };
    const allDebts = Object.values(rawMap);
    map.all = allDebts.length;
    map.critical = allDebts.filter(c => c.hasOverdue && c.overdueDays >= 30).length;
    map.recent_overdue = allDebts.filter(c => c.hasOverdue && c.overdueDays < 30).length;
    map.upcoming = allDebts.filter(c => !c.hasOverdue).length;
    map.vip = allDebts.filter(c => c.totalPending >= 1000).length;

    return map;
  }, [rawMap]);

  // Top 3 Clientes em Débito para o Widget Satélite Flutuante
  const topDebtors = useMemo(() => {
    return [...clientDebtsList].sort((a, b) => b.totalPending - a.totalPending).slice(0, 3);
  }, [clientDebtsList]);

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

  const handleMassSendWhatsApp = async () => {
    const targets = clientDebtsList.filter(c => selectedClientIds.includes(c.clientId) && c.clientPhone);
    if (targets.length === 0) {
      toast.error('Selecione pelo menos 1 cliente com número de WhatsApp válido.');
      return;
    }

    setIsMassSending(true);
    setMassSendReport(null);
    setMassSendProgress({ current: 0, total: targets.length, currentName: targets[0].clientName });

    toast.info(`🚀 Disparando cobranças em massa para ${targets.length} clientes com proteção anti-ban...`, { duration: 4000 });

    let successCount = 0;
    const failures: { name: string; phone: string; reason: string }[] = [];

    for (let i = 0; i < targets.length; i++) {
      const debt = targets[i];
      setMassSendProgress({ current: i + 1, total: targets.length, currentName: debt.clientName });

      try {
        const ordersListText = debt.orders
          .map(o => `• Pedido #${o.order_number || o.id.slice(0, 4)}: R$ ${(o.payment_status === 'half_paid' ? Number(o.total_amount) * 0.5 : Number(o.total_amount)).toFixed(2)}`)
          .concat(debt.manualTxs.map(t => `• ${t.description}: R$ ${t.total_amount.toFixed(2)}`))
          .join('\n');

        const msg = `*${settings.systemName || 'GUAÇU BORDADOS'}* — Lembrete de Fechamento de Faturas 📋\n\n` +
          `Olá, *${debt.clientName}*! Esperamos que esteja bem.\n\n` +
          `Passando para lembrar das suas faturas/encomendas pendentes:\n${ordersListText}\n\n` +
          `💰 *Total:* R$ ${debt.totalPending.toFixed(2)}\n` +
          `${settings.pixKey ? `🔑 *Chave PIX:* ${settings.pixKey}\n` : ''}\n` +
          `Qualquer dúvida estamos à disposição!`;

        await sendEvolutionText(debt.clientPhone!, msg);
        successCount++;
      } catch (err: any) {
        console.error(`Erro ao disparar para ${debt.clientName}:`, err);
        const reason = err?.message || 'Falha na conexão com o WhatsApp';
        failures.push({
          name: debt.clientName,
          phone: debt.clientPhone || 'Sem número',
          reason: reason
        });
      }

      if (i < targets.length - 1) {
        const randomDelay = Math.floor(Math.random() * 3000) + 4500;
        await new Promise(r => setTimeout(r, randomDelay));
      }
    }

    setIsMassSending(false);
    setSelectedClientIds([]);

    if (failures.length === 0) {
      toast.success(`🎉 Disparo em massa concluído com sucesso para ${successCount} cliente(s)!`);
    } else {
      setMassSendReport({ success: successCount, failures });
      toast.warning(`⚠️ Disparo finalizado: ${successCount} enviado(s), ${failures.length} falha(s).`);
    }
  };

  const handleOpenInstallmentsModal = (debt: ClientDebts, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedClientForInstallments(debt);
  };

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 dark:bg-black/95 backdrop-blur-md overflow-y-auto">
        
        {/* Botão Flutuante de Fechar Inteligente [X] (Visível no Mobile e Desktop + Tecla ESC) */}
        <button
          type="button"
          onClick={handleCloseHub}
          className="fixed top-4 right-4 sm:top-6 sm:right-6 z-[9999999] h-12 w-12 rounded-2xl bg-white/90 hover:bg-rose-600 dark:bg-zinc-900/90 dark:hover:bg-rose-600/90 text-slate-800 hover:text-white dark:text-white border border-slate-300 hover:border-rose-400 dark:border-white/20 dark:hover:border-rose-400/50 shadow-2xl backdrop-blur-xl flex items-center justify-center transition-all cursor-pointer group active:scale-95"
          title="Fechar Modo Cobrança (Atalho: Tecla ESC)"
        >
          <X className="h-6 w-6 group-hover:rotate-90 transition-transform duration-300" />
        </button>
      
      {/* 🏆 WIDGET SATÉLITE ESQUERDA: FLUTUANTE NOS CANTOS DA TELA (Desktop) */}
      <div className="hidden xl:flex flex-col gap-4 fixed left-6 top-8 bottom-8 w-80 z-20 pointer-events-auto overflow-y-auto pr-1">
        
        {/* Card 0: Vitória Financeira - Caixa Recuperado de Cobranças (Visão Patrão) */}
        <div className="p-5 rounded-3xl bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 dark:from-emerald-950/60 dark:via-zinc-900/80 dark:to-black backdrop-blur-2xl border border-emerald-300 dark:border-emerald-500/40 shadow-2xl space-y-2.5 hover:border-emerald-500/60 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" /> Caixa Recuperado (Cobranças)
            </span>
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30">
              📈 Entradas
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {formatCurrency(recentPaidOrders.reduce((acc, o) => acc + Number(o.total_amount || 0), 0), true)}
          </div>
          <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed">
            Total de valores pendentes quitados recentemente que já entraram na sua DRE.
          </p>
        </div>

        {/* Card 1: Top Débitos Ativos (Visão Executiva) */}
        <div className="p-5 rounded-3xl bg-white/95 dark:bg-zinc-950/90 backdrop-blur-2xl border border-slate-200 dark:border-white/10 shadow-2xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-purple-700 dark:text-purple-400 flex items-center gap-1.5">
              <Flame className="h-4 w-4 text-amber-500 animate-pulse" /> Maiores Saldos Devedores
            </span>
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-purple-500/15 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30">
              TOP 3
            </span>
          </div>

          <div className="space-y-2.5">
            {topDebtors.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-zinc-500 text-center py-4">Nenhum cliente em aberto 🎉</p>
            ) : (
              topDebtors.map((debt, idx) => (
                <div 
                  key={debt.clientId}
                  onClick={() => setSelectedClientForWhatsAppModal({
                    id: debt.clientId,
                    name: debt.clientName,
                    phone: debt.clientPhone,
                    totalAmount: debt.totalPending,
                    orderCount: debt.orders.length + debt.manualTxs.length,
                    orders: [...debt.orders, ...debt.manualTxs]
                  })}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] hover:bg-purple-50 dark:hover:bg-purple-950/30 border border-slate-200 dark:border-white/5 hover:border-purple-400 dark:hover:border-purple-500/40 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800 dark:text-white group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors truncate max-w-[140px]">
                      {idx + 1}. {debt.clientName}
                    </span>
                    <span className="text-xs font-black text-purple-700 dark:text-purple-300">
                      {formatCurrency(debt.totalPending, true)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400 mt-1">
                    <span>{debt.orders.length} enc. • {debt.manualTxs.length} avulsos</span>
                    {debt.hasOverdue && (
                      <span className="text-rose-600 dark:text-rose-400 font-bold">Atraso {debt.overdueDays}d</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Card 2: Status Gabi AI & Notificações Automáticas */}
        <div className="p-5 rounded-3xl bg-white/95 dark:bg-zinc-950/90 backdrop-blur-2xl border border-slate-200 dark:border-white/10 shadow-2xl space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-purple-500/20 border border-purple-300 dark:border-purple-500/30 flex items-center justify-center text-purple-700 dark:text-purple-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900 dark:text-white">Gabi AI — Autocobrança</h4>
              <p className="text-[10px] text-slate-500 dark:text-zinc-400">Lembretes inteligentes de faturas</p>
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500 dark:text-zinc-400">Motor de Disparo:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" /> Ativo
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500 dark:text-zinc-400">Proteção Anti-Ban:</span>
              <span className="font-bold text-purple-700 dark:text-purple-300">Delay 4.5s - 7.5s</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500 dark:text-zinc-400">Extrato em PDF:</span>
              <span className="font-bold text-blue-600 dark:text-blue-400">Automático</span>
            </div>
          </div>
        </div>

      </div>

      {/* 🏆 WIDGET SATÉLITE DIREITA: ÚLTIMAS BAIXAS REALIZADAS (Desktop) */}
      <div className="hidden xl:flex flex-col gap-4 fixed right-6 top-8 bottom-8 w-80 z-20 pointer-events-auto overflow-y-auto pl-1">
        
        {/* Card: Histórico ao Vivo de Baixas / Recebimentos */}
        <div className="p-5 rounded-3xl bg-white/95 dark:bg-zinc-950/90 backdrop-blur-2xl border border-slate-200 dark:border-white/10 shadow-2xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <History className="h-4 w-4" /> Feed de Baixas Recentes
            </span>
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30">
              AO VIVO
            </span>
          </div>

          <div className="space-y-2.5">
            {recentPaidOrders.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-zinc-500 text-center py-6">Nenhuma baixa recente registrada.</p>
            ) : (
              recentPaidOrders.map(ord => (
                <div key={ord.id} className="p-3 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/30 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-black text-slate-800 dark:text-white truncate max-w-[130px]">
                      {ord.client?.name || 'Cliente Geral'}
                    </span>
                    <span className="font-black text-emerald-700 dark:text-emerald-400">
                      +{formatCurrency(ord.total_amount, true)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400">
                    <span>Pedido #{ord.order_number || ord.id.slice(0, 4)}</span>
                    <span>{ord.payment_method || 'Quitado'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* PAINEL CENTRAL FLUTUANTE (Modo Cinema de Alta Densidade) */}
      <div className="relative w-full max-w-4xl bg-white dark:bg-[#0a0a12] border border-purple-300 dark:border-purple-500/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] my-auto text-slate-900 dark:text-white transition-all">
        
        {/* Header Hero com Gradiente Executivo */}
        <div className="p-6 border-b border-slate-200 dark:border-white/10 bg-gradient-to-r from-purple-100 via-white to-slate-50 dark:from-purple-950/80 dark:via-zinc-900/90 dark:to-black flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-600/40 font-black">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-500/30 text-[10px] font-black uppercase tracking-wider">
                  ⚡ MODO DE COBRANÇA ATIVADO
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> Anti-Ban WhatsApp
                </span>
              </div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
                Central Unificada de Cobrança & Faturas
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <div className="text-right">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 block">Total a Receber</span>
              <span className="text-xl font-black text-purple-700 dark:text-purple-300">
                {formatCurrency(grandTotalPendingVal, true)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                fetchPendingData();
                fetchRecentPaidOrders();
              }}
              className="p-2.5 rounded-2xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-white/10 transition-colors cursor-pointer"
              title="Atualizar Dados em Tempo Real"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-purple-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Alternador: visão do chefe / faturas avulsas / acordos parcelados */}
        <div className="px-4 sm:px-6 pt-4 flex gap-2">
          <button
            onClick={() => setVista('chefe')}
            className={`flex-1 px-3 py-2.5 rounded-2xl text-[11px] sm:text-xs font-black uppercase tracking-wide border transition-all ${
              vista === 'chefe'
                ? 'bg-amber-600 border-amber-400 text-white shadow-lg shadow-amber-600/30'
                : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Visão do chefe
          </button>
          <button
            onClick={() => setVista('faturas')}
            className={`flex-1 px-3 py-2.5 rounded-2xl text-[11px] sm:text-xs font-black uppercase tracking-wide border transition-all ${
              vista === 'faturas'
                ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-600/30'
                : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Faturas
          </button>
          <button
            onClick={() => setVista('parcelas')}
            className={`flex-1 px-3 py-2.5 rounded-2xl text-[11px] sm:text-xs font-black uppercase tracking-wide border transition-all flex items-center justify-center gap-1.5 ${
              vista === 'parcelas'
                ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Parcelas
            {agreements.filter(a => !a.isSettled).length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-black/25 text-white">
                {agreements.filter(a => !a.isSettled).length}
              </span>
            )}
          </button>
        </div>

        {/* Filtros Inteligentes por Tópico */}
        <div className={`px-6 py-3 bg-slate-50 dark:bg-black/40 border-b border-slate-200 dark:border-white/5 items-center gap-2 overflow-x-auto custom-scrollbar ${vista === 'faturas' ? 'flex' : 'hidden'}`}>
          {[
            { id: 'all', label: 'Todos', count: topicCounts.all, icon: Package, color: 'purple' },
            { id: 'critical', label: 'Críticos (30d+)', count: topicCounts.critical, icon: AlertTriangle, color: 'rose' },
            { id: 'recent_overdue', label: 'Atrasados', count: topicCounts.recent_overdue, icon: Clock, color: 'amber' },
            { id: 'upcoming', label: 'A Vencer', count: topicCounts.upcoming, icon: Calendar, color: 'blue' },
            { id: 'vip', label: 'Grandes Contas (R$ 1k+)', count: topicCounts.vip, icon: Sparkles, color: 'emerald' },
          ].map(tab => {
            const isActive = filterTopic === tab.id;
            const Icon = tab.icon;


            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTopic(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                    : 'bg-white dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-zinc-300'
                }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Barra de Busca & Ação de Marcar Todos */}
        <div className="p-4 bg-white dark:bg-black/20 border-b border-slate-200 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-zinc-500" />
            <input
              type="text"
              placeholder="Filtrar por cliente, empresa..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-zinc-300 hover:text-purple-700 dark:hover:text-purple-400 transition-colors cursor-pointer"
            >
              {selectedClientIds.length === clientDebtsList.length && clientDebtsList.length > 0 ? (
                <CheckSquare className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              <span>Marcar Todos ({clientDebtsList.length})</span>
            </button>
          </div>
        </div>

        {/* Barra de Progresso do Disparo em Massa */}
        {isMassSending && (
          <div className="p-4 bg-purple-50 dark:bg-purple-950/40 border-b border-purple-200 dark:border-purple-500/30 flex items-center justify-between gap-4 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 text-purple-600 animate-spin" />
              <div>
                <span className="text-xs font-black text-purple-900 dark:text-purple-200 block">
                  Disparando Cobrança: {massSendProgress.currentName} ({massSendProgress.current}/{massSendProgress.total})
                </span>
                <span className="text-[10px] text-purple-700 dark:text-purple-400">
                  Delay de segurança anti-ban ativo entre envios...
                </span>
              </div>
            </div>
            <div className="w-48 bg-slate-200 dark:bg-black/50 rounded-full h-2 overflow-hidden border border-purple-300 dark:border-purple-500/30">
              <div 
                className="bg-purple-600 h-full transition-all duration-300"
                style={{ width: `${(massSendProgress.current / massSendProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Lista de Clientes */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-white/10">
          {vista === 'chefe' ? (
            <ErrorBoundary area="Visão do Chefe">
            <ChefeOverviewPanel
              debtors={clientDebtsList as any}
              agreements={agreements}
              recentPaidTotal={recentPaidOrders.reduce((acc, o) => acc + Number(o.total_amount || 0), 0)}
              recentPaidCount={recentPaidOrders.length}
              canSeeFinancials={isUnlocked}
              onOpenAgreement={setAcordoAberto}
              onOpenDebtor={(d) => {
                setVista('faturas');
                setSearchTerm(d.clientName);
              }}
            />
            </ErrorBoundary>
          ) : vista === 'parcelas' ? (
            <ErrorBoundary area="Parcelas e Acordos">
              <AgreementsPanel
                agreements={agreements}
                canSeeFinancials={isUnlocked}
                onOpenAgreement={setAcordoAberto}
              />
            </ErrorBoundary>
          ) : loading ? (
            <div className="h-64 flex items-center justify-center text-slate-500 dark:text-zinc-500 text-xs font-bold gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-purple-600 dark:text-purple-400" />
              Carregando faturas e débitos a receber...
            </div>
          ) : clientDebtsList.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-slate-200 dark:border-white/10 rounded-3xl space-y-3">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 dark:text-emerald-400 mx-auto" />
              <h3 className="text-base font-black text-slate-900 dark:text-white">Nenhum débito pendente neste filtro!</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-xs mx-auto">
                Todos os clientes desta categoria estão com os pagamentos quitados.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {clientDebtsList.map(debt => {
                const isSelected = selectedClientIds.includes(debt.clientId);
                const isExpanded = !!expandedClients[debt.clientId];
                const totalItemsCount = debt.orders.length + debt.manualTxs.length;

                return (
                  <div
                    key={debt.clientId}
                    className={`rounded-3xl border transition-all overflow-hidden ${
                      isSelected
                        ? 'bg-purple-50 dark:bg-purple-950/30 border-purple-400 dark:border-purple-500/60 shadow-xl'
                        : debt.hasOverdue
                        ? 'bg-rose-50/70 hover:bg-rose-100/80 dark:bg-black dark:hover:bg-black/90 border-rose-200 dark:border-rose-500/40 hover:dark:border-rose-500/70'
                        : 'bg-slate-50/90 hover:bg-slate-100/90 dark:bg-black dark:hover:bg-black/90 border-slate-200 dark:border-white/10 hover:dark:border-white/20'
                    }`}
                  >
                    {/* Header do Card do Cliente */}
                    <div 
                      onClick={() => toggleAccordion(debt.clientId)}
                      className="p-4 flex items-center justify-between gap-3 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => handleToggleSelectClient(debt.clientId, e)}
                          className="p-1 text-slate-400 hover:text-purple-600 dark:text-zinc-400 dark:hover:text-purple-400 transition-colors cursor-pointer shrink-0"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                          ) : (
                            <Square className="h-5 w-5" />
                          )}
                        </button>

                        <div className={`h-10 w-10 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 ${
                          debt.hasOverdue ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30' : 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30'
                        }`}>
                          <User className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-black text-slate-900 dark:text-white truncate">{debt.clientName}</h3>
                            {debt.clientCompany && (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-zinc-300 border border-slate-300 dark:border-white/10">
                                🏢 {debt.clientCompany}
                              </span>
                            )}
                            <span className="px-3 py-0.5 rounded-full bg-purple-500/15 dark:bg-purple-500/20 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-500/40 text-[11px] font-black flex items-center gap-1.5 shrink-0 shadow-sm">
                              <Package className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                              {totalItemsCount} {totalItemsCount === 1 ? 'Item Pendente' : 'Itens Pendentes'}
                            </span>
                            {debt.hasOverdue && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/15 dark:bg-rose-500/20 text-rose-800 dark:text-rose-400 border border-rose-300 dark:border-rose-500/40 text-[10px] font-black uppercase tracking-wider">
                                ⚠️ ATRASO {debt.overdueDays} DIAS
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                            {debt.clientPhone ? `📞 ${debt.clientPhone}` : 'Sem WhatsApp'} • Clique para expandir detalhes
                          </p>
                        </div>
                      </div>

                      {/* Lado Direito: Total & Ações Rápidas */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 block">A Pagar</span>
                          <span className={`text-base font-black ${debt.hasOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-purple-700 dark:text-purple-300'}`}>
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
                                orderCount: totalItemsCount,
                                orders: [...debt.orders, ...debt.manualTxs],
                              });
                            }}
                            className="px-3 py-1.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                            title="Abrir Central de Cobrança WhatsApp (Evolution API + PDF)"
                          >
                            <Send className="h-3 w-3" /> Cobrar WhatsApp
                          </button>

                          {debt.orders.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => handleOpenInstallmentsModal(debt, e)}
                              className="px-3 py-1.5 rounded-xl text-xs font-black bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/20 transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                              title="Agrupar pedidos e parcelar"
                            >
                              <Layers className="h-3 w-3" /> Parcelar
                            </button>
                          )}

                          <div className="p-1 rounded-lg text-slate-400 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Conteúdo Expandido do Accordion (Encomendas + Lançamentos Manuais / Acordos) */}
                    {isExpanded && (
                      <div className="p-4 bg-slate-100/90 dark:bg-black border-t border-slate-200 dark:border-white/10 space-y-3 animate-in slide-in-from-top-1 duration-200">
                        <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-slate-200 dark:border-white/5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-black uppercase tracking-wider text-purple-800 dark:text-purple-300">
                              Detalhamento das Contas ({totalItemsCount}):
                            </span>
                            {debt.orders.filter(o => o.payment_status !== 'in_agreement').length > 1 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedOrderForPaymentModal(null);
                                  setSelectedClientOrdersForPaymentModal(debt.orders.filter(o => o.payment_status !== 'in_agreement'));
                                }}
                                className="px-3 py-1 rounded-xl text-[11px] font-black bg-emerald-500/15 hover:bg-emerald-600 text-emerald-800 dark:text-emerald-300 hover:text-white border border-emerald-300 dark:border-emerald-500/40 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                                title="Dar baixa e quitar todas as encomendas deste cliente de uma só vez (Baixa em Lote)"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Quitar Todas Encomendas ({formatCurrency(debt.totalPending, true)})
                              </button>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-zinc-400 italic">
                            💡 Toque/Clique no card para ver detalhes completos ou dar baixa individual
                          </span>
                        </div>

                        {/* Grade de Itens (Encomendas e Faturas/Parcelas Manuais) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {/* Encomendas de Produção */}
                          {debt.orders.map(ord => {
                            // Três marcas possíveis, dependendo de quando o acordo foi criado.
                            const metaAcordo = parsePaymentMetadata(ord.notes).metadata;
                            const isInAgreement = ord.payment_status === 'in_agreement'
                              || Boolean(ord.notes && ord.notes.includes('[ACORDO_ATIVO'))
                              || Boolean(metaAcordo.agreementId);
                            const acordoDoPedido = metaAcordo.agreementId
                              ? agreements.find(a => a.agreementId === metaAcordo.agreementId)
                              : agreements.find(a => a.associatedOrderIds?.includes(ord.id));
                            const pendingVal = isInAgreement ? 0 : calculateOrderPendingVal(ord as any);
                            const totalVal = calculateOrderExactValue(ord as any);
                            const { metadata } = parsePaymentMetadata(ord.notes);
                            const depositVal = metadata.depositAmount || (ord.payment_status === 'half_paid' ? totalVal * 0.5 : 0);
                            const isHalf = ord.payment_status === 'half_paid';

                            const dueStr = ord.due_date || ord.created_at;
                            const dueTs = dueStr ? parseLocalDate(dueStr)?.getTime() || new Date(dueStr).getTime() : Date.now();
                            const todayTs = new Date().setHours(0, 0, 0, 0);
                            const isOverdue = dueTs < todayTs;
                            const isDueToday = dueTs >= todayTs && dueTs < todayTs + 86400000;
                            const overdueDays = isOverdue ? differenceInDays(new Date(), new Date(dueTs)) : 0;

                            return (
                              <div
                                key={ord.id}
                                onClick={() => setSelectedOrderForDetails(ord)}
                                className="p-4 rounded-2xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-white/10 hover:border-purple-400 dark:hover:border-purple-500/60 hover:bg-slate-50 dark:hover:bg-zinc-900/60 active:scale-[0.98] transition-all space-y-2.5 group shadow-sm cursor-pointer select-none"
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="font-black text-slate-900 dark:text-white text-xs group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors flex items-center gap-1 truncate">
                                      🧵 Pedido #{ord.order_number || ord.id.slice(0, 4)}
                                    </span>
                                    <ExternalLink className="h-3 w-3 text-purple-600 dark:text-purple-400 opacity-60 group-hover:opacity-100 transition-opacity shrink-0" />
                                  </div>
                                  {isInAgreement ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (acordoDoPedido) setAcordoAberto(acordoDoPedido);
                                      }}
                                      title={acordoDoPedido
                                        ? `Ver acordo: ${acordoDoPedido.paidCount}/${acordoDoPedido.totalCount} parcelas pagas`
                                        : 'Este pedido já está dentro de um acordo de parcelamento'}
                                      className="text-[9px] font-black uppercase px-2 py-1 rounded-md shrink-0 bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-400/40 hover:bg-purple-500/35 transition-colors flex items-center gap-1"
                                    >
                                      🤝 Em Acordo
                                      {acordoDoPedido && (
                                        <span className="opacity-80 normal-case font-bold">
                                          {acordoDoPedido.paidCount}/{acordoDoPedido.totalCount} · ver
                                        </span>
                                      )}
                                    </button>
                                  ) : (
                                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md shrink-0 ${
                                      isHalf
                                        ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-400/40'
                                        : 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30'
                                    }`}>
                                      {isHalf ? '🟡 Sinal Pago' : '⏳ Pendente'}
                                    </span>
                                  )}
                                </div>

                                {/* Barra de Progresso visual se pagou sinal */}
                                {isHalf && totalVal > 0 && (
                                  <div className="space-y-1 bg-amber-500/10 dark:bg-amber-500/15 p-2 rounded-xl border border-amber-500/20">
                                    <div className="flex items-center justify-between text-[10px] text-amber-800 dark:text-amber-300 font-semibold">
                                      <span>Entrada: {formatCurrency(depositVal, true)}</span>
                                      <span className="font-black">Resta: {formatCurrency(pendingVal, true)}</span>
                                    </div>
                                    <div className="w-full bg-slate-200 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                                      <div 
                                        className="bg-amber-500 h-full rounded-full transition-all"
                                        style={{ width: `${Math.min(100, Math.max(15, (depositVal / totalVal) * 100))}%` }}
                                      />
                                    </div>
                                  </div>
                                )}

                                <div className="flex items-center justify-between text-[11px] pt-0.5">
                                  <span className={`text-[10px] font-semibold ${
                                    isOverdue 
                                      ? 'text-rose-600 dark:text-rose-400 font-black' 
                                      : isDueToday 
                                      ? 'text-amber-600 dark:text-amber-400 font-black' 
                                      : 'text-slate-500 dark:text-zinc-400'
                                  }`}>
                                    {isOverdue 
                                      ? `⚠️ Vencido há ${overdueDays}d` 
                                      : isDueToday 
                                      ? '⏰ Vence Hoje' 
                                      : `📅 Venc: ${format(new Date(dueTs), 'dd/MM/yy')}`}
                                  </span>
                                  <span className="font-black text-purple-800 dark:text-purple-200 text-xs">
                                    {isInAgreement ? 'Parcelado' : formatCurrency(pendingVal, true)}
                                  </span>
                                </div>

                                {!isInAgreement && (
                                  <div className="pt-1 grid grid-cols-2 gap-1.5" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedOrderForPaymentModal(ord);
                                      }}
                                      className="py-1.5 px-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-600 text-emerald-800 dark:text-emerald-200 hover:text-white border border-emerald-300 dark:border-emerald-500/30 text-[10px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                                      title="Dar baixa e selecionar forma de pagamento"
                                    >
                                      <DollarSign className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> Quitar
                                    </button>

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedOrderForCollectionModal(ord);
                                      }}
                                      className="py-1.5 px-2 rounded-xl bg-purple-500/15 hover:bg-purple-600 text-purple-800 dark:text-purple-200 hover:text-white border border-purple-300 dark:border-purple-500/30 text-[10px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                                      title="Cobrar via WhatsApp com Evolution API"
                                    >
                                      <Send className="h-3 w-3 text-purple-600 dark:text-purple-400" /> Cobrar
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Lançamentos Manuais / Parcelas de Acordo */}
                          {debt.manualTxs.map(tx => {
                            const dueStr = tx.due_date || tx.created_at;
                            const dueTs = dueStr ? parseLocalDate(dueStr)?.getTime() || new Date(dueStr).getTime() : Date.now();
                            const todayTs = new Date().setHours(0, 0, 0, 0);
                            const isOverdue = dueTs < todayTs;
                            const isDueToday = dueTs >= todayTs && dueTs < todayTs + 86400000;
                            const overdueDays = isOverdue ? differenceInDays(new Date(), new Date(dueTs)) : 0;
                            const isAgreement = tx.isAgreementParcel;

                            const handleOpenAgreementDetails = () => {
                              const agreementId = tx.metadata?.agreementId;
                              const matching = agreements.find(a => a.agreementId === agreementId || a.clientName.toLowerCase() === debt.clientName.toLowerCase());
                              if (matching) {
                                setAcordoAberto(matching);
                              } else {
                                toast.info('Abrindo detalhes da parcela...');
                                setSelectedOrderForPaymentModal(tx);
                              }
                            };

                            return (
                              <div
                                key={tx.id}
                                className={`p-4 rounded-2xl transition-all space-y-3 group shadow-sm ${
                                  isAgreement
                                    ? 'bg-gradient-to-br from-indigo-950/50 via-purple-950/40 to-zinc-950 border-2 border-indigo-500/50 hover:border-indigo-400 shadow-md shadow-indigo-950/30'
                                    : 'bg-white dark:bg-zinc-950 border border-slate-200 dark:border-white/10 hover:border-purple-400 dark:hover:border-purple-500/60 hover:bg-slate-50 dark:hover:bg-zinc-900/60'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-black text-slate-900 dark:text-white text-xs truncate" title={tx.description}>
                                    {isAgreement ? `🤝 ${tx.description}` : `📝 ${tx.description || 'Entrada Futura'}`}
                                  </span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                                      isAgreement
                                        ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-400/50 shadow-sm animate-pulse'
                                        : 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-400/40'
                                    }`}>
                                      {isAgreement ? `🤝 ACORDO (${tx.metadata?.installmentIndex || '1'}/${tx.metadata?.totalInstallments || '1'})` : 'Avulso'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setTxToDelete(tx)}
                                      className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                                      title="Excluir este lançamento a receber"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-[11px] pt-1">
                                  <span className={`text-[10px] font-semibold ${
                                    isOverdue 
                                      ? 'text-rose-600 dark:text-rose-400 font-black' 
                                      : isDueToday 
                                      ? 'text-amber-600 dark:text-amber-400 font-black' 
                                      : 'text-slate-500 dark:text-zinc-400'
                                  }`}>
                                    {isOverdue 
                                      ? `⚠️ Vencido há ${overdueDays}d` 
                                      : isDueToday 
                                      ? '⏰ Vence Hoje' 
                                      : `📅 Venc: ${format(new Date(dueTs), 'dd/MM/yy')}`}
                                  </span>
                                  <span className="font-black text-purple-800 dark:text-purple-200 text-xs">
                                    {formatCurrency(tx.total_amount, true)}
                                  </span>
                                </div>

                                <div className={`pt-1 grid ${isAgreement ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5`}>
                                  {isAgreement && (
                                    <button
                                      type="button"
                                      onClick={handleOpenAgreementDetails}
                                      className="py-1.5 px-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40 text-[9px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 col-span-1"
                                      title="Ver o acordo completo com todas as parcelas e pedidos vinculados"
                                    >
                                      <CalendarClock className="h-3 w-3 text-indigo-300" /> Acordo
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => setSelectedOrderForPaymentModal(tx)}
                                    className="py-1.5 px-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-600 text-emerald-800 dark:text-emerald-200 hover:text-white border border-emerald-300 dark:border-emerald-500/30 text-[10px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                                    title="Abrir modal para dar baixa e selecionar forma de pagamento"
                                  >
                                    <DollarSign className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> Quitar
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedClientForWhatsAppModal({
                                        id: debt.clientId,
                                        name: debt.clientName,
                                        phone: debt.clientPhone,
                                        totalAmount: tx.total_amount,
                                        orderCount: 1,
                                        orders: [tx]
                                      });
                                    }}
                                    className="py-1.5 px-2 rounded-xl bg-purple-500/15 hover:bg-purple-600 text-purple-800 dark:text-purple-200 hover:text-white border border-purple-300 dark:border-purple-500/30 text-[10px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                                    title="Cobrar este lançamento via WhatsApp"
                                  >
                                    <Send className="h-3 w-3 text-purple-600 dark:text-purple-400" /> Cobrar
                                  </button>
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
          <div className="p-4 bg-slate-100 dark:bg-gradient-to-r dark:from-purple-950 dark:via-zinc-900 dark:to-black border-t border-slate-200 dark:border-purple-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-purple-500/20 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-500/30 flex items-center justify-center font-black">
                {selectedClientIds.length}
              </div>
              <div>
                <span className="text-xs font-black text-slate-900 dark:text-white block">
                  {selectedClientIds.length} Cliente(s) Selecionado(s) para Cobrança
                </span>
                <span className="text-[10px] text-purple-700 dark:text-purple-300 font-semibold">
                  Total Acumulado: {formatCurrency(clientDebtsList.filter(c => selectedClientIds.includes(c.clientId)).reduce((acc, c) => acc + c.totalPending, 0), true)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedClientIds([])}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-transparent transition-colors cursor-pointer"
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
                        orderCount: target.orders.length + target.manualTxs.length,
                        orders: [...target.orders, ...target.manualTxs],
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

      {/* Modais Secundários */}
      {selectedOrderForDetails && (
        <OrderDetailsModal
          isOpen={!!selectedOrderForDetails}
          onClose={() => setSelectedOrderForDetails(null)}
          order={selectedOrderForDetails}
          onOrderUpdated={() => {
            fetchPendingData();
            fetchRecentPaidOrders();
          }}
        />
      )}

      {selectedClientForWhatsAppModal && (
        <CollectionActionModal
          isOpen={!!selectedClientForWhatsAppModal}
          onClose={() => setSelectedClientForWhatsAppModal(null)}
          clientDebts={{
            clientId: selectedClientForWhatsAppModal.id,
            clientName: selectedClientForWhatsAppModal.name,
            clientPhone: selectedClientForWhatsAppModal.phone,
            orders: selectedClientForWhatsAppModal.orders,
            totalPending: selectedClientForWhatsAppModal.totalAmount
          }}
        />
      )}

      {selectedOrderForCollectionModal && (
        <CollectionActionModal
          isOpen={!!selectedOrderForCollectionModal}
          onClose={() => setSelectedOrderForCollectionModal(null)}
          order={selectedOrderForCollectionModal}
        />
      )}

      {(selectedOrderForPaymentModal || selectedClientOrdersForPaymentModal) && (
        <PaymentStatusModal
          isOpen={!!selectedOrderForPaymentModal || !!selectedClientOrdersForPaymentModal}
          onClose={() => {
            setSelectedOrderForPaymentModal(null);
            setSelectedClientOrdersForPaymentModal(null);
          }}
          order={selectedOrderForPaymentModal}
          orders={selectedClientOrdersForPaymentModal}
          onStatusUpdated={() => {
            fetchPendingData();
            fetchRecentPaidOrders();
          }}
          isBaixaMode={true}
          defaultStatus="paid"
        />
      )}

      <AgreementDetailsModal
        isOpen={!!acordoAberto}
        onClose={() => setAcordoAberto(null)}
        agreement={acordoAberto}
        canSeeFinancials={isUnlocked}
        onChanged={() => { fetchAgreements(); fetchPendingData(); }}
      />

      {selectedClientForInstallments && (
        <CreateInstallmentAgreementModal
          isOpen={!!selectedClientForInstallments}
          onClose={() => setSelectedClientForInstallments(null)}
          clientData={{
            id: selectedClientForInstallments.clientId,
            name: selectedClientForInstallments.clientName,
            phone: selectedClientForInstallments.clientPhone,
            company_name: selectedClientForInstallments.clientCompany,
            orders: selectedClientForInstallments.orders as any
          }}
          onAgreementCreated={() => {
            fetchPendingData();
            fetchRecentPaidOrders();
          }}
        />
      )}

      {massSendReport && (
        <div className="fixed inset-0 z-[99999999] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white dark:bg-[#0e0e17] border border-rose-300 dark:border-rose-500/30 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-4 my-auto text-slate-900 dark:text-white">
            
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30 flex items-center justify-center">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Relatório do Disparo em Massa
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    {massSendReport.success} enviado(s) com sucesso • {massSendReport.failures.length} falha(s)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMassSendReport(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-300 block">
                Clientes que não receberam (Motivo do Erro):
              </label>

              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {massSendReport.failures.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-black text-rose-800 dark:text-rose-300">{item.name}</span>
                      <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-mono">{item.phone}</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-zinc-300">
                      💡 {item.reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setMassSendReport(null)}
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-purple-600 hover:bg-purple-500 text-white transition-colors cursor-pointer active:scale-95"
              >
                Entendido
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal de Segurança & Atenção para Excluir Entrada Futura */}
      {txToDelete && (
        <div className="fixed inset-0 z-[99999999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white dark:bg-[#12121e] border border-rose-500/40 rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 text-slate-900 dark:text-zinc-100">
            
            {/* Header com Ícone de Alerta */}
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-rose-500/20 text-rose-500 border border-rose-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-6 w-6 text-rose-500 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  Excluir Entrada Futura
                </h3>
                <p className="text-xs text-rose-500 font-bold">
                  Ação irreversível no lançamento financeiro
                </p>
              </div>
            </div>

            {/* Detalhes do Lançamento */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-zinc-400 font-bold">Descrição:</span>
                <strong className="text-slate-900 dark:text-white font-black truncate max-w-[200px]">{txToDelete.description || 'Entrada Futura'}</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-zinc-400 font-bold">Valor:</span>
                <strong className="text-amber-600 dark:text-amber-400 font-black">{formatCurrency(txToDelete.total_amount, true)}</strong>
              </div>
              {(txToDelete.metadata?.associatedOrderIds?.length > 0 || txToDelete.order_id) && (
                <div className="pt-2 border-t border-slate-200 dark:border-white/10 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  ⚠️ <strong>Atenção ao Vínculo:</strong> Este lançamento possui pedido(s) associado(s). Ao excluir, o acordo será removido e os pedidos voltarão para a lista de pendências normais!
                </div>
              )}
            </div>

            {/* Botões de Confirmação */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setTxToDelete(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-white/10 dark:hover:bg-white/20 dark:text-zinc-300 transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={async () => {
                  try {
                    // Desfaz vinculo nos pedidos vinculados para que voltem a ficar disponiveis
                    const assocIds = txToDelete.metadata?.associatedOrderIds || (txToDelete.order_id ? [txToDelete.order_id] : []);
                    if (assocIds.length > 0) {
                      for (const ordId of assocIds) {
                        const { data: ord } = await supabase.from('orders').select('notes').eq('id', ordId).maybeSingle();
                        if (ord?.notes) {
                          const cleanedNotes = ord.notes
                            .replace(/\[ACORDO COMERCIAL[^\]]*\]/gi, '')
                            .replace(/\[ACORDO_ATIVO[^\]]*\]/gi, '')
                            .trim();
                          await supabase.from('orders').update({ notes: cleanedNotes }).eq('id', ordId);
                        }
                      }
                    }

                    // Exclui o lancamento
                    const { error } = await supabase.from('financial_transactions').delete().eq('id', txToDelete.id);
                    if (error) throw error;

                    toast.success('🎉 Entrada futura / lançamento excluído com sucesso!');
                    window.dispatchEvent(new CustomEvent('borda_orders_changed'));
                    fetchPendingData();
                    fetchAgreements();
                    setTxToDelete(null);
                  } catch (err: any) {
                    console.error(err);
                    toast.error('Erro ao excluir lançamento: ' + (err.message || 'tente novamente'));
                  }
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                <span>Sim, Excluir Lançamento</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
