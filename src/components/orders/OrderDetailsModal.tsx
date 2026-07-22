import React from 'react';
import { X, FileText, Printer, Send, Trash2, Calendar, User, Package, DollarSign, Layers, CheckCircle2, AlertCircle } from 'lucide-react';
import { printOrderReceipt } from '@/services/pdfGenerator';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface OrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
  onDelete?: (orderId: string) => void;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({
  isOpen,
  onClose,
  order,
  onDelete
}) => {
  const { settings } = useCompanySettings();

  if (!isOpen || !order) return null;

  const handlePrintPDF = () => {
    printOrderReceipt({
      id: order.id,
      createdAt: order.created_at,
      dueDate: order.due_date,
      clientName: order.clients?.name || 'Cliente',
      clientPhone: order.clients?.phone,
      clientCompany: order.clients?.company_name,
      paymentStatus: order.payment_status || 'pending',
      paymentMethod: order.payment_method,
      totalAmount: order.total_amount || 0,
      notes: order.notes,
      items: order.order_items || [],
      companyName: settings.systemName
    });
  };

  const handleSendWhatsApp = () => {
    const phone = order.clients?.phone;
    if (!phone) {
      toast.error("Este cliente não possui WhatsApp cadastrado.");
      return;
    }

    const itemsSummary = order.order_items?.map((it: any) => `- ${it.description} (${it.quantity}x)`).join('\n') || '';
    const text = `*Ficha do Pedido #${order.id.slice(0, 6)} - ${settings.systemName}*\n\n` +
      `*Cliente:* ${order.clients?.name}\n` +
      `*Status de Pagamento:* ${order.payment_status === 'paid' ? 'Pago (100%)' : order.payment_status === 'half_paid' ? 'Sinal (50%)' : 'Pendente'}\n\n` +
      `*Itens:* \n${itemsSummary}\n\n` +
      `*Valor Total:* R$ ${Number(order.total_amount || 0).toFixed(2)}`;

    window.open(`https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-[#0d0d14] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-white/5">
          <div className="flex items-center gap-3">
            <div 
              className="p-3 rounded-2xl text-white shadow-lg"
              style={{ backgroundColor: settings.primaryColor }}
            >
              <Package className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  PEDIDO #{order.id.slice(0, 6)}
                </h3>
                <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                  order.payment_status === 'paid'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : order.payment_status === 'half_paid'
                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                    : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                }`}>
                  {order.payment_status === 'paid' ? 'Pago' : order.payment_status === 'half_paid' ? 'Sinal 50%' : 'Pendente'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Criado em {format(new Date(order.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-2xl hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-zinc-400 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          
          {/* Card Info Cliente */}
          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
                <User className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">Cliente</p>
                <h4 className="text-sm font-black text-slate-900 dark:text-white">{order.clients?.name || 'Cliente Geral'}</h4>
                {order.clients?.phone && (
                  <p className="text-xs text-slate-500 dark:text-zinc-400">📞 {order.clients.phone}</p>
                )}
              </div>
            </div>

            {order.due_date && (
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">Prazo de Entrega</p>
                <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1 justify-end">
                  <Calendar className="h-3.5 w-3.5 text-purple-400" />
                  {format(new Date(order.due_date), 'dd/MM/yyyy')}
                </p>
              </div>
            )}
          </div>

          {/* Tabela de Itens */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-zinc-400 flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-400" /> Itens e Matrizes do Pedido
            </h4>

            <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-50 dark:bg-white/5">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-200/50 dark:bg-white/10 text-slate-700 dark:text-zinc-300 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Descrição / Matriz</th>
                    <th className="p-3 text-center">Qtd</th>
                    <th className="p-3 text-right">Valor Unit.</th>
                    <th className="p-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/5 font-medium text-slate-800 dark:text-zinc-200">
                  {order.order_items && order.order_items.length > 0 ? (
                    order.order_items.map((item: any) => (
                      <tr key={item.id}>
                        <td className="p-3 font-bold">{item.description}</td>
                        <td className="p-3 text-center">{item.quantity} un</td>
                        <td className="p-3 text-right">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unit_price)}
                        </td>
                        <td className="p-3 text-right font-black">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total_price)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-slate-500 dark:text-zinc-400">
                        Matriz principal do pedido: {order.notes || 'Sem itens individuais descritos'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Resumo Financeiro */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-500/30 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-purple-300">Valor Total do Pedido</span>
              <h3 className="text-2xl font-black text-white">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total_amount || 0)}
              </h3>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Forma Registrada</span>
              <p className="text-xs font-bold text-purple-300 uppercase">
                {order.payment_method ? `⚡ ${order.payment_method}` : 'Não informada'}
              </p>
            </div>
          </div>

          {/* Observações */}
          {order.notes && (
            <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-1">
              <p className="text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400">Observações Gerais</p>
              <p className="text-xs text-slate-700 dark:text-zinc-300">{order.notes}</p>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-white/5 gap-2 flex-wrap">
          <div>
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(order.id)}
                className="px-3 py-2 rounded-xl text-xs font-bold text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="h-4 w-4" /> Excluir Pedido
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-1.5 shadow-md"
            >
              <Send className="h-4 w-4" /> WhatsApp
            </button>

            <button
              type="button"
              onClick={handlePrintPDF}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow-lg flex items-center gap-1.5 transition-all hover:opacity-90"
              style={{ backgroundColor: settings.primaryColor }}
            >
              <FileText className="h-4 w-4" /> Gerar Recibo / PDF
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
