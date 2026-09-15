import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingBag, Play, Package, Lock, Printer, Send, FileText, 
  Building, Phone, AlertTriangle, Calendar, Zap, Download, 
  CheckCircle2, Clock, Eye, EyeOff, Plus, MessageCircle, Search, X
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { printOrderReceipt } from '@/services/pdfGenerator';
import { printThermalReceipt } from '@/services/thermalPrinter';
import { sendEvolutionText, getWhatsAppWebLink, handleWhatsAppDispatchError } from '@/services/whatsappService';
import { useBackgroundTasks } from '@/hooks/useBackgroundTasks';
import { KanbanAddOrderModal } from '@/components/orders/KanbanAddOrderModal';
import { PaymentStatusModal } from '@/components/orders/PaymentStatusModal';
import { KanbanCard } from '@/components/orders/KanbanCard';
import { KanbanColumn } from '@/components/orders/KanbanColumn';
import {
  KanbanColumnConfig,
  DEFAULT_KANBAN_COLUMNS,
  ARCHIVE_AFTER_DAYS,
  loadKanbanColumns,
  saveKanbanColumns,
  isArchived,
} from '@/services/kanbanColumnsService';
import { parsePaymentMetadata, serializePaymentMetadata } from '@/utils/paymentHelper';
import { toast } from 'sonner';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';

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
  /** Perfis autorizados a ver o pedido; vazio/ausente = visível para todos. */
  visible_profile_ids?: string[];
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

