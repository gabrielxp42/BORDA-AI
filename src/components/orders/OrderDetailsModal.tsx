import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, FileText, Printer, Send, Trash2, Calendar, User, Package, DollarSign, Layers, CheckCircle2, AlertCircle, Download } from 'lucide-react';
import { printOrderReceipt } from '@/services/pdfGenerator';
import { sendEvolutionText, getWhatsAppWebLink } from '@/services/whatsappService';
import { useBackgroundTasks } from '@/hooks/useBackgroundTasks';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { useProfile } from '@/contexts/ProfileContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { parsePaymentMetadata } from '@/utils/paymentHelper';

interface OrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
  onDelete?: (orderId: string) => void;
  onPriceOrder?: (order: any) => void;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({
  isOpen,
  onClose,
  order,
  onDelete,
  onPriceOrder
}) => {
  const { settings } = useCompanySettings();
  const { isUnlocked } = useProfile();

  const [matrixUrls, setMatrixUrls] = useState<Record<string, string>>({});
  const [matrixPreviews, setMatrixPreviews] = useState<Record<string, string>>({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchMatrixUrls = async () => {
      if (!order?.order_items) return;
      const urls: Record<string, string> = {};
      const previews: Record<string, string> = {};
      
      for (const item of order.order_items) {
        try {
          let fileUrl: string | null = null;
          let previewUrl: string | null = null;

          // 1. Try by matrix_id (preferred — new orders)
          if (item.matrix_id) {
            const { data } = await supabase
              .from('matrix_versions')
              .select('file_url, preview_url')
              .eq('matrix_id', item.matrix_id)
              .order('version_number', { ascending: false })
              .limit(1)
              .single();
            fileUrl = data?.file_url ?? null;
            previewUrl = data?.preview_url ?? null;
          }

          // 2. Fallback: extract name from description and look up by matrix name
          if (!fileUrl && item.description) {
            const nameMatch = item.description.match(/^(?:Bordado|Entrada):\s*(.+?)(?:\s*\(|$)/);
            if (nameMatch?.[1]) {
              const matrixName = nameMatch[1].trim();
              const { data: mx } = await supabase
                .from('matrices')
                .select('id')
                .ilike('name', `%${matrixName}%`)
                .limit(1)
                .single();
              if (mx?.id) {
                const { data: ver } = await supabase
                  .from('matrix_versions')
                  .select('file_url, preview_url')
                  .eq('matrix_id', mx.id)
                  .order('version_number', { ascending: false })
                  .limit(1)
                  .single();
                fileUrl = ver?.file_url ?? null;
                previewUrl = ver?.preview_url ?? null;
              }
            }
          }

          if (fileUrl) urls[item.id] = fileUrl;
          if (previewUrl) previews[item.id] = previewUrl;
        } catch (e) {
          // silently ignore
        }
      }
      setMatrixUrls(urls);
      setMatrixPreviews(previews);
    };

    if (isOpen) {
      fetchMatrixUrls();
    }
  }, [order, isOpen]);

  if (!isOpen || !order) return null;

  const { cleanNotes, metadata } = parsePaymentMetadata(order.notes);

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

  const handleSendWhatsApp = async () => {
    const phone = order.clients?.phone;
    const clientName = order.clients?.name || 'Cliente';
    if (!phone) {
      toast.error("Este cliente não possui WhatsApp cadastrado.");
      return;
    }

    const { addTask, updateTask, updateStep } = useBackgroundTasks.getState();

    const itemsSummary = order.order_items?.map((it: any) => `- ${it.description} (${it.quantity}x)`).join('\n') || '';
    const text = `*Ficha do Pedido #${order.id.slice(0, 6)} - ${settings.systemName}* 🧵✨\n\n` +
      `Olá, *${clientName}*! Seguem os detalhes do seu pedido:\n\n` +
      `*Cliente:* ${clientName}\n` +
      `*Status:* ${order.payment_status === 'paid' ? 'Pago (100%)' : order.payment_status === 'half_paid' ? 'Sinal (50%)' : 'Pendente'}\n\n` +
      `*Itens:* \n${itemsSummary}\n\n` +
      `*Valor Total:* R$ ${Number(order.total_amount || 0).toFixed(2)}`;

    const taskId = addTask({
      title: `Ficha Pedido #${order.id.slice(0, 4)}`,
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

      updateStep(taskId, 'done', 'completed');
      updateTask(taskId, {
        progress: 100,
        status: 'completed',
        description: `Enviado com sucesso para ${clientName}!`
      });

      toast.success(`⚡ Ficha enviada com sucesso no WhatsApp de ${clientName}!`, { id: toastId });
    } catch (evoErr: any) {
      console.warn('Falha no envio direto via Evolution API, abrindo WhatsApp Web:', evoErr);
      updateTask(taskId, {
        status: 'error',
        progress: 100,
        error: evoErr.message || 'Falha no envio direto'
      });

      const webLink = getWhatsAppWebLink(phone, text);
      window.open(webLink, '_blank');
      toast.info(`Evolution API indisponível. Abrindo WhatsApp Web para ${clientName}...`, { id: toastId });
    }
  };

  const paymentLabels: Record<string, string> = {
    pix: 'PIX',
    credit_card: 'Cartão de Crédito',
    cash: 'Dinheiro',
    transfer: 'Transferência'
  };

  const modalContent = (
    <>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
        <div 
          className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-[#0d0d14] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-purple-500/20 text-purple-400">
                <Package className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    PEDIDO #{order.id.slice(0, 6)}
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    order.payment_status === 'paid' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' :
                    order.payment_status === 'half_paid' ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30' :
                    'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                  }`}>
                    {order.payment_status === 'paid' ? 'PAGO (100%)' : order.payment_status === 'half_paid' ? 'SINAL (50%)' : 'PENDENTE'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Criado em {format(new Date(order.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            {/* Informações do Cliente e Prazo */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
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
                <Layers className="h-4 w-4" style={{ color: settings.primaryColor }} /> Itens e Matrizes do Pedido
              </h4>

              <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-50 dark:bg-white/5">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-200/50 dark:bg-white/10 text-slate-700 dark:text-zinc-300 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Descrição / Matriz</th>
                      <th className="p-3 text-center">Qtd Lote</th>
                      {isUnlocked ? (
                        <>
                          <th className="p-3 text-right">Valor Unit.</th>
                          <th className="p-3 text-right">Subtotal</th>
                        </>
                      ) : (
                        <>
                          <th className="p-3 text-center">Status Produção</th>
                          <th className="p-3 text-right">Ordem</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-white/5 font-medium text-slate-800 dark:text-zinc-200">
                    {order.order_items && order.order_items.length > 0 ? (
                      order.order_items.map((item: any, idx: number) => (
                        <tr key={item.id || idx}>
                          <td className="p-3 font-bold">
                            <div className="flex items-center gap-3">
                              {/* Preview thumbnail */}
                              {matrixPreviews[item.id] ? (
                                <button
                                  onClick={() => setLightboxUrl(matrixPreviews[item.id])}
                                  title="Ver arte da matriz"
                                  className="shrink-0 w-10 h-10 rounded-xl overflow-hidden border-2 border-slate-200 dark:border-white/10 hover:border-purple-500 hover:scale-105 transition-all shadow-sm"
                                >
                                  <img src={matrixPreviews[item.id]} alt="" className="w-full h-full object-cover" />
                                </button>
                              ) : (
                                <div
                                  className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border border-slate-200 dark:border-white/10"
                                  style={{ backgroundColor: `${settings.primaryColor}10` }}
                                >
                                  <Layers className="h-4 w-4" style={{ color: settings.primaryColor, opacity: 0.5 }} />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <span className="block truncate">{item.description}</span>
                              </div>
                              {matrixUrls[item.id] && (
                                <button
                                  onClick={() => window.open(matrixUrls[item.id], '_blank')}
                                  title="Baixar Matriz"
                                  className="p-1.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-500/30 transition-colors shrink-0 flex items-center justify-center shadow-sm"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-center font-bold text-white">{item.quantity} un</td>
                          {isUnlocked ? (
                            <>
                              <td className="p-3 text-right">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unit_price || 0)}
                              </td>
                              <td className="p-3 text-right font-black">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total_price || 0)}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="p-3 text-center">
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                                  🟢 Liberado p/ Bordar
                                </span>
                              </td>
                              <td className="p-3 text-right font-mono text-zinc-400 text-[11px]">
                                #OP-{(idx + 1).toString().padStart(2, '0')}
                              </td>
                            </>
                          )}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-500 dark:text-zinc-400">
                          {order.notes || 'Sem itens individuais descritos'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Resumo da Ordem de Produção / Resumo Financeiro */}
            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-[#111118] border border-white/10 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">
                    {isUnlocked ? 'Valor Total do Pedido' : 'Resumo da Ordem de Produção'}
                  </span>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                    {isUnlocked ? (
                      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total_amount || 0)
                    ) : (
                      `${order.order_items?.reduce((acc: number, it: any) => acc + (it.quantity || 1), 0) || 1} Peça(s) no Lote`
                    )}
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    {isUnlocked ? 'Forma Registrada' : 'Status da Oficina'}
                  </span>
                  <p className="text-xs font-bold text-purple-400 uppercase">
                    {isUnlocked
                      ? (order.payment_method ? `⚡ ${paymentLabels[order.payment_method] || order.payment_method.toUpperCase()}` : 'Não informada')
                      : '⚡ Produção Ativa'}
                  </p>
                </div>
              </div>

              {/* Financial Metadata Details (Apenas para Chefe) */}
              {isUnlocked && (order.payment_status === 'half_paid' || order.payment_status === 'paid' || (metadata?.depositAmount || 0) > 0) && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-3 text-xs">
                  {order.payment_status === 'half_paid' && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-slate-600 dark:text-zinc-400">
                        <span>Sinal Recebido:</span>
                        <strong className="text-blue-500 dark:text-blue-400">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(metadata?.depositAmount || 0)}
                        </strong>
                      </div>
                      <div className="flex justify-between items-center text-slate-600 dark:text-zinc-400">
                        <span>Restante a Pagar:</span>
                        <strong className="text-slate-900 dark:text-white font-black">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.max(0, (order.total_amount || 0) - (metadata?.depositAmount || 0)))}
                        </strong>
                      </div>
                    </div>
                  )}

                  {order.payment_status === 'paid' && (
                    <div className="flex justify-between items-center text-slate-600 dark:text-zinc-400">
                      <span>Pago integralmente em:</span>
                      <strong className="text-emerald-500 dark:text-emerald-400">
                        {metadata?.paidAt 
                          ? format(new Date(metadata.paidAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                          : format(new Date(order.updated_at || order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                        }
                      </strong>
                    </div>
                  )}

                  {/* History timeline */}
                  {metadata?.history && metadata.history.length > 0 && (
                    <div className="pt-2 border-t border-slate-200 dark:border-white/5 space-y-1.5">
                      <p className="text-[10px] font-black uppercase text-slate-400 dark:text-zinc-500">Histórico de Transações</p>
                      {metadata.history.map((h: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-[10px] text-slate-500">
                          <span>
                            {h.status === 'half_paid' ? 'Sinal' : h.status === 'paid' ? 'Quitação' : 'Pendente'} ({paymentLabels[h.method] || String(h.method).toUpperCase()})
                          </span>
                          <span>
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(h.amount)} - {format(new Date(h.timestamp), "dd/MM/yy HH:mm")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Observações */}
            {cleanNotes && (
              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-1">
                <p className="text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400">Observações Gerais</p>
                <p className="text-xs text-slate-700 dark:text-zinc-300">{cleanNotes}</p>
              </div>
            )}

            {/* Anexos / Fotos */}
            {metadata?.attachmentUrls && metadata.attachmentUrls.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <span>📎</span> Anexos do Pedido ({metadata.attachmentUrls.length})
                </p>
                <div className="flex flex-wrap gap-3">
                  {metadata.attachmentUrls.map((url: string, i: number) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative w-20 h-20 rounded-2xl border-2 border-slate-200 dark:border-white/10 overflow-hidden hover:border-purple-500 hover:scale-105 transition-all shadow-sm"
                      title="Ver anexo em tamanho completo"
                    >
                      <img
                        src={url}
                        alt={`Anexo ${i + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <span className="text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Footer Actions */}
          <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-white/10 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between bg-slate-50 dark:bg-white/5 gap-4">
            <div>
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(order.id)}
                  className="w-full sm:w-auto px-4 py-3 sm:py-2.5 rounded-xl text-xs font-bold text-red-500 hover:bg-red-500/10 transition-colors flex items-center justify-center sm:justify-start gap-1.5"
                >
                  <Trash2 className="h-4 w-4" /> Excluir
                </button>
              )}
            </div>

            <div className="flex flex-1 flex-row items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="group flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white rounded-full transition-all duration-300 shadow-md h-12 px-3.5 hover:px-5 shrink-0"
                title="Compartilhar via WhatsApp"
              >
                <Send className="h-5 w-5 shrink-0" />
                <span className="max-w-0 overflow-hidden group-hover:max-w-[100px] group-hover:ml-2 text-xs font-bold whitespace-nowrap transition-all duration-300">
                  WhatsApp
                </span>
              </button>

              {onPriceOrder && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onPriceOrder(order);
                  }}
                  className="flex-1 sm:flex-none px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider text-white shadow-lg flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-95 animate-bounce"
                  style={{ backgroundColor: settings.primaryColor }}
                >
                  <DollarSign className="h-4 w-4" /> Precificar Pedido
                </button>
              )}

              <button
                type="button"
                onClick={handlePrintPDF}
                className="flex-1 sm:flex-none sm:px-6 py-3 rounded-2xl text-sm font-black text-white shadow-lg flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-95"
                style={{ backgroundColor: settings.primaryColor }}
              >
                <FileText className="h-5 w-5" /> Gerar Recibo
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Lightbox de Preview da Matriz */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200 cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-2xl w-full mx-4" onClick={e => e.stopPropagation()}>
            <img
              src={lightboxUrl}
              alt="Preview da Matriz"
              className="w-full h-auto rounded-3xl shadow-2xl border border-white/10 animate-in zoom-in-95 duration-200"
            />
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-4 -right-4 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white border border-white/20 transition-colors backdrop-blur-sm"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="text-center text-xs text-white/50 mt-3">Clique fora para fechar</p>
          </div>
        </div>
      )}
    </>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
