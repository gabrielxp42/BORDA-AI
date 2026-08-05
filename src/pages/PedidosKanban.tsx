import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingBag, Play, Package, Lock, Printer, Send, FileText, 
  Building, Phone, AlertTriangle, Calendar, Zap, Download, 
  CheckCircle2, Clock, Eye, EyeOff, Plus, MessageCircle 
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { parsePaymentMetadata, formatOrderPaymentBadgeDetails, getDueDateAlertInfo } from '@/utils/paymentHelper';
import { printOrderReceipt } from '@/services/pdfGenerator';
import { printThermalReceipt } from '@/services/thermalPrinter';
import { sendEvolutionText, getWhatsAppWebLink, handleWhatsAppDispatchError } from '@/services/whatsappService';
import { useBackgroundTasks } from '@/hooks/useBackgroundTasks';
import { KanbanAddOrderModal } from '@/components/orders/KanbanAddOrderModal';
import { PaymentStatusModal } from '@/components/orders/PaymentStatusModal';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

interface OrderItem {
  id: string;
  description: string;
  quantity: number;
  unit_price?: number;
  total_price?: number;
}

interface KanbanOrder {
  id: string;
  order_number?: number;
  client_id: string;
  status: string;
  payment_status?: string;
  payment_method?: string;
  total_amount: number;
  due_date?: string;
  notes: string;
  created_at: string;
  client?: {
    id?: string;
    name?: string;
    phone?: string;
    company_name?: string;
  };
  items: OrderItem[];
}

interface PedidosKanbanProps {
  onOpenDetails?: (order: any) => void;
  onQuickPrice?: (order: any) => void;
}

