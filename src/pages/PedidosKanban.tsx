import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, Play, Package, Lock, Printer, Send, FileText, 
  Building, Phone, AlertTriangle, Calendar, Zap, Download, 
  CheckCircle2, Clock, Eye 
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { parsePaymentMetadata } from '@/utils/paymentHelper';
import { printOrderReceipt } from '@/services/pdfGenerator';
import { printThermalReceipt } from '@/services/thermalPrinter';
import { sendEvolutionText, getWhatsAppWebLink, handleWhatsAppDispatchError } from '@/services/whatsappService';
import { useBackgroundTasks } from '@/hooks/useBackgroundTasks';
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
  const [loading, setLoading] = useState(true);
  const [activePrintOption, setActivePrintOption] = useState<string | null>(null);
  const [visibleLimits, setVisibleLimits] = useState<Record<string, number>>({});
  const { isUnlocked } = useProfile();
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
          id, order_number, client_id, status, payment_status, payment_method, total_amount, due_date, notes, created_at,
          clients (name, phone, company_name)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('id, order_id, description, quantity, unit_price, total_price');

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

      // Automated WhatsApp Notification logic
      const orderToNotify = orders.find(o => o.id === orderId);
      const phone = orderToNotify?.client?.phone;
      const clientName = orderToNotify?.client?.name || 'Cliente';
      
      if (phone && newStatus !== 'pending') {
        const templates: Record<string, string> = {
            design: `Olá, ${clientName}! Seu pedido #${orderToNotify.order_number || orderToNotify.id.slice(0, 4)} entrou em fase de Criação de Matriz. 🎨`,
            embroidering: `Boas notícias, ${clientName}! Seu pedido #${orderToNotify.order_number || orderToNotify.id.slice(0, 4)} está na Máquina sendo bordado. 🧵`,
            finishing: `Olá, ${clientName}! Seu pedido #${orderToNotify.order_number || orderToNotify.id.slice(0, 4)} está no acabamento final. ✂️`,
            completed: `Parabéns, ${clientName}! Seu pedido #${orderToNotify.order_number || orderToNotify.id.slice(0, 4)} está PRONTO para retirada/envio. ✅`
        };
        const message = templates[newStatus];
        if (message) {
          sendEvolutionText(phone, message).then(() => {
             toast.success(`Notificação enviada para ${clientName}!`);
          }).catch(err => console.error("Falha ao enviar notificação automática:", err));
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

    const itemsSummary = order.items?.map((it: any) => `- ${it.description} (${it.quantity}x)`).join('\n') || '';
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

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="space-y-4 h-full flex flex-col">

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 flex-1 pb-6">
          {columns.map((col) => {
            const colOrders = orders.filter((o) => o.status === col.id);
            return (
              <Droppable droppableId={col.id} key={col.id}>
                {(provided, snapshot) => (
                  <div 
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`glass-panel p-3 md:p-4 rounded-3xl space-y-3 flex flex-col min-h-[200px] md:min-h-[520px] transition-colors ${snapshot.isDraggingOver ? 'bg-white/5 border-purple-500/30' : ''}`}
                  >
                    <div className={`p-2.5 rounded-2xl border text-xs font-black uppercase tracking-wider flex items-center justify-between transition-colors ${col.color} ${snapshot.isDraggingOver ? 'shadow-lg shadow-purple-500/10' : ''}`}>
                      <span>{col.title}</span>
                      <span className="h-5 w-5 rounded-full bg-white/10 flex items-center justify-center text-[10px]">
                        {colOrders.length}
                      </span>
                    </div>

                    <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pt-1 pb-4 pr-1">
                      {loading ? (
                        <div className="h-32 flex items-center justify-center text-zinc-500 text-xs font-medium">Carregando...</div>
                      ) : colOrders.length === 0 ? (
                        <div className="h-32 flex items-center justify-center text-zinc-600 text-xs font-medium italic border border-dashed border-white/5 rounded-2xl">
                          Vazio
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

                          return (
                            <Draggable key={ord.id} draggableId={ord.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  onClick={() => onOpenDetails && onOpenDetails(ord)}
                                  className={`glass-card p-4 rounded-2xl space-y-3 relative group border border-white/10 cursor-pointer transition-all ${
                                    snapshot.isDragging 
                                      ? 'shadow-2xl shadow-purple-500/20 scale-105 border-purple-500/50 rotate-2 z-50' 
                                      : 'hover:border-purple-500/40 hover:scale-[1.01] shadow-md'
                                  }`}
                                  style={{
                                    ...provided.draggableProps.style,
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

                            {/* Badge de Status de Pagamento */}
                            {isUnpriced ? (
                              <span className="inline-block mt-0.5 animate-pulse px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                ⚠️ Sem Orçamento
                              </span>
                            ) : ord.payment_status === 'paid' ? (
                              <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                ✓ Pago 100%
                              </span>
                            ) : ord.payment_status === 'half_paid' ? (
                              <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                                ⚡ Sinal 50%
                              </span>
                            ) : (
                              <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase bg-orange-500/20 text-orange-400 border border-orange-500/30">
                                ⏳ Pendente
                              </span>
                            )}
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
  );
};