/** Ordem de avanço das filas — derivada da configuração, para o botão "Avançar". */
const buildNextStatusMap = (cols: KanbanColumnConfig[]): Record<string, string> => {
  const map: Record<string, string> = {};
  cols.forEach((c, i) => {
    map[c.id] = cols[i + 1]?.id || cols[0].id;
  });
  return map;
};

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
  const [columns, setColumns] = useState<KanbanColumnConfig[]>(DEFAULT_KANBAN_COLUMNS);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [kanbanNotificationsEnabled, setKanbanNotificationsEnabled] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('kanban_notifications_enabled');
    return saved ? JSON.parse(saved) : { design: false, embroidering: false, finishing: false, completed: true };
  });
  const notificationsEnabledRef = useRef(kanbanNotificationsEnabled);

  // Mantém ref atualizada para evitar estado obsoleto no envio de notificações
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  // Filas vindas do Supabase (valem em todos os aparelhos)
  useEffect(() => {
    loadKanbanColumns().then(setColumns);
  }, []);

  const handleRenameColumn = async (columnId: string) => {
    const novo = editingTitle.trim();
    setEditingColumnId(null);
    if (!novo) return;

    const atualizadas = columns.map(c => (c.id === columnId ? { ...c, title: novo } : c));
    setColumns(atualizadas);

    const naNuvem = await saveKanbanColumns(atualizadas);
    if (naNuvem) {
      toast.success(`Fila renomeada para "${novo}" em todos os aparelhos.`);
    } else {
      toast.warning(`Fila renomeada só neste aparelho. Rode supabase/01_kanban_columns.sql para sincronizar.`);
    }
  };

  useEffect(() => {
    notificationsEnabledRef.current = kanbanNotificationsEnabled;
    localStorage.setItem('kanban_notifications_enabled', JSON.stringify(kanbanNotificationsEnabled));
  }, [kanbanNotificationsEnabled]);
  const { isUnlocked, role, customProfiles, permissions: profilePermissions } = useProfile();
  const { settings } = useCompanySettings();
  const { profile } = useAuth();
  
  const canViewPrices = isUnlocked || (profilePermissions?.canSeeFinancials === true);
  const formatPrice = (val: number) => canViewPrices ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val) : 'R$ ***';

  useEffect(() => {
    fetchOrders();
    
    const handleOrdersChanged = () => {
      fetchOrders();
    };

    window.addEventListener('borda_orders_changed', handleOrdersChanged);

    const channel = supabase
      .channel('schema-db-changes-kanban')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      window.removeEventListener('borda_orders_changed', handleOrdersChanged);
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
          clients (name, phone, company_name),
          order_items (*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      const formattedOrders: KanbanOrder[] = (ordersData || []).map((o: any) => ({
        ...o,
        client: o.clients,
        items: o.order_items || []
      }));

      setOrders(formattedOrders);
    } catch (error) {
      console.error("Erro ao buscar pedidos do Kanban:", error);
    } finally {
      setLoading(false);
    }
  };

  const moveOrder = async (orderId: string, newStatus: string) => {
    const anterior = ordersRef.current.find(o => o.id === orderId);

    // Ao entrar numa fila de encerramento, carimba a data de entrega.
    // É ela que dispara o arquivamento automático depois de ARCHIVE_AFTER_DAYS.
    const ehEncerramento = !!columns.find(c => c.id === newStatus)?.archivable;
    let notasAtualizadas: string | undefined;

    if (ehEncerramento && anterior) {
      const { cleanNotes, metadata } = parsePaymentMetadata(anterior.notes);
      notasAtualizadas = serializePaymentMetadata(cleanNotes, {
        ...metadata,
        deliveredAt: new Date().toISOString(),
      });
    }

    setOrders(prev => prev.map(o => o.id === orderId
      ? { ...o, status: newStatus, ...(notasAtualizadas ? { notes: notasAtualizadas } : {}) }
      : o
    ));

    try {
      const { error } = await supabase
        .from('orders')
        .update({
          status: newStatus,
          ...(notasAtualizadas ? { notes: notasAtualizadas } : {}),
        })
        .eq('id', orderId);

      if (error) throw error;

      // Automated WhatsApp Notification logic (usa ref para evitar estado obsoleto)
      const orderToNotify = ordersRef.current.find(o => o.id === orderId);
      const phone = orderToNotify?.client?.phone;
      const clientName = orderToNotify?.client?.name || 'Cliente';
      const orderCode = orderToNotify?.order_number || orderToNotify?.id?.slice(0, 4) || '';
      
      const isNotificationEnabled = notificationsEnabledRef.current[newStatus];

      if (phone && newStatus !== 'pending' && isNotificationEnabled) {
        const templates: Record<string, string> = {
            design: `Olá, ${clientName}! Seu pedido #${orderCode} já está pronto para produção. 🎨`,
            embroidering: `Boas notícias, ${clientName}! Seu pedido #${orderCode} está na Máquina sendo bordado. 🧵`,
            finishing: `Olá, ${clientName}! Seu pedido #${orderCode} está no acabamento final. ✂️`,
            completed: `Parabéns, ${clientName}! Seu pedido #${orderCode} está PRONTO para retirada/envio. ✅`,
            delivered: `Pedido #${orderCode} entregue! Obrigado pela preferência, ${clientName}. 🤝`
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
      updateStep(taskId, 'send', 'error');
      updateStep(taskId, 'done', 'error');

      updateTask(taskId, {
        status: 'error',
        progress: 100,
        description: `Falha no envio: ${evoErr.message || 'Erro no WhatsApp'}`,
        error: evoErr.message || 'Falha no envio direto'
      });

      handleWhatsAppDispatchError(evoErr, phone, text, toastId);
    }
  };

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    
    // Se soltou no mesmo lugar
    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      return;
    }

    // Se mudou de coluna
    if (destination.droppableId !== source.droppableId) {
      moveOrder(draggableId, destination.droppableId);
    } else {
      // Reordenação intra-coluna local pura
      const filtered = orders.filter(o => o.status === source.droppableId);
      const reorderedItem = filtered[source.index];
      
      const newOrders = Array.from(orders);
      const itemIdx = newOrders.findIndex(o => o.id === draggableId);
      
      // Move visualmente no index local
      newOrders.splice(itemIdx, 1);
      
      // Localiza a posição de destino em relação a mesma coluna
      let targetAbsoluteIndex = 0;
      let colItemsCount = 0;
      
      for (let i = 0; i < newOrders.length; i++) {
        if (newOrders[i].status === destination.droppableId) {
          if (colItemsCount === destination.index) {
            targetAbsoluteIndex = i;
            break;
          }
          colItemsCount++;
        }
      }
      
      newOrders.splice(targetAbsoluteIndex, 0, reorderedItem);
      setOrders(newOrders);
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

          {/* Busca de pedidos no quadro (cliente, nº do pedido, empresa ou peça) */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por cliente, empresa, nº do pedido ou peça..."
                className="w-full bg-black/50 border border-white/10 rounded-2xl pl-10 pr-9 py-2.5 text-xs text-zinc-200 outline-none focus:border-purple-500 transition-colors"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  title="Limpar busca"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowArchived(v => !v)}
              title={`Pedidos entregues somem do quadro após ${ARCHIVE_AFTER_DAYS} dias`}
              className={`px-3.5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-wide border transition-all active:scale-95 whitespace-nowrap ${
                showArchived
                  ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                  : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white hover:bg-white/10'
              }`}
            >
              {showArchived ? '✓ Mostrando arquivados' : 'Ver arquivados'}
            </button>
          </div>

          <div className="flex gap-4 flex-1 pb-6 overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent -mx-2 px-2 md:-mx-4 md:px-4">
            {columns.map((col) => {
              const termo = searchTerm.trim().toLowerCase();
              const colOrders = orders.filter((o) => {
                if (o.status !== col.id) return false;

                // Entregues antigos saem do quadro, mas seguem acessíveis no botão "Ver arquivados"
                if (col.archivable && !showArchived) {
                  const { metadata } = parsePaymentMetadata(o.notes);
                  if (isArchived(metadata.deliveredAt)) return false;
                }

                if (termo) {
                  const alvo = [
                    o.client?.name,
                    o.client?.company_name,
                    o.client?.phone,
                    o.order_number != null ? `#${o.order_number}` : '',
                    o.order_number != null ? String(o.order_number) : '',
                    ...(o.items || []).map(i => i.description),
                  ].filter(Boolean).join(' ').toLowerCase();
                  if (!alvo.includes(termo)) return false;
                }

                if (role === 'chefe') return true;
                if (o.visible_profile_ids && o.visible_profile_ids.length > 0) {
                  return o.visible_profile_ids.includes(role);
                }
                return true;
              });
              const limit = visibleLimits[col.id] || 10;
              const visibleOrders = colOrders.slice(0, limit);

              return (
                <Droppable droppableId={col.id} key={col.id}>
                  {(provided: any, snapshot: any) => (
                    <KanbanColumn
                      id={col.id}
                      title={col.title}
                      colorClass={col.color}
                      ordersCount={colOrders.length}
                      notificationsEnabled={!!kanbanNotificationsEnabled[col.id]}
                      onToggleNotifications={() => {
                        const newState = { ...kanbanNotificationsEnabled, [col.id]: !kanbanNotificationsEnabled[col.id] };
                        setKanbanNotificationsEnabled(newState);
                        localStorage.setItem('kanban_notifications_enabled', JSON.stringify(newState));
                      }}
                      onAddOrderClick={() => setAddModalColumn({ id: col.id, title: col.title })}
                      isDraggingOver={snapshot.isDraggingOver}
                      canRename={role === 'chefe'}
                      isEditing={editingColumnId === col.id}
                      editingValue={editingTitle}
                      onStartRename={() => { setEditingColumnId(col.id); setEditingTitle(col.title); }}
                      onChangeRename={setEditingTitle}
                      onConfirmRename={() => handleRenameColumn(col.id)}
                      onCancelRename={() => setEditingColumnId(null)}
                    >
                      <div 
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="space-y-4 min-h-[150px] pb-8"
                      >
                        {loading ? (
                          <div className="h-32 flex items-center justify-center text-zinc-500 text-xs font-semibold">Carregando...</div>
                        ) : colOrders.length === 0 ? (
                          <div className="h-36 flex flex-col items-center justify-center text-center p-4 border border-dashed border-white/5 rounded-2xl space-y-2.5">
                            <span className="text-xs text-zinc-500 italic">Nenhum pedido nesta etapa</span>
                          </div>
                        ) : (
                          <>
                            {visibleOrders.map((ord, index) => (
                              <KanbanCard
                                key={ord.id}
                                order={ord}
                                index={index}
                                canViewPrices={canViewPrices}
                                formatPrice={formatPrice}
                                onOpenDetails={(o) => onOpenDetails && onOpenDetails(o)}
                                onQuickPrice={(o) => onQuickPrice && onQuickPrice(o)}
                                onSelectPayment={(o) => setSelectedOrderForPaymentModal(o)}
                                onPrintPDF={handlePrintPDF}
                                onPrintThermal={handlePrintThermal}
                                onSendWhatsApp={handleSendWhatsApp}
                                onAdvanceStatus={(o) => {
                                  const proximo = buildNextStatusMap(columns)[o.status];
                                  if (proximo) moveOrder(o.id, proximo);
                                }}
                                activePrintOption={activePrintOption}
                                setActivePrintOption={setActivePrintOption}
                                columnColor={col.color}
                                columnTitle={col.title}
                              />
                            ))}

                            {colOrders.length > limit && (
                              <button 
                                type="button"
                                onClick={() => setVisibleLimits(prev => ({ ...prev, [col.id]: (prev[col.id] || 10) + 10 }))}
                                className="w-full py-2.5 mt-2 text-xs font-black text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition-colors cursor-pointer"
                              >
                                Ver mais {colOrders.length - limit} pedidos
                              </button>
                            )}
                          </>
                        )}
                        {provided.placeholder}
                      </div>
                    </KanbanColumn>
                  )}
                </Droppable>
              );
            })}
          </div>
        </div>
      </DragDropContext>

      {/* Modal Reutilizável de Status de Pagamento */}
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