const columns = [
  { id: 'pending', title: 'Pendente', color: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10' },
  { id: 'design', title: 'Criação de Matriz', color: 'border-blue-500/30 text-blue-400 bg-blue-500/10' },
  { id: 'embroidering', title: 'Na Máquina', color: 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10' },
  { id: 'finishing', title: 'Acabamento', color: 'border-purple-500/30 text-purple-400 bg-purple-500/10' },
  { id: 'completed', title: 'Pronto p/ Retirada', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' },
];

export const PedidosKanban: React.FC<PedidosKanbanProps> = ({
  onOpenDetails,
  onQuickPrice
}) => {
  const [orders, setOrders] = useState<KanbanOrder[]>([]);
  const ordersRef = useRef<KanbanOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePrintOption, setActivePrintOption] = useState<string | null>(null);
  const [selectedOrderForPaymentModal, setSelectedOrderForPaymentModal] = useState<any | null>(null);
  const [selectedOrderForVisibilityModal, setSelectedOrderForVisibilityModal] = useState<KanbanOrder | null>(null);
  const [visibleLimits, setVisibleLimits] = useState<Record<string, number>>({});
  const [kanbanNotificationsEnabled, setKanbanNotificationsEnabled] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('kanban_notifications_enabled');
    return saved ? JSON.parse(saved) : { design: false, embroidering: false, finishing: false, completed: true };
  });

  // Mantém ref atualizada para evitar estado obsoleto no envio de notificações
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('kanban_notifications_enabled', JSON.stringify(kanbanNotificationsEnabled));
  }, [kanbanNotificationsEnabled]);
  const { isUnlocked, role, customProfiles } = useProfile();
  const { settings } = useCompanySettings();
  const { profile } = useAuth();
  
  const canViewPrices = profile?.can_view_prices !== false;
  const formatPrice = (val: number) => canViewPrices ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val) : 'R$ ***';

  useEffect(() => {
    fetchOrders();
    
    const channel = supabase
      .channel('schema-db-changes-kanban')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchOrders = async () => {
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

      // Filtra itens apenas dos pedidos deste usuário (evita puxar tabela inteira)
      const orderIds = (ordersData || []).map((o: any) => o.id);
      const { data: itemsData, error: itemsError } = orderIds.length > 0
        ? await supabase
            .from('order_items')
            .select('id, order_id, description, quantity, unit_price, total_price')
            .in('order_id', orderIds)
        : { data: [], error: null };

      if (itemsError) throw itemsError;

      const formattedOrders: KanbanOrder[] = (ordersData || []).map((o: any) => ({
        ...o,
        client: o.clients,
        items: itemsData?.filter(i => i.order_id === o.id) || []
      }));

      setOrders(formattedOrders);
    } catch (error) {
      console.error("Erro ao buscar pedidos do Kanban:", error);
    } finally {
      setLoading(false);
    }
  };

  const moveOrder = async (orderId: string, newStatus: string) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));

    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;

      // Automated WhatsApp Notification logic (usa ref para evitar estado obsoleto)
      const orderToNotify = ordersRef.current.find(o => o.id === orderId);
      const phone = orderToNotify?.client?.phone;
      const clientName = orderToNotify?.client?.name || 'Cliente';
      const orderCode = orderToNotify?.order_number || orderToNotify?.id?.slice(0, 4) || '';
      
      if (phone && newStatus !== 'pending' && kanbanNotificationsEnabled[newStatus]) {
        const templates: Record<string, string> = {
            design: `Olá, ${clientName}! Seu pedido #${orderCode} entrou em fase de Criação de Matriz. 🎨`,
            embroidering: `Boas notícias, ${clientName}! Seu pedido #${orderCode} está na Máquina sendo bordado. 🧵`,
            finishing: `Olá, ${clientName}! Seu pedido #${orderCode} está no acabamento final. ✂️`,
            completed: `Parabéns, ${clientName}! Seu pedido #${orderCode} está PRONTO para retirada/envio. ✅`
        };
        const message = templates[newStatus];
        if (message) {
          sendEvolutionText(phone, message).then(() => {
             toast.success(`Notificação enviada para ${clientName}!`);
          }).catch(err => {
            console.error("Falha ao enviar notificação automática:", err);
            toast.error(`Falha ao notificar ${clientName}. Verifique a conexão WhatsApp.`);
          });
        }
      }

    } catch (err) {
      console.error("Erro ao mover pedido:", err);
      fetchOrders();
    }
  };

  const handlePrintPDF = (order: KanbanOrder) => {
    printOrderReceipt({
      id: order.id,
      createdAt: order.created_at,
      dueDate: order.due_date,
      clientName: order.client?.name || 'Cliente',
      clientPhone: order.client?.phone,
      clientCompany: order.client?.company_name,
      paymentStatus: (order.payment_status as 'pending' | 'half_paid' | 'paid') || 'pending',
      paymentMethod: order.payment_method,
      totalAmount: order.total_amount || 0,
      notes: order.notes,
      items: (order.items || []).map(it => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unit_price || 0,
        totalPrice: it.total_price || 0
      })),
      companyName: settings.systemName,
      companyColor: settings.primaryColor,
      canSeeFinancials: canViewPrices,
    });
  };

  const handlePrintThermal = (order: KanbanOrder) => {
    printThermalReceipt({
      id: order.id,
      createdAt: order.created_at,
      dueDate: order.due_date,
      clientName: order.client?.name || 'Cliente',
      clientPhone: order.client?.phone,
      clientCompany: order.client?.company_name,
      paymentStatus: (order.payment_status as 'pending' | 'half_paid' | 'paid') || 'pending',
      paymentMethod: order.payment_method,
      totalAmount: order.total_amount || 0,
      notes: order.notes,
      items: (order.items || []).map(it => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unit_price || 0,
        totalPrice: it.total_price || 0
      })),
      companyName: settings.systemName
    }, canViewPrices);
  };

  const handleSendWhatsApp = async (order: KanbanOrder) => {
    const phone = order.client?.phone;
    const clientName = order.client?.name || 'Cliente';
    if (!phone) {
      toast.error('Este cliente não possui WhatsApp cadastrado.');
      return;
    }

    const { addTask, updateTask, updateStep } = useBackgroundTasks.getState();

    const cleanDescription = (desc: string) => {
      return desc
        .replace(/\s*\(\s*\d+([\.,]\d+)?\s*(pts|pontos|ponto|p)\s*,\s*\d+\s*(cores|cor|c)\s*\)/gi, '')
        .replace(/\s*\(\s*\d+\s*(cores|cor|c)\s*,\s*\d+([\.,]\d+)?\s*(pts|pontos|ponto|p)\s*\)/gi, '')
        .replace(/\s*\(\s*\d+([\.,]\d+)?\s*(pts|pontos|ponto|p)\s*\)/gi, '')
        .replace(/\s*\(\s*\d+\s*(cores|cor|c)\s*\)/gi, '')
        .trim();
    };

    const itemsSummary = order.items?.map((it: any) => `- ${cleanDescription(it.description)} (${it.quantity}x)`).join('\n') || '';
    const text = `*Ficha do Pedido #${order.order_number || order.id.slice(0, 6)} - ${settings.systemName}* 🧵✨\n\n` +
      `Olá, *${clientName}*! Seguem os detalhes do seu pedido:\n\n` +
      `*Cliente:* ${clientName}\n` +
      `*Status:* ${order.payment_status === 'paid' ? 'Pago (100%)' : order.payment_status === 'half_paid' ? 'Sinal (50%)' : 'Pendente'}\n\n` +
      `*Itens:* \n${itemsSummary}\n\n` +
      `*Valor Total:* R$ ${Number(order.total_amount || 0).toFixed(2)}`;

    const taskId = addTask({
      title: `Ficha Pedido #${order.order_number || order.id.slice(0, 4)}`,
      description: `Enviando para ${clientName}...`,
      status: 'processing',
      progress: 25,
      steps: [
        { id: 'prep', label: 'Gerando Resumo', status: 'completed' },
        { id: 'send', label: 'Conectando Evolution API', status: 'loading' },
        { id: 'done', label: 'Envio WhatsApp', status: 'pending' },
      ]
    });

    const toastId = toast.loading(`Enviando ficha do pedido para ${clientName} via WhatsApp...`);

    try {
      updateStep(taskId, 'send', 'completed');
      updateStep(taskId, 'done', 'loading');
      updateTask(taskId, { progress: 65, status: 'sending' });

      await sendEvolutionText(phone, text);

      const webLink = getWhatsAppWebLink(phone, text);

      updateStep(taskId, 'done', 'completed');
      updateTask(taskId, {
        progress: 100,
        status: 'completed',
        description: `Enviado com sucesso para ${clientName}!`
      });

      toast.success(`⚡ Ficha enviada via Evolution API para ${clientName}!`, { 
        id: toastId,
        duration: 6000,
        action: {
          label: "Abrir WhatsApp Web",
          onClick: () => window.open(webLink, '_blank')
        }
      });
    } catch (evoErr: any) {
      console.warn('Falha no envio direto via Evolution API:', evoErr);
      updateTask(taskId, {
        status: 'error',
        progress: 100,
        error: evoErr.message || 'Falha no envio direto'
      });

      handleWhatsAppDispatchError(evoErr, phone, text, toastId);
    }
  };

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    
    // Se soltou no mesmo lugar (mesma coluna e mesma posição)
    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      return;
    }

    if (destination.droppableId !== source.droppableId) {
      moveOrder(draggableId, destination.droppableId);
    }
  };

  const [addModalColumn, setAddModalColumn] = useState<{ id: string; title: string } | null>(null);

  const assignOrderToColumn = async (orderId: string, columnId: string) => {
    moveOrder(orderId, columnId);
  };

  return (
    <>
      {addModalColumn && (
        <KanbanAddOrderModal
          isOpen={!!addModalColumn}
          onClose={() => setAddModalColumn(null)}
          targetColumnId={addModalColumn.id}
          targetColumnTitle={addModalColumn.title}
          onOrderAssigned={assignOrderToColumn}
          onOpenQuickOrder={() => {
            if (onQuickPrice) {
              onQuickPrice({ status: addModalColumn.id });
            }
          }}
        />
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="space-y-4 h-full flex flex-col">
          <div className="flex gap-4 flex-1 pb-6 overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent -mx-2 px-2 md:-mx-4 md:px-4">
            {columns.map((col) => {
              const colOrders = orders.filter((o) => {
                if (o.status !== col.id) return false;
                // O Chefe sempre visualiza todos os pedidos
                if (role === 'chefe') return true;
                // Se o pedido tiver restrição de visibilidade e o subperfil atual não estiver incluído, oculta
                if (o.visible_profile_ids && o.visible_profile_ids.length > 0) {
                  return o.visible_profile_ids.includes(role);
                }
                return true;
              });
              return (
                <Droppable droppableId={col.id} key={col.id}>
                  {(provided: any, snapshot: any) => (
                    <div 
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`glass-panel p-3 md:p-4 rounded-3xl space-y-3 flex flex-col min-h-[200px] md:min-h-[520px] transition-colors w-[300px] min-w-[300px] md:flex-1 md:min-w-[260px] md:max-w-[380px] ${snapshot.isDraggingOver ? 'bg-white/5 border-purple-500/30' : ''}`}
                    >
                      {/* Disjuntor de Automação WhatsApp (não renderiza na coluna Pendente) */}
                      {col.id !== 'pending' && (
                      <div className="flex items-center justify-between mb-3 px-3 py-2 bg-black/40 rounded-xl border border-white/5">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Automação Zap</span>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const newState = { ...kanbanNotificationsEnabled, [col.id]: !kanbanNotificationsEnabled[col.id] };
                                setKanbanNotificationsEnabled(newState);
                            }}
                            className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors duration-300 focus:outline-none ${
                                kanbanNotificationsEnabled[col.id] ? 'bg-emerald-500' : 'bg-zinc-600'
                            }`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
                                kanbanNotificationsEnabled[col.id] ? 'translate-x-5.5' : 'translate-x-0.5'
                            }`} />
                        </button>
                      </div>
                      )}

                      {/* Cabeçalho da Coluna com Botão + */}
                      <div className={`p-2.5 rounded-2xl border text-xs font-black uppercase tracking-wider flex items-center justify-between transition-colors ${col.color} ${snapshot.isDraggingOver ? 'shadow-lg shadow-purple-500/10' : ''}`}>
                        <div className="flex items-center gap-2">
                          <span>{col.title}</span>
                          <span className="h-5 w-5 rounded-full bg-white/10 flex items-center justify-center text-[10px]">
                            {colOrders.length}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAddModalColumn({ id: col.id, title: col.title })}
                          className="h-6 w-6 rounded-lg bg-white/10 hover:bg-white/20 text-current flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                          title={`Adicionar pedido em ${col.title}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pt-1 pb-4 pr-1">
                        {loading ? (
                          <div className="h-32 flex items-center justify-center text-zinc-500 text-xs font-medium">Carregando...</div>
                        ) : colOrders.length === 0 ? (
                          <div className="h-32 flex flex-col items-center justify-center text-center p-3 border border-dashed border-white/10 rounded-2xl space-y-2">
                            <span className="text-xs text-zinc-500 italic">Nenhum pedido nesta etapa</span>
                            <button
                              type="button"
                              onClick={() => setAddModalColumn({ id: col.id, title: col.title })}
                              className="px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                            >
                              <Plus className="h-3.5 w-3.5" /> Adicionar Pedido
                            </button>
                          </div>
                        ) : (
                        (() => {
                          const limit = visibleLimits[col.id] || 10;
                          const visibleOrders = colOrders.slice(0, limit);
                          return (
                            <>
                              {visibleOrders.map((ord, index) => {
                                const { cleanNotes, metadata } = parsePaymentMetadata(ord.notes);
                          const isUnpriced = metadata.isQuickEntry || ord.total_amount === 0;

                          // O pedido fica semi-transparente para o Chefe se tiver visibilidade restrita
                          const isRestricted = ord.visible_profile_ids && ord.visible_profile_ids.length > 0;

                          return (
                            <Draggable key={ord.id} draggableId={ord.id} index={index}>
                              {(provided: any, snapshot: any) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  onClick={() => onOpenDetails && onOpenDetails(ord)}
                                  className={`glass-card p-4 rounded-2xl space-y-3 relative group border border-white/10 cursor-pointer transition-all select-none ${
                                    isRestricted ? 'opacity-60 hover:opacity-85' : ''
                                  } ${
                                    snapshot.isDragging 
                                      ? 'shadow-[0_30px_80px_rgba(139,92,246,0.25)] scale-105 border-purple-500/50 rotate-1 z-50 ring-2 ring-purple-500/30' 
                                      : 'hover:border-purple-500/40 hover:scale-[1.01] hover:shadow-lg hover:shadow-purple-500/5 shadow-md'
                                  }`}
                                  style={{
                                    ...provided.draggableProps.style,
                                    touchAction: 'none',
                                  }}
                                >
                        {/* Header do Card no Kanban */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className={`h-8 w-8 rounded-xl border flex items-center justify-center shrink-0 font-black text-[11px] ${
                              isUnpriced
                                ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                                : 'bg-white/5 border-white/10 text-white'
                            }`}>
                              #{ord.order_number || ord.id.slice(0, 4)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs font-bold text-white truncate" title={ord.client?.name}>
                                {ord.client?.name || 'Cliente'}
                              </h4>
                              <p className="text-[10px] text-zinc-400 truncate flex items-center gap-1">
                                <Building className="h-2.5 w-2.5 shrink-0" /> <span className="truncate">{ord.client?.company_name || 'Particular'}</span>
                              </p>
                              {(() => {
                                const dueDateInfo = getDueDateAlertInfo(ord.due_date, ord.status);
                                if (!dueDateInfo) return null;
                                return (
                                  <div className="mt-1">
                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] uppercase border ${dueDateInfo.badgeClass}`}>
                                      {dueDateInfo.label}
                                    </span>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Preço / Tag de Pagamento */}
                          <div className="text-right shrink-0 ml-1">
                            {isUnlocked ? (
                              ord.total_amount > 0 ? (
                                <span className="text-xs font-black text-emerald-400 block">
                                  {formatPrice(ord.total_amount)}
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-amber-400 block">Aguardando</span>
                              )
                            ) : null}

                            {/* Badge de Status de Pagamento (CLICÁVEL COM DETALHES DE VALOR E MÉTODO) */}
                            {(() => {
                              if (isUnpriced) {
                                return (
                                  <span 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedOrderForPaymentModal(ord);
                                    }}
                                    className="inline-block mt-0.5 animate-pulse px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30 cursor-pointer hover:scale-105 transition-transform"
                                    title="Clique para lançar orçamento/pagamento"
                                  >
                                    ⚠️ Sem Orçamento
                                  </span>
                                );
                              }

                              const details = formatOrderPaymentBadgeDetails(ord.payment_status, ord.total_amount, ord.notes, ord.payment_method);

                              if (details.status === 'paid') {
                                return (
                                  <span 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedOrderForPaymentModal(ord);
                                    }}
                                    className="inline-block mt-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-pointer hover:scale-105 transition-transform"
                                    title={`${details.fullLabel}. Clique para alterar.`}
                                  >
                                    {details.shortLabel}
                                  </span>
                                );
                              }

                              if (details.status === 'half_paid') {
                                return (
                                  <span 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedOrderForPaymentModal(ord);
                                    }}
                                    className="inline-block mt-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 cursor-pointer hover:scale-105 transition-transform"
                                    title={`${details.fullLabel}. Clique para alterar.`}
                                  >
                                    {details.shortLabel}
                                  </span>
                                );
                              }

                              return (
                                <span 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedOrderForPaymentModal(ord);
                                  }}
                                  className="inline-block mt-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase bg-orange-500/20 text-orange-400 border border-orange-500/30 cursor-pointer hover:scale-105 transition-transform"
                                  title="Aguardando pagamento. Clique para lançar."
                                >
                                  {details.shortLabel}
                                </span>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Itens do Bordado */}
                        {ord.items && ord.items.length > 0 && (
                          <div className="bg-black/30 p-2 rounded-xl space-y-1 border border-white/5">
                            {ord.items.slice(0, 2).map((item, idx) => (
                              <div key={idx} className="flex items-center gap-1.5 text-[10px] text-zinc-300">
                                <Package className="h-3 w-3 text-purple-400 shrink-0" />
                                <span className="font-bold text-white shrink-0">{item.quantity}x</span>
                                <span className="truncate text-zinc-300">{item.description}</span>
                              </div>
                            ))}
                            {ord.items.length > 2 && (
                              <div className="text-[9px] text-zinc-500 italic pl-4">
                                + {ord.items.length - 2} itens adicionais
                              </div>
                            )}
                          </div>
                        )}

                        {/* Observações / Descrição da Matriz */}
                        {cleanNotes && (
                          <p className="text-[10px] text-zinc-400 italic border-l-2 border-purple-500/40 pl-2 line-clamp-2">
                            "{cleanNotes}"
                          </p>
                        )}

                        {/* Botão de Orçar em Destaque (Salto Sutil) */}
                        {isUnpriced && onQuickPrice && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onQuickPrice(ord);
                            }}
                            className="w-full py-1.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all animate-subtle-bounce active:scale-95 cursor-pointer"
                          >
                            ⚡ Orçar Pedido Agora
                          </button>
                        )}

                        {/* BARRA DE ATALHOS RÁPIDOS DO CARD DO KANBAN */}
                        <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1">
                            {/* Atalho 1: Ficha / Detalhes */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenDetails && onOpenDetails(ord);
                              }}
                              title="Abrir Ficha do Pedido & Detalhes"
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white border border-white/10 transition-colors"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </button>

                            {/* Atalho 2: Imprimir Recibo */}
                            {activePrintOption === ord.id ? (
                              <div className="flex items-center gap-1 bg-white/10 rounded-lg p-0.5 animate-in zoom-in-95 duration-200">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePrintPDF(ord);
                                    setActivePrintOption(null);
                                  }}
                                  className="px-1.5 py-1 rounded-md text-zinc-300 hover:bg-white/20 hover:text-white text-[9px] font-bold flex items-center gap-1 transition-colors"
                                  title="Imprimir A4 (PDF)"
                                >
                                  <FileText className="h-2.5 w-2.5" /> A4
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePrintThermal(ord);
                                    setActivePrintOption(null);
                                  }}
                                  className="px-1.5 py-1 rounded-md text-zinc-300 hover:bg-white/20 hover:text-white text-[9px] font-bold flex items-center gap-1 transition-colors"
                                  title="Imprimir Cupom Térmico (80mm)"
                                >
                                  <Printer className="h-2.5 w-2.5" /> Bobina
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActivePrintOption(null);
                                  }}
                                  className="px-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                                >
                                  ×
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActivePrintOption(ord.id);
                                }}
                                title="Imprimir Recibo do Pedido"
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white border border-white/10 transition-colors"
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {/* Atalho 3: Enviar WhatsApp */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSendWhatsApp(ord);
                              }}
                              title="Enviar Ficha via WhatsApp"
                              className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors"
                            >
                              <Send className="h-3.5 w-3.5" />
                            </button>

                            {/* Atalho 4: Visibilidade por perfil (Somente Chefe) */}
                            {role === 'chefe' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedOrderForVisibilityModal(ord);
                                }}
                                title="Configurar Visibilidade do Pedido"
                                className={`p-1.5 rounded-lg border transition-colors ${
                                  ord.visible_profile_ids && ord.visible_profile_ids.length > 0
                                    ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30'
                                    : 'bg-white/5 hover:bg-white/15 text-zinc-300 border-white/10'
                                }`}
                              >
                                {ord.visible_profile_ids && ord.visible_profile_ids.length > 0 ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                          </div>

                          {/* Avançar Status no Kanban */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const nextStatusMap: Record<string, string> = {
                                  pending: 'design',
                                  design: 'embroidering',
                                  embroidering: 'finishing',
                                  finishing: 'completed',
                                  completed: 'pending',
                                };
                                moveOrder(ord.id, nextStatusMap[ord.status]);
                              }}
                              className="text-[10px] font-bold px-2 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1 transition-all active:scale-95 whitespace-nowrap"
                            >
                            <Play className="h-3 w-3 fill-purple-300" /> {ord.status === 'completed' ? 'Reiniciar' : 'Avançar'}
                                  </button>
                                </div>

                              {/* RODAPÉ DO CARD: BADGE INTEGRADO DE STATUS DE PRODUÇÃO EM LARGURA TOTAL */}
                              <div className={`-mx-4 -mb-4 mt-3 px-3.5 py-2 border-t rounded-b-2xl flex items-center justify-between text-[10px] font-black uppercase tracking-wide ${col.color}`}>
                                <span className="flex items-center gap-1.5 truncate">
                                  <span className="h-2 w-2 rounded-full bg-current animate-pulse shrink-0" />
                                  <span className="truncate">Etapa: {col.title}</span>
                                </span>
                                <div className="flex items-center gap-2 shrink-0 text-[9px] font-bold opacity-90">
                                  {ord.created_at && (
                                    <span title="Data de Entrada na oficina">
                                      Entrada: {format(new Date(ord.created_at), 'dd/MM')}
                                    </span>
                                  )}
                                  {ord.due_date && (
                                    <span className="text-amber-400 font-extrabold" title="Data de Entrega / Prazo">
                                      Entrega: {format(new Date(ord.due_date), 'dd/MM')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                          );
                        })}
                        {colOrders.length > (visibleLimits[col.id] || 10) && (
                          <button 
                            type="button"
                            onClick={() => setVisibleLimits(prev => ({ ...prev, [col.id]: (prev[col.id] || 10) + 10 }))}
                            className="w-full py-2 mt-2 text-[10px] font-bold text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition-colors"
                          >
                            Ver mais {colOrders.length - (visibleLimits[col.id] || 10)} pedidos
                          </button>
                        )}
                        </>
                      );
                      })()
                    )}
                    {provided.placeholder}
                  </div>
                </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </div>
      </DragDropContext>

      {/* Modal Reutilizável de Status de Pagamento (PIX, Dinheiro, Cartão + Notificação Zap) */}
      <PaymentStatusModal
        isOpen={!!selectedOrderForPaymentModal}
        onClose={() => setSelectedOrderForPaymentModal(null)}
        order={selectedOrderForPaymentModal}
        onStatusUpdated={fetchOrders}
      />

      {/* Modal de Configuração de Visibilidade por Perfil */}
      <OrderVisibilityModal
        isOpen={!!selectedOrderForVisibilityModal}
        onClose={() => setSelectedOrderForVisibilityModal(null)}
        order={selectedOrderForVisibilityModal}
        customProfiles={customProfiles}
        onSaved={fetchOrders}
      />
    </>
  );
};

// Componente do Modal de Visibilidade
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
