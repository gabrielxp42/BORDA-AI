import React, { useState, useEffect } from 'react';
import {
  ShoppingBag, Kanban, LayoutGrid, List, Plus, Search, Filter, Calendar,
  CheckCircle2, Clock, DollarSign, User, Package, FileText, ChevronRight,
  RefreshCw, Trash2, Edit3, ArrowUpRight, ChevronDown, ChevronUp,
  AlertTriangle, Paperclip, MessageSquare, ExternalLink, Shield, Maximize2, Minimize2, Phone,
  Zap, Sparkles, Printer, Eye, EyeOff
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { useProfile } from '@/contexts/ProfileContext';
import { PedidosKanban } from './PedidosKanban';
import { CreateOrderModal } from '@/components/orders/CreateOrderModal';
import { PaymentStatusModal } from '@/components/orders/PaymentStatusModal';
import { OrderDetailsModal } from '@/components/orders/OrderDetailsModal';
import { PedidoGridCard } from '@/components/orders/PedidoGridCard';
import { CollectionActionModal } from '@/components/orders/CollectionActionModal';
import { toast } from 'sonner';
import { parsePaymentMetadata } from '@/utils/paymentHelper';
import { sendEvolutionText, getWhatsAppWebLink, formatWhatsAppNumber } from '@/services/whatsappService';
import { useBackgroundTasks } from '@/hooks/useBackgroundTasks';
import { printOrderReceipt } from '@/services/pdfGenerator';
import { printThermalReceipt } from '@/services/thermalPrinter';

interface OrderItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Order {
  id: string;
  order_number?: number;
  client_id: string;
  status: string;
  payment_status: 'pending' | 'paid' | 'half_paid';
  payment_method?: string;
  total_amount: number;
  due_date?: string;
  notes?: string;
  created_at: string;
  client?: { name: string; phone?: string; company_name?: string };
  clients?: { name: string; phone?: string; company_name?: string };
  items?: OrderItem[];
  order_items?: OrderItem[];
  /** Perfis autorizados a ver o pedido; vazio/ausente = visível para todos. */
  visible_profile_ids?: string[];
}

const formatPaymentMethod = (method?: string): string => {
  const map: Record<string, string> = {
    pix: 'PIX',
    credit_card: 'Cartão',
    cash: 'Dinheiro',
    transfer: 'Transferência',
  };
  return method ? (map[method] ?? method.toUpperCase()) : '';
};

export const Pedidos: React.FC = () => {
  const { isUnlocked, role, customProfiles, permissions } = useProfile();
  const { settings } = useCompanySettings();
  const canSeeFinancials = isUnlocked || (permissions?.canSeeFinancials === true);

  const [activeTab, setActiveTab] = useState<'cards' | 'kanban'>('cards');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid'); // Grid de Miniaturas (Cards) como PADRÃO PRIMÁRIO!
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPayment, setFilterPayment] = useState<string>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [initialOrderData, setInitialOrderData] = useState<any>(null);

  // Estado para controlar quais cards estão expandidos no modo Acordeon
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});

  // Modais de Status, Detalhes, Cobrança e Visibilidade
  const [selectedOrderForStatus, setSelectedOrderForStatus] = useState<Order | null>(null);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<Order | null>(null);
  const [selectedOrderForCobrar, setSelectedOrderForCobrar] = useState<Order | null>(null);
  const [selectedOrderForVisibilityModal, setSelectedOrderForVisibilityModal] = useState<Order | null>(null);
  const [activePrintOption, setActivePrintOption] = useState<string | null>(null);

  // Background Task Store
  const addTask = useBackgroundTasks(state => state.addTask);
  const updateTask = useBackgroundTasks(state => state.updateTask);
  const updateStep = useBackgroundTasks(state => state.updateStep);

  const handleCobrarPedido = async (order: Order, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedOrderForCobrar(order);
  };

  const handlePrintPDF = (order: Order) => {
    printOrderReceipt({
      id: order.id,
      client_id: order.client_id,
      total_amount: order.total_amount,
      due_date: order.due_date,
      created_at: order.created_at,
      status: order.status,
      payment_status: order.payment_status,
      payment_method: order.payment_method,
      notes: order.notes,
      clients: order.clients,
      order_items: order.order_items
    } as any);
  };

  const handlePrintThermal = (order: Order) => {
    printThermalReceipt({
      id: order.id,
      client_id: order.client_id,
      total_amount: order.total_amount,
      due_date: order.due_date,
      created_at: order.created_at,
      status: order.status,
      payment_status: order.payment_status,
      payment_method: order.payment_method,
      notes: order.notes,
      clients: order.clients,
      order_items: order.order_items
    } as any, true);
  };

  useEffect(() => {
    fetchOrders(true);

    const channel = supabase
      .channel('realtime-orders-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders(false);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchOrders = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;

      if (!userId) {
        console.warn("Usuário não autenticado.");
        return;
      }

      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id, order_number, client_id, status, payment_status, payment_method, total_amount, due_date, notes, created_at, visible_profile_ids,
          clients (name, phone, company_name)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('*');

      if (itemsError) throw itemsError;

      const formatted: Order[] = (ordersData || []).map((o: any) => {
        const orderItems = itemsData?.filter(i => i.order_id === o.id) || [];
        return {
          ...o,
          client: o.clients,
          items: orderItems,
          order_items: orderItems
        };
      });

      setOrders(formatted);
    } catch (err) {
      console.error("Erro ao buscar lista de pedidos:", err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm("Tem certeza que deseja excluir este pedido?")) return;

    try {
      const { error } = await supabase.from('orders').delete().eq('id', orderId);
      if (error) throw error;
      toast.success("Pedido excluído com sucesso!");
      fetchOrders();
      if (selectedOrderForDetails?.id === orderId) {
        setSelectedOrderForDetails(null);
      }
    } catch (err) {
      console.error("Erro ao excluir pedido:", err);
      toast.error("Erro ao excluir pedido.");
    }
  };

  const toggleExpandOrder = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedOrderIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const expandAll = () => {
    const allExpanded: Record<string, boolean> = {};
    orders.forEach(o => { allExpanded[o.id] = true; });
    setExpandedOrderIds(allExpanded);
  };

  const collapseAll = () => {
    setExpandedOrderIds({});
  };

  const filteredOrders = orders.filter(o => {
    // Filtragem de Visibilidade por Perfil
    if (role !== 'chefe') {
      if ((o as any).visible_profile_ids && (o as any).visible_profile_ids.length > 0) {
        if (!(o as any).visible_profile_ids.includes(role)) {
          return false;
        }
      }
    }

    const clientName = o.client?.name || o.client?.company_name || '';
    const matchesSearch =
      clientName.toLowerCase().includes(search.toLowerCase()) ||
      o.id.toLowerCase().includes(search.toLowerCase()) ||
      (o.order_number && o.order_number.toString().includes(search)) ||
      o.notes?.toLowerCase().includes(search.toLowerCase());

    if (filterPayment === 'all') return matchesSearch;
    return matchesSearch && o.payment_status === filterPayment;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Abas */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
              <ShoppingBag className="h-6 w-6 text-purple-500" /> Gestão de Pedidos
            </h2>
            {!isUnlocked && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                <Shield className="h-3 w-3" /> Modo Operador
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1">
            {isUnlocked
              ? 'Acompanhe orçamentos fechados, baixa de pagamentos e a esteira de produção.'
              : 'Fila de pedidos para produção e separação na oficina de bordado.'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          {/* Seletor de Visão: 📱 Miniaturas (Padrão Primário) vs 📋 Lista vs 📊 Kanban */}
          <div className="p-1 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex flex-1 items-center justify-between sm:justify-start gap-1 shadow-xs overflow-x-auto hide-scrollbar">
            <button
              onClick={() => { setActiveTab('cards'); setViewMode('grid'); }}
              className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'cards' && viewMode === 'grid'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Visão Primária em Miniaturas / Cards"
            >
              <LayoutGrid className="h-3.5 w-3.5 text-purple-300 shrink-0" /> <span className="hidden sm:inline">📱 Miniaturas (Cards)</span><span className="sm:hidden">Cards</span>
            </button>
            <button
              onClick={() => { setActiveTab('cards'); setViewMode('list'); }}
              className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'cards' && viewMode === 'list'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Visão em Lista / Acordeon"
            >
              <List className="h-3.5 w-3.5 shrink-0" /> <span className="hidden sm:inline">📋 Lista</span><span className="sm:hidden">Lista</span>
            </button>
            <button
              onClick={() => setActiveTab('kanban')}
              className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'kanban'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Esteira Kanban de Produção"
            >
              <Kanban className="h-3.5 w-3.5 shrink-0" /> <span className="hidden sm:inline">📊 Kanban</span><span className="sm:hidden">Kanban</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2.5 rounded-2xl text-xs font-bold text-white shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 cursor-pointer shrink-0"
            style={{ backgroundColor: settings.primaryColor }}
          >
            <Plus className="h-4 w-4 shrink-0" /> Novo Pedido
          </button>
        </div>
      </div>

      {/* Conteúdo da Aba 1: Gestão de Pedidos (Miniaturas ou Lista) */}
      {activeTab === 'cards' && (
        <div className="space-y-4 animate-in fade-in duration-200">

          {/* Barra de Filtros, Busca e Ações */}
          <div className="flex flex-col lg:flex-row items-center justify-between gap-3 p-4 rounded-3xl glass-panel border border-slate-200 dark:border-white/10">
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
              <div className="relative w-full sm:w-80">
                <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por cliente, nº do pedido ou notas..."
                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              {/* Botões de Expandir / Encolher Todos (Apenas no Modo Lista) */}
              {viewMode === 'list' && (
                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                  <button
                    onClick={expandAll}
                    className="flex-1 sm:flex-none px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-[11px] font-bold text-slate-700 dark:text-zinc-300 flex items-center justify-center gap-1 transition-all cursor-pointer"
                    title="Expandir todos os cards"
                  >
                    <Maximize2 className="h-3 w-3" /> Expandir Todos
                  </button>
                  <button
                    onClick={collapseAll}
                    className="flex-1 sm:flex-none px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-[11px] font-bold text-slate-700 dark:text-zinc-300 flex items-center justify-center gap-1 transition-all cursor-pointer"
                    title="Encolher todos os cards"
                  >
                    <Minimize2 className="h-3 w-3" /> Encolher Todos
                  </button>
                </div>
              )}
            </div>

            {/* Filtros de Pagamento */}
            <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto">
              <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 shrink-0">Status:</span>
              {[
                { id: 'all', label: 'Todos' },
                { id: 'pending', label: 'Pendentes' },
                { id: 'half_paid', label: 'Sinal 50%' },
                { id: 'paid', label: 'Pago (100%)' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilterPayment(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0 cursor-pointer ${
                    filterPayment === f.id
                      ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/40 shadow-xs'
                      : 'border-slate-200 dark:border-white/5 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Renderização Condicional: Modo Grid de Miniaturas (Cards) vs Modo Lista */}
          {loading ? (
            <div className="flex items-center justify-center p-12 text-slate-500">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-12 text-center glass-panel rounded-3xl border border-slate-200 dark:border-white/10">
              <Package className="h-10 w-10 mx-auto text-slate-400 mb-3" />
              <p className="text-sm font-bold text-slate-700 dark:text-zinc-300">Nenhum pedido encontrado.</p>
              <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Crie um novo pedido no botão acima ou altere os filtros de busca.</p>
            </div>
          ) : viewMode === 'grid' ? (
            /* Modo 1: GRID DE MINIATURAS (PADRÃO PRIMÁRIO NOVO - ESTILO DIRECT AI PARA BORDADOS) */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in duration-200">
              {filteredOrders.map(order => (
                <PedidoGridCard
                  key={order.id}
                  order={order}
                  onOpenDetails={(o) => setSelectedOrderForDetails(o)}
                  onOpenStatusModal={(o) => setSelectedOrderForStatus(o)}
                  onOpenEditModal={(o) => {
                    setInitialOrderData({
                      orderId: o.id,
                      clientId: o.client_id,
                      notes: o.notes
                    });
                    setIsCreateModalOpen(true);
                  }}
                  onDeleteOrder={handleDeleteOrder}
                  onCobrarOrder={(o) => handleCobrarPedido(o)}
                  onConfigureVisibility={(o) => setSelectedOrderForVisibilityModal(o)}
                  onPrintReceipt={(o) => {
                    setSelectedOrderForDetails(o);
                    setTimeout(() => window.print(), 300);
                  }}
                  pixKey={settings.pixKey}
                  systemName={settings.systemName}
                />
              ))}
            </div>
          ) : (
            /* Modo 2: LISTA / ACORDEON */
            <div className="space-y-3">
              {filteredOrders.map(order => {
                const isPaid = order.payment_status === 'paid';
                const isHalf = order.payment_status === 'half_paid';
                const isExpanded = !!expandedOrderIds[order.id];

                const { cleanNotes, metadata } = parsePaymentMetadata(order.notes);

                // Verificação de alertas importantes
                const isQuickEntryWithoutPrice = metadata.isQuickEntry || order.total_amount === 0;
                const hasObservations = Boolean(cleanNotes && cleanNotes.trim().length > 0);
                const hasAttachments = Boolean(metadata.attachmentUrls && metadata.attachmentUrls.length > 0);

                // Cálculo total de peças do pedido
                const totalPiecesCount = order.order_items?.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0) || order.items?.length || 1;

                const clientName = order.client?.name || order.client?.company_name || 'Cliente Geral';
                const clientPhone = order.client?.phone;
                const whatsappUrl = clientPhone ? `https://wa.me/55${clientPhone.replace(/\D/g, '')}` : null;

                return (
                  <div
                    key={order.id}
                    className={`glass-panel rounded-3xl border transition-all overflow-hidden ${
                      isQuickEntryWithoutPrice
                        ? 'border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/5'
                        : 'border-slate-200 dark:border-white/10 hover:border-purple-500/40'
                    } ${
                      order.visible_profile_ids && order.visible_profile_ids.length > 0 ? 'opacity-60 hover:opacity-85' : ''
                    }`}
                  >

                    {/* CABEÇALHO DO CARD (Sempre Visível - Toque para Expandir/Encolher) */}
                    <div
                      onClick={(e) => toggleExpandOrder(order.id, e)}
                      className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors select-none"
                    >
                      {/* Lado Esquerdo: Número, Cliente e Avisos Visíveis no Topo */}
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Avatar do Número do Pedido */}
                        <div className={`h-11 w-11 rounded-2xl border flex items-center justify-center shrink-0 font-black text-xs ${
                          isQuickEntryWithoutPrice
                            ? 'bg-amber-500/20 border-amber-500/30 text-amber-600 dark:text-amber-400'
                            : 'bg-slate-100 dark:bg-zinc-800 border-slate-200 dark:border-white/10 text-slate-800 dark:text-white'
                        }`}>
                          #{order.order_number || order.id.slice(0, 4)}
                        </div>

                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                              {new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>

                            {order.visible_profile_ids && order.visible_profile_ids.length > 0 && (
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/35 flex items-center gap-1">
                                👁️ Restrito
                              </span>
                            )}

                            {/* AVISOS VISÍVEIS MESMO QUANDO ENCOLHIDO */}
                            {isQuickEntryWithoutPrice && (
                              <span className="animate-pulse px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> Sem Orçamento
                              </span>
                            )}

                            {hasObservations && (
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center gap-1">
                                <FileText className="h-3 w-3" /> Obs
                              </span>
                            )}

                            {hasAttachments && (
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 flex items-center gap-1">
                                <Paperclip className="h-3 w-3" /> Anexo ({(metadata?.attachmentUrls?.length || 0)})
                              </span>
                            )}

                            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-white/10">
                              📦 {totalPiecesCount} {totalPiecesCount === 1 ? 'peça' : 'peças'}
                            </span>
                          </div>

                          <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                            <User className="h-4 w-4 text-purple-500 shrink-0" />
                            {clientName}
                          </h3>
                        </div>
                      </div>

                      {/* Lado Direito: Status de Pagamento, Valor/Resumo e Toggle Acordeon */}
                      <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-white/5">
                        <div className="flex items-center gap-3">
                          {/* Botão de Status */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOrderForStatus(order);
                            }}
                            title="Gerenciar pagamento"
                            className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all flex items-center gap-1.5 cursor-pointer ${
                              isPaid
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                : isHalf
                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/20'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                            }`}
                          >
                            {isPaid ? (
                              <><CheckCircle2 className="h-3 w-3" /> PAGO</>
                            ) : isHalf ? (
                              <><Clock className="h-3 w-3" /> SINAL 50%</>
                            ) : (
                              <><Clock className="h-3 w-3" /> PENDENTE</>
                            )}
                          </button>

                          {/* Botão ⚡ Cobrar (Segundo Plano) */}
                          <button
                            type="button"
                            onClick={(e) => handleCobrarPedido(order, e)}
                            title="Enviar cobrança automática via WhatsApp"
                            className="px-3 py-1 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-black uppercase tracking-wider shadow-md shadow-orange-500/20 flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                          >
                            ⚡ Cobrar
                          </button>

                          {/* Valor do Pedido (Visível se canSeeFinancials) */}
                          <div className="text-right">
                            {canSeeFinancials ? (
                              <p className="text-sm sm:text-base font-black text-slate-900 dark:text-white" style={{ color: settings.primaryColor }}>
                                R$ {Number(order.total_amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                            ) : (
                              <p className="text-xs font-bold text-slate-600 dark:text-zinc-300">
                                🧵 {totalPiecesCount} un
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Ícone de Expansão do Acordeon */}
                        <div className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-zinc-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </div>
                    </div>

                    {/* CONTEÚDO EXPANDIDO DO CARD (Revela os detalhes completos) */}
                    {isExpanded && (
                      <div className="p-4 sm:p-5 pt-0 border-t border-slate-100 dark:border-white/5 space-y-4 animate-in slide-in-from-top-2 duration-200">

                        {/* Grade com Itens do Pedido */}
                        <div className="space-y-2 pt-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                            <Package className="h-3.5 w-3.5 text-purple-500" /> Peças & Descrição de Bordado:
                          </p>

                          {order.items && order.items.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {order.items.map(item => (
                                <div key={item.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 flex items-center justify-between text-xs">
                                  <span className="font-semibold text-slate-800 dark:text-zinc-200 truncate pr-2">
                                    {item.description}
                                  </span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-white/10 text-[11px] font-bold text-slate-700 dark:text-zinc-300">
                                      {item.quantity}x
                                    </span>
                                    {canSeeFinancials && (
                                      <span className="font-bold text-slate-900 dark:text-white">
                                        R$ {Number(item.total_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs italic text-slate-400 dark:text-zinc-500 p-2">Sem descrição individual de itens.</p>
                          )}
                        </div>

                        {/* Caixa de Observações Especiais do Cliente */}
                        {cleanNotes && (
                          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-1">
                            <p className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              📝 Observações / Instruções:
                            </p>
                            <p className="text-xs font-medium text-amber-800 dark:text-amber-300 leading-relaxed whitespace-pre-wrap">
                              {cleanNotes}
                            </p>
                          </div>
                        )}

                        {/* Miniaturas de Anexos (se houver) */}
                        {hasAttachments && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                              📎 Imagens / Anexos do Cliente:
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              {(metadata?.attachmentUrls || []).map((url: string, i: number) => (
                                <a
                                  key={i}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="h-16 w-16 rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden hover:scale-105 transition-all shadow-xs block group relative"
                                >
                                  <img src={url} alt="Anexo" className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <ExternalLink className="h-4 w-4 text-white" />
                                  </div>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* BARRA DE AÇÕES DO CARD EXPANDIDO */}
                        <div className="pt-3 border-t border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                             {/* Botão de Orçar se for Entrada Rápida sem Preço (Salto Sutil na Cor Padrão) */}
                            {isQuickEntryWithoutPrice && (
                              <button
                                type="button"
                                onClick={() => {
                                  setInitialOrderData({
                                    orderId: order.id,
                                    clientId: order.client_id,
                                    matrixName: cleanNotes,
                                    quantity: order.items?.[0]?.quantity || 1
                                  });
                                  setIsCreateModalOpen(true);
                                }}
                                className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer animate-subtle-bounce active:scale-95"
                              >
                                ⚡ Orçar Pedido Agora
                              </button>
                            )}

                            {/* Botão de Cobrança Automática (Gabi / Evolution API) */}
                            <button
                              type="button"
                              onClick={(e) => handleCobrarPedido(order, e)}
                              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:opacity-90 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-orange-500/20 cursor-pointer active:scale-95"
                            >
                              ⚡ Cobrar Cliente (Gabi)
                            </button>

                            {/* Botões de Ação Compactos (Ver, Imprimir) */}
                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200 dark:border-white/10">
                              <button
                                type="button"
                                onClick={() => setSelectedOrderForDetails(order)}
                                className="p-2 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-white dark:hover:bg-white/10 transition-all"
                                title="Ver Detalhes Completos"
                              >
                                <Eye className="h-4 w-4" />
                              </button>

                              {role === 'chefe' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedOrderForVisibilityModal(order);
                                  }}
                                  className={`p-2 rounded-lg border transition-all ${
                                    order.visible_profile_ids && order.visible_profile_ids.length > 0
                                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20'
                                      : 'border-transparent text-slate-600 dark:text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-white dark:hover:bg-white/10'
                                  }`}
                                  title="Configurar Visibilidade do Pedido"
                                >
                                  {order.visible_profile_ids && order.visible_profile_ids.length > 0 ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </button>
                              )}

                              {activePrintOption === order.id ? (
                                <div className="flex items-center gap-1 bg-indigo-500/10 rounded-lg p-0.5 animate-in zoom-in-95 duration-200">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handlePrintPDF(order); setActivePrintOption(null); }}
                                    className="px-2 py-1.5 rounded-md text-indigo-700 dark:text-indigo-300 hover:bg-white dark:hover:bg-indigo-500/20 text-[10px] font-bold flex items-center gap-1 transition-colors"
                                    title="Imprimir A4 (PDF)"
                                  >
                                    <FileText className="h-3 w-3" /> A4
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handlePrintThermal(order); setActivePrintOption(null); }}
                                    className="px-2 py-1.5 rounded-md text-indigo-700 dark:text-indigo-300 hover:bg-white dark:hover:bg-indigo-500/20 text-[10px] font-bold flex items-center gap-1 transition-colors"
                                    title="Imprimir Cupom Térmico (80mm)"
                                  >
                                    <Printer className="h-3 w-3" /> Bobina
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setActivePrintOption(null); }}
                                    className="px-1.5 py-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
                                  >
                                    ×
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setActivePrintOption(order.id); }}
                                  className="p-2 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-white/10 transition-all"
                                  title="Opções de Impressão"
                                >
                                  <Printer className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Botão de Excluir (Apenas perfil Chefe / Unlocked) */}
                          {isUnlocked && (
                            <button
                              type="button"
                              onClick={() => handleDeleteOrder(order.id)}
                              className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Excluir Pedido"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* Conteúdo da Aba 2: Fila Kanban Operacional */}
      {activeTab === 'kanban' && (
        <div className="animate-in fade-in duration-200">
          <PedidosKanban 
            onOpenDetails={(order) => setSelectedOrderForDetails(order)}
            onQuickPrice={(orderData) => {
              const { cleanNotes } = parsePaymentMetadata(orderData.notes);
              setInitialOrderData({
                orderId: orderData.id,
                clientId: orderData.client_id,
                matrixName: cleanNotes,
                quantity: orderData.items?.[0]?.quantity || 1
              });
              setIsCreateModalOpen(true);
            }}
          />
        </div>
      )}

      {/* Modal de Criação de Pedido */}
      <CreateOrderModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setInitialOrderData(null);
        }}
        initialData={initialOrderData}
        onOrderCreated={fetchOrders}
      />

      {/* Modal de Status do Pagamento */}
      <PaymentStatusModal
        isOpen={!!selectedOrderForStatus}
        onClose={() => setSelectedOrderForStatus(null)}
        order={selectedOrderForStatus}
        onStatusUpdated={fetchOrders}
      />

      {/* Modal de Detalhes da Ordem de Serviço / Gerador de PDF */}
      <OrderDetailsModal
        isOpen={!!selectedOrderForDetails}
        onClose={() => setSelectedOrderForDetails(null)}
        order={selectedOrderForDetails}
        onDelete={handleDeleteOrder}
        onPriceOrder={(orderToPrice) => {
          const { cleanNotes } = parsePaymentMetadata(orderToPrice.notes);
          setInitialOrderData({
            orderId: orderToPrice.id,
            clientId: orderToPrice.client_id,
            matrixName: cleanNotes,
            quantity: orderToPrice.items?.[0]?.quantity || 1
          });
          setSelectedOrderForDetails(null);
          setIsCreateModalOpen(true);
        }}
        onEditOrder={(orderToEdit) => {
          setInitialOrderData({
            orderId: orderToEdit.id,
            clientId: orderToEdit.client_id,
            fullOrder: orderToEdit
          });
          setSelectedOrderForDetails(null);
          setIsCreateModalOpen(true);
        }}
        onOrderUpdated={(updatedOrder) => {
          if (updatedOrder) {
            setSelectedOrderForDetails(updatedOrder);
          }
          fetchOrders();
        }}
      />

      {/* Modal de Cobrança Inteligente WhatsApp */}
      <CollectionActionModal
        isOpen={!!selectedOrderForCobrar}
        onClose={() => setSelectedOrderForCobrar(null)}
        order={selectedOrderForCobrar}
        onMessageSent={fetchOrders}
      />

      {/* Modal de Configuração de Visibilidade por Perfil */}
      <OrderVisibilityModal
        isOpen={!!selectedOrderForVisibilityModal}
        onClose={() => setSelectedOrderForVisibilityModal(null)}
        order={selectedOrderForVisibilityModal}
        customProfiles={customProfiles}
        onSaved={fetchOrders}
      />
    </div>
  );
};

// Componente do Modal de Visibilidade (Ajustado para Modo Claro/Escuro Dinâmico)
interface OrderVisibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  customProfiles: any[];
  onSaved: () => void;
}

const OrderVisibilityModal: React.FC<OrderVisibilityModalProps> = ({
  isOpen,
  onClose,
  order,
  customProfiles,
  onSaved
}) => {
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (order && isOpen) {
      if (order.visible_profile_ids && order.visible_profile_ids.length > 0) {
        setSelectedProfiles(order.visible_profile_ids);
      } else {
        // Por padrão todos têm acesso se não houver restrição configurada
        setSelectedProfiles(customProfiles.map(p => p.id));
      }
    }
  }, [order, isOpen, customProfiles]);

  if (!isOpen || !order) return null;

  const handleToggleProfile = (profileId: string) => {
    setSelectedProfiles(prev =>
      prev.includes(profileId)
        ? prev.filter(id => id !== profileId)
        : [...prev, profileId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const allSelected = customProfiles.every(p => selectedProfiles.includes(p.id));
      const payload = allSelected ? null : selectedProfiles;

      const { error } = await supabase
        .from('orders')
        .update({ visible_profile_ids: payload })
        .eq('id', order.id);

      if (error) throw error;
      toast.success('Visibilidade do pedido atualizada!');
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar configurações de visibilidade.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="relative w-full max-w-sm rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#12121a] p-6 shadow-2xl space-y-4 text-slate-800 dark:text-zinc-100">
        <div>
          <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
            👁️ Visibilidade do Pedido
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
            Selecione quais perfis podem visualizar o pedido #{order.order_number || order.id.slice(0, 4)}:
          </p>
        </div>

        <div className="space-y-2.5 max-h-[240px] overflow-y-auto pr-1">
          {customProfiles.map(p => {
            const isChefe = p.id === 'chefe';
            const isChecked = isChefe || selectedProfiles.includes(p.id);

            return (
              <div 
                key={p.id}
                className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                  isChecked
                    ? 'bg-purple-500/5 dark:bg-purple-500/10 border-purple-500/40 text-purple-600 dark:text-purple-400 font-extrabold'
                    : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5 text-slate-600 dark:text-zinc-400'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm">{p.icon || '👤'}</span>
                  <div className="text-left">
                    <p className="text-xs font-bold">{p.name}</p>
                    <p className="text-[9px] text-slate-500 dark:text-zinc-500 font-medium">
                      {isChefe ? 'Acesso Administrativo' : 'Acesso a Producao / Kanban'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isChefe}
                  onClick={() => handleToggleProfile(p.id)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isChecked ? 'bg-purple-600' : 'bg-slate-200 dark:bg-zinc-800'
                  } ${isChefe ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      isChecked ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-300 transition-all cursor-pointer border border-slate-200 dark:border-transparent"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition-all shadow-lg shadow-purple-500/20 cursor-pointer"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

