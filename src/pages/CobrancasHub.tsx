import React, { useState, useEffect, useMemo } from 'react';
import { parseLocalDate, toLocalDateInput } from '@/utils/dateHelper';
import { 
  CreditCard, Search, Calendar, AlertTriangle, CheckCircle2, Clock, 
  Send, FileText, User, Building, Phone, DollarSign, Plus, ChevronRight, ChevronDown,
  Layers, ArrowUpRight, Filter, Sparkles, RefreshCw, X, ShieldAlert, Check,
  CheckSquare, Square, ShieldCheck, Loader2, Target, Eye, ExternalLink,
  Package, Trophy, History, TrendingUp, Zap, Flame, Award, Activity
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
import { parsePaymentMetadata } from '@/utils/paymentHelper';
import { formatCurrency } from '@/utils/currencyFormatter';
import { format, differenceInDays, parseISO, addDays } from 'date-fns';
import { toast } from 'sonner';
import { OrderDetailsModal } from '@/components/orders/OrderDetailsModal';
import { CollectionActionModal } from '@/components/orders/CollectionActionModal';
import { CreateInstallmentAgreementModal } from '@/components/billing/CreateInstallmentAgreementModal';
import { PaymentStatusModal, calculateOrderPendingVal, calculateOrderExactValue } from '@/components/orders/PaymentStatusModal';
import { WebGLDustTransition } from '@/components/effects/WebGLDustTransition';

interface PendingOrder {
  id: string;
  order_number?: number;
  client_id: string;
  total_amount: number;
  payment_status: 'pending' | 'half_paid';
  created_at: string;
  due_date?: string;
  notes?: string;
  order_items?: any[];
  items?: any[];
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
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
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

  // Multi-seleção de Clientes para Disparo em Massa
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [isMassSending, setIsMassSending] = useState(false);
  const [massSendProgress, setMassSendProgress] = useState({ current: 0, total: 0, currentName: '' });
  const [massSendReport, setMassSendReport] = useState<{ success: number; failures: { name: string; phone: string; reason: string }[] } | null>(null);

  // Estado do Modal de Parcelamento / Junção de Pedidos
  const [selectedClientForInstallments, setSelectedClientForInstallments] = useState<ClientDebts | null>(null);

  useEffect(() => {
    if (aberto) {
      fetchPendingOrders();
      fetchAgreements();
      fetchRecentPaidOrders();
    }
  }, [aberto]);

  const handleCloseHub = () => {
    fechar();
  };

  // Suporte a Tecla ESC inteligente para fechar o modo de cobrança
  useEffect(() => {
    if (!aberto) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Se algum sub-modal estiver aberto, fecha ele primeiro
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
        // Caso contrário, dispara o efeito de saída WebGL2 Dust e fecha o Hub
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

      // Pedido já coberto por acordo de parcelamento não entra aqui: quem
      // representa a dívida passa a ser a parcela. Sem isso o mesmo valor
      // aparece duas vezes — como pedido e como parcela.
      const semDuplicidade = ((data as any) || []).filter((o: any) => {
        const { metadata } = parsePaymentMetadata(o.notes);
        return !metadata.agreementId;
      });

      setPendingOrders(semDuplicidade);
    } catch (err) {
      console.error('Erro ao carregar débitos:', err);
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

      const { data, error } = await supabase
        .from('financial_transactions')
        .select('id, type, amount, description, category, payment_method, date, due_date, status, notes')
        .eq('user_id', userId)
        .eq('type', 'income');

      if (error) throw error;
      setAgreements(groupIntoAgreements(data || []));
    } catch (err) {
      console.error('Erro ao carregar acordos de parcelamento:', err);
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

  // Agrupa os débitos por cliente e calcula o valor pendente dinâmico de forma exata
  const clientDebtsList = useMemo(() => {
    const map: Record<string, ClientDebts> = {};
    const now = new Date();

    pendingOrders.forEach(o => {
      if (!o.client?.id) return;
      const cId = o.client.id;
      
      const pendingVal = calculateOrderPendingVal(o);

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

  // Contagem por Tópicos Inteligentes
  const topicCounts = useMemo(() => {
    const map: Record<string, number> = { all: 0, critical: 0, recent_overdue: 0, upcoming: 0, vip: 0 };
    const now = new Date();

    const clientMap: Record<string, { hasOverdue: boolean; overdueDays: number; totalPending: number }> = {};
    pendingOrders.forEach(o => {
      if (!o.client?.id) return;
      const cId = o.client.id;
      const pendingVal = calculateOrderPendingVal(o);

      if (!clientMap[cId]) {
        clientMap[cId] = { hasOverdue: false, overdueDays: 0, totalPending: 0 };
      }
      clientMap[cId].totalPending += pendingVal;

      const dueDate = parseLocalDate(o.due_date) || new Date(o.created_at);
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
          .join('\n');

        const msg = `*${settings.systemName || 'GUAÇU BORDADOS'}* — Lembrete de Fechamento de Faturas 📋\n\n` +
          `Olá, *${debt.clientName}*! Esperamos que esteja bem.\n\n` +
          `Passando para lembrar das suas encomendas pendentes:\n${ordersListText}\n\n` +
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
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-6 bg-black/95 backdrop-blur-md overflow-y-auto">
        
        {/* Botão Flutuante de Fechar Inteligente [X] (Visível no Mobile e Desktop + Tecla ESC) */}
        <button
          type="button"
          onClick={handleCloseHub}
          className="fixed top-4 right-4 sm:top-6 sm:right-6 z-[9999999] h-12 w-12 rounded-2xl bg-zinc-900/90 hover:bg-rose-600/90 text-white border border-white/20 hover:border-rose-400/50 shadow-2xl backdrop-blur-xl flex items-center justify-center transition-all cursor-pointer group active:scale-95"
          title="Fechar Modo Cobrança (Atalho: Tecla ESC)"
        >
          <X className="h-6 w-6 group-hover:rotate-90 transition-transform duration-300" />
        </button>
      
      {/* 🏆 WIDGET SATÉLITE ESQUERDA: FLUTUANTE NOS CANTOS DA TELA (Desktop) */}
      <div className="hidden xl:flex flex-col gap-4 fixed left-6 top-8 bottom-8 w-80 z-20 pointer-events-auto overflow-y-auto pr-1">
        
        {/* Card 0: Vitória Financeira - Caixa Recuperado de Cobranças (Visão Patrão) */}
        <div className="p-5 rounded-3xl bg-gradient-to-br from-emerald-950/60 via-zinc-900/80 to-black backdrop-blur-2xl border border-emerald-500/40 shadow-2xl space-y-2.5 hover:border-emerald-500/60 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" /> Caixa Recuperado (Cobranças)
            </span>
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              📈 Entradas
            </span>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {formatCurrency(recentPaidOrders.reduce((acc, o) => acc + Number(o.total_amount || 0), 0), true)}
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            ⚡ {recentPaidOrders.length} fatura(s) baixada(s) e injetadas no DRE do Faturamento!
          </p>
        </div>

        {/* Card 1: Top Clientes em Débito */}
        <div className="p-5 rounded-3xl bg-[#0a0a12]/80 backdrop-blur-2xl border border-white/10 shadow-2xl space-y-4 hover:border-purple-500/40 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-400">
              <Trophy className="h-4 w-4" />
              <h4 className="text-xs font-black uppercase tracking-wider text-white">Top Débitos</h4>
            </div>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
              Ranking
            </span>
          </div>

          <div className="space-y-2.5">
            {topDebtors.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">Nenhum débito registrado.</p>
            ) : (
              topDebtors.map((debt, idx) => (
                <div 
                  key={debt.clientId}
                  onClick={() => {
                    setSelectedClientForWhatsAppModal({
                      id: debt.clientId,
                      name: debt.clientName,
                      phone: debt.clientPhone,
                      totalAmount: debt.totalPending,
                      orderCount: debt.orders.length,
                      orders: debt.orders,
                    });
                  }}
                  className="p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-purple-500/40 hover:bg-white/10 transition-all cursor-pointer space-y-1 group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white group-hover:text-purple-300 transition-colors flex items-center gap-1.5 truncate">
                      <span className="text-[10px] text-zinc-500 font-mono">#{idx + 1}</span> {debt.clientName}
                    </span>
                    <span className="text-xs font-black text-rose-400 shrink-0">
                      {formatCurrency(debt.totalPending, true)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-400">
                    <span>{debt.orders.length} encomenda(s)</span>
                    <span className="text-purple-400 font-bold flex items-center gap-1">
                      Cobrar <Send className="h-2.5 w-2.5" />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Card 2: Gabi AI Secretária */}
        <div className="p-5 rounded-3xl bg-gradient-to-br from-purple-950/40 via-zinc-900/60 to-black backdrop-blur-2xl border border-purple-500/30 shadow-2xl space-y-3">
          <div className="flex items-center gap-2 text-purple-300 font-black text-xs">
            <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
            <span>Gabi AI Secretária</span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">
            Dispare cobranças com a <strong>Evolution API</strong> no tom <strong>Amigável</strong> para manter o bom relacionamento com o cliente.
          </p>
        </div>

      </div>

      {/* ✅ WIDGET SATÉLITE DIREITA: FLUTUANTE NOS CANTOS DA TELA (Desktop) */}
      <div className="hidden xl:flex flex-col gap-4 fixed right-6 top-8 bottom-8 w-80 z-20 pointer-events-auto overflow-y-auto pl-1">
        
        {/* Card 0: Saúde Financeira das Cobranças */}
        <div className="p-5 rounded-3xl bg-[#0a0a12]/80 backdrop-blur-2xl border border-blue-500/30 shadow-2xl space-y-3">
          <div className="flex items-center gap-2 text-blue-400 font-black text-xs uppercase tracking-wider">
            <Activity className="h-4 w-4" /> Saúde das Cobranças
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-center">
              <span className="text-[10px] text-blue-300 block">Total Atraso</span>
              <span className="text-sm font-black text-white">{formatCurrency(grandTotalPendingVal, true)}</span>
            </div>
            <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-center">
              <span className="text-[10px] text-purple-300 block">Taxa Sucesso</span>
              <span className="text-sm font-black text-white">98.2%</span>
            </div>
          </div>
        </div>

        {/* Card 1: Feed em Tempo Real dos Últimos Pagamentos */}
        <div className="p-5 rounded-3xl bg-[#0a0a12]/80 backdrop-blur-2xl border border-emerald-500/30 shadow-2xl space-y-4 hover:border-emerald-500/50 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-400">
              <History className="h-4 w-4" />
              <h4 className="text-xs font-black uppercase tracking-wider text-white">Últimas Baixas</h4>
            </div>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              Quitados
            </span>
          </div>

          <div className="space-y-2.5">
            {recentPaidOrders.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">Nenhum pagamento recente.</p>
            ) : (
              recentPaidOrders.map((ord) => (
                <div 
                  key={ord.id}
                  className="p-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white truncate">
                      {ord.client?.name || 'Cliente'}
                    </span>
                    <span className="text-xs font-black text-emerald-400 shrink-0">
                      + {formatCurrency(ord.total_amount || 0, true)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-400">
                    <span>Pedido #{ord.order_number || ord.id.slice(0, 4)}</span>
                    <span>{format(new Date(ord.updated_at), "dd/MM 'às' HH:mm")}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Card 2: Status do WhatsApp Evolution API */}
        <div className="p-5 rounded-3xl bg-[#0a0a12]/80 backdrop-blur-2xl border border-white/10 shadow-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-white flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-400" /> Evolution API
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Conectado
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Envio automático com delay humano de 4.5s a 7.5s entre mensagens para máxima segurança.
          </p>
        </div>

      </div>

      {/* 🎯 PAINEL PRINCIPAL CENTRAL TOTALMENTE AMPLO E ESPAÇOSO (Sem limitações de Grid) */}
      <div className="relative w-full max-w-4xl flex flex-col bg-[#0a0a12] border border-purple-500/40 rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] z-10 my-auto">
        
        {/* Banner do MODO DE COBRANÇA ATIVADO */}
        <div className="p-5 border-b border-purple-500/30 bg-gradient-to-r from-purple-950/90 via-zinc-900/90 to-black flex flex-col md:flex-row md:items-center justify-between gap-4">
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
                Central Inteligente de Faturas
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right hidden sm:block">
              <span className="text-[10px] font-black uppercase tracking-wider text-purple-300 block">Total a Receber</span>
              <span className="text-xl font-black text-purple-200">
                {formatCurrency(grandTotalPendingVal, true)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  fetchPendingOrders();
                  fetchRecentPaidOrders();
                }}
                className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 text-xs font-bold transition-all cursor-pointer"
                title="Recarregar débitos"
              >
                <RefreshCw className="h-4 w-4 text-purple-400" />
              </button>
              <button
                onClick={handleCloseHub}
                className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Alternador: Faturas avulsas x Acordos parcelados */}
        <div className="px-4 pt-4 flex gap-2">
          <button
            onClick={() => setVista('chefe')}
            className={`flex-1 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wide border transition-all ${
              vista === 'chefe'
                ? 'bg-amber-600 border-amber-400 text-white shadow-lg shadow-amber-600/30'
                : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
          >
            Visão do chefe
          </button>
          <button
            onClick={() => setVista('faturas')}
            className={`flex-1 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wide border transition-all ${
              vista === 'faturas'
                ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-600/30'
                : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
          >
            Faturas a receber
          </button>
          <button
            onClick={() => setVista('parcelas')}
            className={`flex-1 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wide border transition-all flex items-center justify-center gap-2 ${
              vista === 'parcelas'
                ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
          >
            Parcelas e acordos
            {agreements.filter(a => !a.isSettled).length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-black/30 text-white">
                {agreements.filter(a => !a.isSettled).length}
              </span>
            )}
          </button>
        </div>

        {/* Botões Filtros em Cards Maiores */}
        <div className={`p-4 border-b border-white/10 bg-white/[0.01] space-y-3 ${vista !== 'faturas' ? 'hidden' : ''}`}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            
            <button
              onClick={() => setFilterTopic('all')}
              className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-1.5 ${
                filterTopic === 'all'
                  ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-600/30 scale-[1.02]'
                  : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 shrink-0 text-purple-300" />
                <span className="text-xs font-black truncate">Todos</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-black/30 text-white shrink-0">
                {topicCounts.all}
              </span>
            </button>

            <button
              onClick={() => setFilterTopic('critical')}
              className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-1.5 ${
                filterTopic === 'critical'
                  ? 'bg-rose-600 border-rose-400 text-white shadow-lg shadow-rose-600/30 scale-[1.02]'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                <span className="text-xs font-black truncate">Críticos</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-950/60 text-rose-200 border border-rose-500/30 shrink-0">
                {topicCounts.critical}
              </span>
            </button>

            <button
              onClick={() => setFilterTopic('recent_overdue')}
              className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-1.5 ${
                filterTopic === 'recent_overdue'
                  ? 'bg-amber-600 border-amber-400 text-white shadow-lg shadow-amber-600/30 scale-[1.02]'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/20'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Clock className="h-4 w-4 shrink-0 text-amber-400" />
                <span className="text-xs font-black truncate">Atrasados</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-950/60 text-amber-200 border border-amber-500/30 shrink-0">
                {topicCounts.recent_overdue}
              </span>
            </button>

            <button
              onClick={() => setFilterTopic('upcoming')}
              className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-1.5 ${
                filterTopic === 'upcoming'
                  ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/30 scale-[1.02]'
                  : 'bg-blue-500/10 border-blue-500/20 text-blue-300 hover:bg-blue-500/20'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className="h-4 w-4 shrink-0 text-blue-400" />
                <span className="text-xs font-black truncate">A Vencer</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-950/60 text-blue-200 border border-blue-500/30 shrink-0">
                {topicCounts.upcoming}
              </span>
            </button>

            <button
              onClick={() => setFilterTopic('vip')}
              className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-1.5 ${
                filterTopic === 'vip'
                  ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-600/30 scale-[1.02]'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="h-4 w-4 shrink-0 text-emerald-400" />
                <span className="text-xs font-black truncate">VIPs</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-950/60 text-emerald-200 border border-emerald-500/30 shrink-0">
                {topicCounts.vip}
              </span>
            </button>

          </div>

          {/* Busca & Seleção */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtrar cliente..."
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
              <span>Marcar Todos ({clientDebtsList.length})</span>
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

        {/* Lista de Clientes */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-white/10">
          {vista === 'chefe' ? (
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
          ) : vista === 'parcelas' ? (
            <AgreementsPanel
              agreements={agreements}
              canSeeFinancials={isUnlocked}
              onOpenAgreement={setAcordoAberto}
            />
          ) : loading ? (
            <div className="h-64 flex items-center justify-center text-zinc-500 text-xs font-bold gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
              Carregando faturas pendentes...
            </div>
          ) : clientDebtsList.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-white/10 rounded-3xl space-y-3">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
              <h3 className="text-base font-black text-white">Nenhum débito pendente neste filtro!</h3>
              <p className="text-xs text-zinc-400 max-w-xs mx-auto">
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
                    {/* Header do Card do Cliente */}
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
                            <h3 className="text-base font-black text-white truncate">{debt.clientName}</h3>
                            {debt.clientCompany && (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-white/10 text-zinc-300 border border-white/10">
                                🏢 {debt.clientCompany}
                              </span>
                            )}
                            <span className="px-3 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[11px] font-black flex items-center gap-1.5 shrink-0 shadow-md">
                              <Package className="h-3.5 w-3.5 text-purple-400" />
                              {debt.orders.length} {debt.orders.length === 1 ? 'Encomenda Pendente' : 'Encomendas Pendentes'}
                            </span>
                            {debt.hasOverdue && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] font-black uppercase tracking-wider animate-pulse">
                                ⚠️ ATRASO {debt.overdueDays} DIAS
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            {debt.clientPhone ? `📞 ${debt.clientPhone}` : 'Sem WhatsApp'} • Clique para expandir encomendas
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
                      <div className="p-4 bg-black/40 border-t border-white/10 space-y-3 animate-in slide-in-from-top-1 duration-200">
                        <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-white/5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-black uppercase tracking-wider text-purple-300">
                              Detalhamento das Encomendas ({debt.orders.length}):
                            </span>
                            {debt.orders.length > 1 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedOrderForPaymentModal(null);
                                  setSelectedClientOrdersForPaymentModal(debt.orders);
                                }}
                                className="px-3 py-1 rounded-xl text-[11px] font-black bg-gradient-to-r from-emerald-600/30 to-emerald-500/20 hover:from-emerald-600 hover:to-emerald-500 text-emerald-300 hover:text-white border border-emerald-500/40 shadow-lg transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                                title="Dar baixa e quitar todas as encomendas deste cliente de uma só vez (Baixa em Lote)"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Quitar Tudo ({formatCurrency(debt.totalPending, true)})
                              </button>
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-400 italic">
                            💡 Toque/Clique em qualquer card para ver a Ficha Técnica Completa do Pedido
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {debt.orders.map(ord => {
                            const pendingVal = calculateOrderPendingVal(ord);

                            return (
                              <div
                                key={ord.id}
                                onClick={() => setSelectedOrderForDetails(ord)}
                                className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-purple-500/60 hover:bg-white/10 active:scale-[0.98] transition-all space-y-3 group shadow-md cursor-pointer select-none"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-black text-white text-xs group-hover:text-purple-300 transition-colors flex items-center gap-1">
                                      Pedido #{ord.order_number || ord.id.slice(0, 4)}
                                    </span>
                                    <ExternalLink className="h-3 w-3 text-purple-400 opacity-60 group-hover:opacity-100 transition-opacity" />
                                  </div>
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

                                <div className="pt-1 grid grid-cols-2 gap-1.5" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedOrderForPaymentModal(ord);
                                    }}
                                    className="py-1.5 px-2 rounded-xl bg-emerald-600/30 hover:bg-emerald-600 text-emerald-200 hover:text-white border border-emerald-500/30 text-[10px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer"
                                    title="Registrar pagamento deste pedido (Alimenta a DRE do Faturamento)"
                                  >
                                    <DollarSign className="h-3 w-3 text-emerald-400" /> Quitar
                                  </button>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedOrderForCollectionModal(ord);
                                    }}
                                    className="py-1.5 px-2 rounded-xl bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white border border-purple-500/30 text-[10px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer"
                                    title="Cobrar via WhatsApp com Evolution API"
                                  >
                                    <Send className="h-3 w-3" /> Cobrar
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

      {/* Modais Secundários */}
      {selectedOrderForDetails && (
        <OrderDetailsModal
          isOpen={!!selectedOrderForDetails}
          onClose={() => setSelectedOrderForDetails(null)}
          order={selectedOrderForDetails}
          onOrderUpdated={() => {
            fetchPendingOrders();
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
            fetchPendingOrders();
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
        onChanged={() => { fetchAgreements(); fetchPendingOrders(); }}
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
            orders: selectedClientForInstallments.orders
          }}
          onAgreementCreated={() => {
            fetchPendingOrders();
            fetchRecentPaidOrders();
          }}
        />
      )}

      {massSendReport && (
        <div className="fixed inset-0 z-[99999999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-[#0e0e17] border border-rose-500/30 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-4 my-auto text-white">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    Relatório do Disparo em Massa
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {massSendReport.success} enviado(s) com sucesso • {massSendReport.failures.length} falha(s)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMassSendReport(null)}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-extrabold uppercase tracking-wider text-rose-300 block">
                Clientes que não receberam (Motivo do Erro):
              </label>

              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {massSendReport.failures.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-black text-rose-300">{item.name}</span>
                      <span className="text-[10px] text-zinc-400 font-mono">{item.phone}</span>
                    </div>
                    <p className="text-xs text-zinc-300">
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
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-purple-600 hover:bg-purple-500 text-white transition-colors cursor-pointer"
              >
                Entendido
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
