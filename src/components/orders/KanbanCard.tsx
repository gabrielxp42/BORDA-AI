import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { 
  Building, Package, FileText, Printer, Send, Play, GripVertical, Calendar 
} from 'lucide-react';
import { format } from 'date-fns';
import { Draggable } from '@hello-pangea/dnd';
import { parsePaymentMetadata, formatOrderPaymentBadgeDetails, getDueDateAlertInfo } from '@/utils/paymentHelper';

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

interface KanbanCardProps {
  order: KanbanOrder;
  index: number;
  canViewPrices: boolean;
  formatPrice: (val: number) => string;
  onOpenDetails: (order: KanbanOrder) => void;
  onQuickPrice: (order: KanbanOrder) => void;
  onSelectPayment: (order: KanbanOrder) => void;
  onPrintPDF: (order: KanbanOrder) => void;
  onPrintThermal: (order: KanbanOrder) => void;
  onSendWhatsApp: (order: KanbanOrder) => void;
  onAdvanceStatus: (order: KanbanOrder) => void;
  activePrintOption: string | null;
  setActivePrintOption: (id: string | null) => void;
  columnColor: string;
  columnTitle: string;
}

export const KanbanCard: React.FC<KanbanCardProps> = ({
  order,
  index,
  canViewPrices,
  formatPrice,
  onOpenDetails,
  onQuickPrice,
  onSelectPayment,
  onPrintPDF,
  onPrintThermal,
  onSendWhatsApp,
  onAdvanceStatus,
  activePrintOption,
  setActivePrintOption,
  columnColor,
  columnTitle
}) => {
  const { cleanNotes, metadata } = parsePaymentMetadata(order.notes);
  const isUnpriced = metadata.isQuickEntry || order.total_amount === 0;

  return (
    <Draggable key={order.id} draggableId={order.id} index={index}>
      {(provided: any, snapshot: any) => {
        const cardContent = (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={`group bg-white dark:bg-[#11111a]/95 backdrop-blur-xl rounded-2xl border transition-all duration-150 select-none shadow-sm ${
              snapshot.isDragging 
                ? 'shadow-2xl shadow-purple-500/40 border-purple-500 ring-2 ring-purple-500/60 scale-[1.04] rotate-2 bg-white dark:bg-[#18182a] cursor-grabbing !z-[99999]' 
                : 'border-slate-200/90 dark:border-white/10 hover:border-purple-500/40 hover:scale-[1.01] hover:shadow-md cursor-pointer'
            }`}
            style={{
              ...provided.draggableProps.style,
              ...(snapshot.isDragging ? { zIndex: 99999 } : {})
            }}
            onClick={() => !snapshot.isDragging && onOpenDetails(order)}
          >
          {/* Grip Drag Handle & Top Row */}
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 border-b border-slate-100 dark:border-white/5 bg-slate-50/80 dark:bg-white/[0.02] rounded-t-2xl">
            <div className="flex items-center gap-1.5 min-w-0" {...provided.dragHandleProps}>
              <GripVertical className="h-4 w-4 text-slate-400 dark:text-zinc-500 cursor-grab active:cursor-grabbing hover:text-slate-600 dark:hover:text-zinc-300 transition-colors shrink-0" />
              <span className={`text-[10px] font-black tracking-wider px-2 py-0.5 rounded-lg shrink-0 ${
                isUnpriced 
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' 
                  : 'bg-slate-200/70 dark:bg-white/5 text-slate-700 dark:text-zinc-300 border border-slate-300/60 dark:border-white/10'
              }`}>
                #{order.order_number || order.id.slice(0, 4)}
              </span>
            </div>

            {/* Price Badge */}
            {canViewPrices && (
              <div className="text-right shrink-0">
                {order.total_amount > 0 ? (
                  <span className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400">
                    {formatPrice(order.total_amount)}
                  </span>
                ) : (
                  <span className="text-[9px] font-extrabold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                    Aguardando Preço
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="p-2.5 space-y-2">
            {/* Client Info */}
            <div className="space-y-0.5 min-w-0">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white tracking-tight leading-tight group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors truncate">
                {order.client?.name || 'Cliente Particular'}
              </h4>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                <Building className="h-3 w-3 text-slate-400 dark:text-zinc-500 shrink-0" />
                <span className="truncate">{order.client?.company_name || 'Particular'}</span>
              </div>
            </div>

            {/* Alerts & Dates */}
            <div className="flex flex-wrap gap-1">
              {/* Alerta Gabi "Chata": Pedido pronto há mais de 1,5 dias (36 horas) */}
              {(() => {
                if (order.status === 'completed') {
                  const createdDate = new Date(order.created_at).getTime();
                  const now = new Date().getTime();
                  const hoursDiff = (now - createdDate) / (1000 * 60 * 60);
                  
                  if (hoursDiff > 36) {
                    return (
                      <div className="w-full p-1.5 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-700 dark:text-purple-200 text-[9px] font-bold flex items-center justify-between gap-1 animate-pulse">
                        <span className="flex items-center gap-1 min-w-0">
                          <span className="text-[10px]">🤖</span>
                          <span className="truncate"><strong>Gabi:</strong> Entregue? (&gt;36h)</span>
                        </span>
                      </div>
                    );
                  }
                }
                return null;
              })()}

              {/* Overdue alert badge */}
              {(() => {
                const dueDateInfo = getDueDateAlertInfo(order.due_date, order.status);
                if (!dueDateInfo) return null;
                return (
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border tracking-wider shrink-0 ${dueDateInfo.badgeClass}`}>
                    {dueDateInfo.label}
                  </span>
                );
              })()}

              {/* Payment status badge */}
              {(() => {
                if (isUnpriced) {
                  return (
                    <span 
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPayment(order);
                      }}
                      className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 cursor-pointer hover:scale-105 transition-all animate-pulse"
                    >
                      ⚠️ Sem Orçamento
                    </span>
                  );
                }

                const details = formatOrderPaymentBadgeDetails(order.payment_status, order.total_amount, order.notes, order.payment_method, canViewPrices);
                const badgeColors: Record<string, string> = {
                  paid: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
                  half_paid: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30',
                  pending: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30'
                };

                return (
                  <span 
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPayment(order);
                    }}
                    className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border cursor-pointer hover:scale-105 transition-all ${
                      badgeColors[details.status] || badgeColors.pending
                    }`}
                    title={`${details.fullLabel}. Clique para alterar.`}
                  >
                    {details.shortLabel}
                  </span>
                );
              })()}
            </div>

            {/* Embroidery Items list - Compact */}
            {order.items && order.items.length > 0 && (
              <div className="bg-slate-50 dark:bg-black/40 p-2 rounded-lg space-y-1 border border-slate-200/70 dark:border-white/5 text-[11px]">
                {order.items.slice(0, 2).map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-1.5 truncate">
                    <div className="flex items-center gap-1.5 min-w-0 truncate">
                      <Package className="h-3 w-3 text-purple-600 dark:text-purple-400 shrink-0" />
                      <span className="font-bold text-slate-800 dark:text-zinc-300 shrink-0">{item.quantity}x</span>
                      <span className="truncate text-slate-700 dark:text-zinc-300 font-medium">{item.description.replace(/^(bordado:\s*)+/gi, '')}</span>
                    </div>
                  </div>
                ))}
                {order.items.length > 2 && (
                  <div className="text-[9px] text-slate-400 dark:text-zinc-500 italic pl-4">
                    + {order.items.length - 2} itens adicionais
                  </div>
                )}
              </div>
            )}

            {/* Observation Notes */}
            {cleanNotes && (
              <p className="text-[11px] text-slate-600 dark:text-zinc-400 italic border-l-2 border-purple-500/40 pl-2 py-0.5 line-clamp-1">
                "{cleanNotes}"
              </p>
            )}

            {/* Quick Price Action button */}
            {isUnpriced && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickPrice(order);
                }}
                className="w-full py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/40 text-[11px] font-black flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
              >
                ⚡ Orçar Pedido Agora
              </button>
            )}

            {/* Card Action bar */}
            <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {/* View Details */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDetails(order);
                  }}
                  title="Ver detalhes do pedido"
                  className="h-7.5 w-7.5 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-white/10 flex items-center justify-center transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                </button>

                {/* Receipt Printing options */}
                {activePrintOption === order.id ? (
                  <div className="flex items-center gap-1 bg-slate-200/80 dark:bg-white/10 border border-slate-300 dark:border-white/10 rounded-lg p-0.5 animate-in zoom-in-95 duration-200">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPrintPDF(order);
                        setActivePrintOption(null);
                      }}
                      className="px-2 py-1 rounded text-slate-800 dark:text-zinc-200 hover:bg-slate-300 dark:hover:bg-white/15 text-[9px] font-black flex items-center gap-1 transition-colors"
                      title="Imprimir A4 (PDF)"
                    >
                      <FileText className="h-3 w-3" /> A4
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPrintThermal(order);
                        setActivePrintOption(null);
                      }}
                      className="px-2 py-1 rounded text-slate-800 dark:text-zinc-200 hover:bg-slate-300 dark:hover:bg-white/15 text-[9px] font-black flex items-center gap-1 transition-colors"
                      title="Imprimir Bobina Térmica"
                    >
                      <Printer className="h-3 w-3" /> Cupom
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePrintOption(null);
                      }}
                      className="px-1.5 text-slate-500 hover:text-slate-800 font-extrabold transition-colors text-xs"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActivePrintOption(order.id);
                    }}
                    title="Imprimir recibo/cupom"
                    className="h-7.5 w-7.5 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-white/10 flex items-center justify-center transition-colors"
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Send WhatsApp */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSendWhatsApp(order);
                  }}
                  title="Enviar ficha via WhatsApp"
                  className="h-7.5 w-7.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center transition-colors"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Advance Status button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAdvanceStatus(order);
                }}
                className="text-[11px] font-black px-2.5 py-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 border border-purple-500/30 flex items-center gap-1 transition-all active:scale-[0.97] whitespace-nowrap cursor-pointer"
              >
                <Play className="h-3 w-3 fill-current text-purple-700 dark:text-purple-300" />
                <span>{order.status === 'completed' ? 'Reiniciar' : 'Avançar'}</span>
              </button>
            </div>
          </div>

          {/* Card Footer Status indicator */}
          <div className={`px-3 py-2 border-t rounded-b-2xl flex items-center justify-between text-[9px] font-black uppercase tracking-wider ${columnColor}`}>
            <span className="flex items-center gap-1 min-w-0 truncate">
              <span className="h-2 w-2 rounded-full bg-current animate-pulse shrink-0" />
              <span className="truncate">Etapa: {columnTitle}</span>
            </span>
            <div className="flex items-center gap-1.5 shrink-0 font-bold opacity-90">
              {order.created_at && (
                <span title="Data de entrada">
                  Entrada: {format(new Date(order.created_at), 'dd/MM')}
                </span>
              )}
              {order.due_date && (
                <span className="text-amber-600 dark:text-amber-400 font-extrabold flex items-center gap-0.5" title="Data limite / Prazo">
                  <Calendar className="h-2.5 w-2.5" />
                  Entrega: {format(new Date(order.due_date), 'dd/MM')}
                </span>
              )}
            </div>
          </div>

          </div>
        );

        if (snapshot.isDragging) {
          return ReactDOM.createPortal(cardContent, document.body);
        }
        return cardContent;
      }}
    </Draggable>
  );
};
