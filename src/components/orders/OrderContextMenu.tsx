import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { 
  Eye, HandCoins, Send, FileText, Printer, ArrowRight, Edit3, Trash2, Copy, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

export interface OrderContextMenuProps {
  x: number;
  y: number;
  order: any;
  onClose: () => void;
  onOpenDetails?: (order: any) => void;
  onOpenStatusModal?: (order: any) => void;
  onQuickPrice?: (order: any) => void;
  onSendWhatsApp?: (order: any) => void;
  onPrintPDF?: (order: any) => void;
  onPrintThermal?: (order: any) => void;
  onAdvanceStatus?: (order: any) => void;
  onEditOrder?: (order: any) => void;
  onDeleteOrder?: (orderId: string) => void;
}

export const OrderContextMenu: React.FC<OrderContextMenuProps> = ({
  x,
  y,
  order,
  onClose,
  onOpenDetails,
  onOpenStatusModal,
  onQuickPrice,
  onSendWhatsApp,
  onPrintPDF,
  onPrintThermal,
  onAdvanceStatus,
  onEditOrder,
  onDeleteOrder,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Fecha o menu ao clicar fora ou apertar ESC
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Garante que o menu não ultrapassa os limites da tela (vw / vh)
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const menuWidth = 240;
  const menuHeight = 320;

  const posX = Math.min(x, windowWidth - menuWidth - 10);
  const posY = Math.min(y, windowHeight - menuHeight - 10);

  const orderCode = order.order_number ? `#${order.order_number}` : `#${order.id.slice(0, 4)}`;
  const clientName = order.clients?.name || order.client?.name || 'Cliente Sem Nome';

  const handleCopyCode = () => {
    navigator.clipboard.writeText(orderCode);
    toast.success(`Código ${orderCode} copiado para a área de transferência!`);
    onClose();
  };

  return ReactDOM.createPortal(
    <div
      ref={menuRef}
      style={{ top: `${posY}px`, left: `${posX}px` }}
      className="fixed z-[999999] w-60 bg-white/95 dark:bg-[#12121e]/95 backdrop-blur-2xl border border-slate-200 dark:border-white/15 rounded-2xl shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-100 text-slate-800 dark:text-slate-100 text-xs select-none"
    >
      {/* Header do Menu */}
      <div className="px-3 py-2 border-b border-slate-100 dark:border-white/10 mb-1 flex items-center justify-between">
        <div>
          <span className="font-black text-purple-600 dark:text-purple-400 text-xs block">{orderCode}</span>
          <span className="text-[11px] text-slate-500 dark:text-zinc-400 truncate max-w-[170px] block font-medium">
            {clientName}
          </span>
        </div>
        <button
          onClick={handleCopyCode}
          className="p-1 text-slate-400 hover:text-purple-600 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-md transition-colors cursor-pointer"
          title="Copiar código do pedido"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Opções do Menu */}
      <div className="space-y-0.5 font-bold">
        {onOpenDetails && (
          <button
            onClick={() => { onOpenDetails(order); onClose(); }}
            className="w-full px-3 py-2 rounded-xl text-left flex items-center gap-2.5 hover:bg-purple-50 dark:hover:bg-purple-600/20 text-slate-800 dark:text-slate-200 hover:text-purple-700 dark:hover:text-purple-300 transition-colors cursor-pointer"
          >
            <Eye className="h-4 w-4 text-purple-500 dark:text-purple-400" />
            <span>Ver Detalhes do Pedido</span>
          </button>
        )}

        {onQuickPrice && (order.total_amount === 0 || !order.total_amount) && (
          <button
            onClick={() => { onQuickPrice(order); onClose(); }}
            className="w-full px-3 py-2 rounded-xl text-left flex items-center gap-2.5 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors border border-amber-500/20 cursor-pointer"
          >
            <Sparkles className="h-4 w-4 text-amber-500 dark:text-amber-400" />
            <span>Precificar / Adicionar Valor</span>
          </button>
        )}

        {onOpenStatusModal && (
          <button
            onClick={() => { onOpenStatusModal(order); onClose(); }}
            className="w-full px-3 py-2 rounded-xl text-left flex items-center gap-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-600/20 text-slate-800 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors cursor-pointer"
          >
            <HandCoins className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Alterar Pagamento / Baixa</span>
          </button>
        )}

        {onAdvanceStatus && (
          <button
            onClick={() => { onAdvanceStatus(order); onClose(); }}
            className="w-full px-3 py-2 rounded-xl text-left flex items-center gap-2.5 hover:bg-blue-50 dark:hover:bg-blue-600/20 text-slate-800 dark:text-slate-200 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer"
          >
            <ArrowRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span>Avançar Etapa no Kanban</span>
          </button>
        )}

        {onSendWhatsApp && (
          <button
            onClick={() => { onSendWhatsApp(order); onClose(); }}
            className="w-full px-3 py-2 rounded-xl text-left flex items-center gap-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-600/20 text-slate-800 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors cursor-pointer"
          >
            <Send className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Enviar Fatura no WhatsApp</span>
          </button>
        )}

        {/* Divisor */}
        <div className="my-1 border-t border-slate-100 dark:border-white/10" />

        {onPrintPDF && (
          <button
            onClick={() => { onPrintPDF(order); onClose(); }}
            className="w-full px-3 py-1.5 rounded-xl text-left font-semibold flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
          >
            <FileText className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
            <span>Imprimir PDF (A4)</span>
          </button>
        )}

        {onPrintThermal && (
          <button
            onClick={() => { onPrintThermal(order); onClose(); }}
            className="w-full px-3 py-1.5 rounded-xl text-left font-semibold flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>Imprimir Comprovante Térmico</span>
          </button>
        )}

        {onEditOrder && (
          <button
            onClick={() => { onEditOrder(order); onClose(); }}
            className="w-full px-3 py-1.5 rounded-xl text-left font-semibold flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
          >
            <Edit3 className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            <span>Editar Pedido</span>
          </button>
        )}

        {onDeleteOrder && (
          <>
            <div className="my-1 border-t border-slate-100 dark:border-white/10" />
            <button
              onClick={() => { 
                if (window.confirm(`Tem certeza que deseja excluir o pedido ${orderCode}?`)) {
                  onDeleteOrder(order.id);
                }
                onClose();
              }}
              className="w-full px-3 py-1.5 rounded-xl text-left font-semibold flex items-center gap-2.5 hover:bg-rose-50 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
              <span>Excluir Pedido</span>
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

