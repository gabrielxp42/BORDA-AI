import React, { useState } from 'react';
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
      {(provided: any, snapshot: any) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`relative group bg-[#11111a]/70 backdrop-blur-md rounded-2xl border transition-all duration-200 select-none ${
            snapshot.isDragging 
              ? 'shadow-2xl shadow-purple-500/20 border-purple-500/60 scale-[1.03] rotate-1 z-50 bg-[#161625]' 
              : 'border-white/10 hover:border-purple-500/30 hover:scale-[1.01] hover:bg-[#131320]'
          }`}
          style={{
            ...provided.draggableProps.style,
          }}
          onClick={() => onOpenDetails(order)}
        >
          {/* Grip Drag Handle & Top Row */}
          <div className="flex items-center justify-between px-4 pt-3 pb-1 border-b border-white/5 bg-white/[0.02] rounded-t-2xl">
            <div className="flex items-center gap-1.5" {...provided.dragHandleProps}>
              <GripVertical className="h-4.5 w-4.5 text-zinc-500 cursor-grab active:cursor-grabbing hover:text-zinc-300 transition-colors" />
              <span className={`text-[10px] font-black tracking-wider px-2 py-0.5 rounded-lg ${
                isUnpriced 
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                  : 'bg-white/5 text-zinc-300 border border-white/10'
              }`}>
                #{order.order_number || order.id.slice(0, 4)}
              </span>
            </div>

            {/* Price Badge */}
            {canViewPrices && (
              <div className="text-right">
                {order.total_amount > 0 ? (
                  <span className="text-sm font-black text-emerald-400">
                    {formatPrice(order.total_amount)}
                  </span>
                ) : (
                  <span className="text-[10px] font-extrabold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md">
                    Aguardando Preço
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="p-4.5 space-y-3.5">
            {/* Client Info */}
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white tracking-tight leading-tight group-hover:text-purple-300 transition-colors truncate">
                {order.client?.name || 'Cliente Particular'}
              </h4>
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 truncate">
                <Building className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <span className="truncate">{order.client?.company_name || 'Particular'}</span>
              </div>
            </div>

            {/* Alerts & Dates */}
            <div className="flex flex-wrap gap-1.5">
              {/* Alerta Gabi "Chata": Pedido pronto há mais de 1,5 dias (36 horas) */}
              {(() => {
                if (order.status === 'completed') {
                  const createdDate = new Date(order.created_at).getTime();
                  const now = new Date().getTime();
                  const hoursDiff = (now - createdDate) / (1000 * 60 * 60);
                  
                  if (hoursDiff > 36) {
                    return (
                      <div className="w-full p-2 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-200 text-[10px] font-bold flex items-center justify-between gap-1.5 animate-pulse">
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs">🤖</span>
                          <span><strong>Gabi:</strong> Este pedido já foi entregue? (Pronto há &gt;1,5d)</span>
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
                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border tracking-wider shrink-0 ${dueDateInfo.badgeClass}`}>
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
                      className="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30 cursor-pointer hover:scale-105 transition-all animate-pulse"
                    >
                      ⚠️ Sem Orçamento
                    </span>
                  );
                }

                const details = formatOrderPaymentBadgeDetails(order.payment_status, order.total_amount, order.notes, order.payment_method);
                const badgeColors: Record<string, string> = {
                  paid: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
                  half_paid: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
                  pending: 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                };

                return (
                  <span 
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPayment(order);
                    }}
                    className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border cursor-pointer hover:scale-105 transition-all ${
                      badgeColors[details.status] || badgeColors.pending
                    }`}
                    title={`${details.fullLabel}. Clique para alterar.`}
                  >
                    {details.shortLabel}
                  </span>
                );
              })()}
            </div>

            {/* Embroidery Items list */}
            {order.items && order.items.length > 0 && (
              <div className="bg-black/40 p-3 rounded-xl space-y-2 border border-white/5">
                {order.items.slice(0, 3).map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Package className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                      <span className="font-bold text-zinc-300 shrink-0">{item.quantity}x</span>
                      <span className="truncate text-zinc-300">{item.description}</span>
                    </div>
                  </div>
                ))}
                {order.items.length > 3 && (
                  <div className="text-[10px] text-zinc-500 italic pl-5">
                    + {order.items.length - 3} itens adicionais
                  </div>
                )}
              </div>
            )}

            {/* Observation Notes */}
            {cleanNotes && (
              <p className="text-xs text-zinc-400 italic border-l-2 border-purple-500/40 pl-2.5 py-0.5 line-clamp-2">
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
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-black flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
              >
                ⚡ Orçar Pedido Agora
              </button>
            )}

            {/* Card Action bar */}
            <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {/* View Details */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDetails(order);
                  }}
                  title="Ver detalhes do pedido"
                  className="h-8.5 w-8.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 flex items-center justify-center transition-colors"
                >
                  <FileText className="h-4 w-4" />
                </button>

                {/* Receipt Printing options */}
                {activePrintOption === order.id ? (
                  <div className="flex items-center gap-1 bg-white/10 border border-white/10 rounded-xl p-0.5 animate-in zoom-in-95 duration-200">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPrintPDF(order);
                        setActivePrintOption(null);
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-zinc-200 hover:bg-white/15 hover:text-white text-[10px] font-black flex items-center gap-1.5 transition-colors"
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
                      className="px-2.5 py-1.5 rounded-lg text-zinc-200 hover:bg-white/15 hover:text-white text-[10px] font-black flex items-center gap-1.5 transition-colors"
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
                      className="px-2 text-zinc-500 hover:text-zinc-300 font-extrabold transition-colors text-sm"
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
                    className="h-8.5 w-8.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 flex items-center justify-center transition-colors"
                  >
                    <Printer className="h-4 w-4" />
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
                  className="h-8.5 w-8.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 flex items-center justify-center transition-colors"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>

              {/* Advance Status button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAdvanceStatus(order);
                }}
                className="text-xs font-black px-3 py-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 hover:border-purple-500/30 flex items-center gap-1.5 transition-all active:scale-[0.97] whitespace-nowrap cursor-pointer"
              >
                <Play className="h-3.5 w-3.5 fill-purple-300" />
                <span>{order.status === 'completed' ? 'Reiniciar' : 'Avançar'}</span>
              </button>
            </div>
          </div>

          {/* Card Footer Status indicator */}
          <div className={`px-4.5 py-2.5 border-t rounded-b-2xl flex items-center justify-between text-[10px] font-black uppercase tracking-wider ${columnColor}`}>
            <span className="flex items-center gap-1.5 truncate">
              <span className="h-2.5 w-2.5 rounded-full bg-current animate-pulse shrink-0" />
              <span className="truncate">Etapa: {columnTitle}</span>
            </span>
            <div className="flex items-center gap-2 shrink-0 font-bold opacity-90">
              {order.created_at && (
                <span title="Data de entrada">
                  Entrada: {format(new Date(order.created_at), 'dd/MM')}
                </span>
              )}
              {order.due_date && (
                <span className="text-amber-400 font-extrabold flex items-center gap-1" title="Data limite / Prazo">
                  <Calendar className="h-3 w-3" />
                  Entrega: {format(new Date(order.due_date), 'dd/MM')}
                </span>
              )}
            </div>
          </div>

        </div>
      )}
    </Draggable>
  );
};
