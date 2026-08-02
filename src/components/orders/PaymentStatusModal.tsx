import React, { useState, useEffect } from 'react';
import { X, DollarSign, Send, Save, RefreshCw, Check, MessageCircle, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { parsePaymentMetadata, serializePaymentMetadata, updatePaymentMetadata, formatPaymentMethodName } from '@/utils/paymentHelper';
import { sendEvolutionText } from '@/services/whatsappService';
import { format } from 'date-fns';

interface PaymentStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    id: string;
    order_number?: number;
    client?: { name: string; phone?: string };
    payment_status: 'pending' | 'paid' | 'half_paid';
    payment_method?: string;
    total_amount: number;
    notes?: string;
  } | null;
  onStatusUpdated?: () => void;
}

export const PaymentStatusModal: React.FC<PaymentStatusModalProps> = ({
  isOpen,
  onClose,
  order,
  onStatusUpdated
}) => {
  const { settings } = useCompanySettings();
  const [status, setStatus] = useState<'pending' | 'paid' | 'half_paid'>('pending');
  const [method, setMethod] = useState<string>('');
  const [customAmount, setCustomAmount] = useState<number | ''>(0);
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [notifyWhatsApp, setNotifyWhatsApp] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && order) {
      const initialStatus = order.payment_status || 'pending';
      setStatus(initialStatus);

      // Lê metadados salvos para persistência entre dispositivos
      const { metadata } = parsePaymentMetadata(order.notes);
      const savedMethod = order.payment_method || metadata.paymentMethod || '';
      
      setMethod(initialStatus === 'pending' ? '' : savedMethod);
      setPaymentNote(metadata.paymentNote || '');

      if (initialStatus === 'paid') {
        setCustomAmount(order.total_amount || 0);
      } else if (initialStatus === 'half_paid') {
        setCustomAmount(metadata.depositAmount || (order.total_amount || 0) / 2);
      } else {
        setCustomAmount(0);
      }
    }
  }, [order, isOpen]);

  const handleStatusChange = (newStatus: 'pending' | 'paid' | 'half_paid') => {
    setStatus(newStatus);
    if (!order) return;

    if (newStatus === 'pending') {
      setMethod('');
      setCustomAmount(0);
    } else if (newStatus === 'paid') {
      setCustomAmount(order.total_amount || 0);
    } else if (newStatus === 'half_paid') {
      const { metadata } = parsePaymentMetadata(order.notes);
      setCustomAmount(metadata.depositAmount || (order.total_amount || 0) / 2);
    }
  };

  const isMethodRequired = status === 'paid' || status === 'half_paid';
  const isMethodSelected = Boolean(method && method.trim().length > 0);
  const isSaveDisabled = saving || (isMethodRequired && !isMethodSelected);

  if (!isOpen || !order) return null;

  const handleSave = async () => {
    if (isMethodRequired && !isMethodSelected) {
      toast.error('⚠️ Seleção Obrigatória: Escolha a Forma de Pagamento (PIX, Dinheiro, Cartão ou Transferência) para salvar!');
      return;
    }

    setSaving(true);
    try {
      const paidVal = Number(customAmount) || 0;
      const selectedMethod = status === 'pending' ? '' : method;
      
      // Parse existing metadata and update it
      const { cleanNotes, metadata: existingMetadata } = parsePaymentMetadata(order.notes);
      const updatedMetadata = updatePaymentMetadata(
        existingMetadata,
        status,
        order.total_amount,
        selectedMethod,
        status === 'half_paid' ? paidVal : undefined,
        paymentNote
      );
      
      const noteWithMetadata = serializePaymentMetadata(cleanNotes, updatedMetadata);

      const { error } = await supabase
        .from('orders')
        .update({
          payment_status: status,
          payment_method: selectedMethod,
          notes: noteWithMetadata
        })
        .eq('id', order.id);

      if (error) throw error;

      toast.success('Status financeiro atualizado com sucesso!');

      // Notificação nativa via WhatsApp Evolution API com Toast em tempo real
      if (notifyWhatsApp && order.client?.phone) {
        const toastId = toast.loading("📲 Enviando recibo de pagamento via WhatsApp...");
        try {
          const statusText = status === 'paid' 
            ? `PAGO 100% (R$ ${order.total_amount.toFixed(2)})` 
            : status === 'half_paid' 
            ? `ENTRADA / SINAL (R$ ${paidVal.toFixed(2)})` 
            : 'PENDENTE';
          
          const methodText = formatPaymentMethodName(selectedMethod) || 'N/A';
          const noteText = paymentNote ? `\n📝 *Obs:* ${paymentNote}` : '';

          const msg = `*${settings.systemName || 'BORDA AI'}* — Confirmamos o recebimento do seu pagamento!\n\n` +
            `📋 *Pedido:* #${order.order_number || order.id.slice(0, 6)}\n` +
            `👤 *Cliente:* ${order.client.name}\n` +
            `💰 *Status:* ${statusText}\n` +
            `💳 *Forma de Pagamento:* ${methodText}${noteText}\n` +
            `⏰ *Data/Hora:* ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}\n\n` +
            `Qualquer dúvida, estamos à disposição!`;

          const res = await sendEvolutionText(order.client.phone, msg);
          if (res && res.success) {
            toast.success("✅ Recibo de pagamento entregue no WhatsApp do cliente!", { id: toastId });
          } else {
            toast.info("WhatsApp Evolution API indisponível. Abrindo link do WhatsApp Web...", { id: toastId });
            window.open(`https://wa.me/${order.client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
          }
        } catch (e) {
          toast.error("Erro no envio do WhatsApp.", { id: toastId });
        }
      }

      if (onStatusUpdated) onStatusUpdated();
      onClose();
    } catch (err) {
      console.error("Erro ao atualizar pagamento:", err);
      toast.error("Erro ao atualizar pagamento.");
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div 
        className="relative w-full max-w-md max-h-[92vh] bg-white dark:bg-[#12121a] border border-slate-200 dark:border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-white/5">
          <div className="flex items-center gap-3">
            <div 
              className="p-2.5 rounded-2xl text-white shadow-md"
              style={{ backgroundColor: settings.primaryColor }}
            >
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Atualizar Pagamento #{order.id.slice(0, 6)}
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {order.client?.name || 'Cliente'} • Total: <strong className="text-slate-800 dark:text-zinc-200">R$ {(order.total_amount || 0).toFixed(2)}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-zinc-400 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          
          {/* Seletor de Status */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 block">
              Status do Pagamento
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'pending', label: 'Pendente', color: 'bg-amber-500/20 text-amber-500 border-amber-500/50' },
                { id: 'half_paid', label: 'Sinal 50%', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50' },
                { id: 'paid', label: 'Pago (100%)', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' },
              ].map(st => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => handleStatusChange(st.id as any)}
                  className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center flex flex-col items-center gap-1 ${
                    status === st.id ? st.color + ' shadow-sm' : 'border-slate-200 dark:border-white/10 text-slate-400 opacity-60 hover:opacity-100'
                  }`}
                >
                  <span>{st.label}</span>
                  {status === st.id && <Check className="h-3 w-3" />}
                </button>
              ))}
            </div>
          </div>

          {/* Campo de Entrada de Valor do Sinal / Pago */}
          <AnimatePresence>
            {status === 'half_paid' && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                className="space-y-1.5 overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                    Valor Recebido / Entrada (R$)
                  </label>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500">
                    Total do Pedido: R$ {(order.total_amount || 0).toFixed(2)}
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 dark:text-zinc-500">
                    R$
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={customAmount}
                    onChange={e => setCustomAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm font-black text-slate-900 dark:text-white focus:outline-none focus:border-brand transition-all"
                    style={{ borderColor: `${settings.primaryColor}30` }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Forma de Pagamento (Exibida Apenas se Sinal 50% ou Pago 100%) */}
          {status !== 'pending' ? (
            <div className="space-y-2 animate-in fade-in duration-200">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center justify-between">
                <span>Forma de Pagamento</span>
                {!method && (
                  <span className="text-[10px] font-bold text-amber-400 animate-pulse">⚠️ Escolha uma opção</span>
                )}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'pix', label: '⚡ PIX' },
                  { id: 'credit_card', label: '💳 Cartão' },
                  { id: 'cash', label: '💵 Dinheiro' },
                  { id: 'transfer', label: '🏦 Transferência' },
                ].map(pm => (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setMethod(pm.id)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                      method === pm.id
                        ? 'bg-purple-500/20 text-purple-400 border-purple-500/60 shadow-md ring-1 ring-purple-500/30'
                        : !method
                        ? 'border-amber-500/40 text-zinc-400 hover:bg-white/5'
                        : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
              <span>📌 Pedido marcado como Pendente. Altere o status acima para <strong>Sinal 50%</strong> ou <strong>Pago 100%</strong> para registrar a forma de pagamento.</span>
            </div>
          )}

          {/* Observação do Pagamento (Persistida no Banco de Dados) */}
          <div className="space-y-1.5 pt-1">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-purple-400" />
              <span>Observação do Pagamento (Opcional)</span>
            </label>
            <input
              type="text"
              value={paymentNote}
              onChange={e => setPaymentNote(e.target.value)}
              placeholder="Ex: Pago com desconto, enviado comprovante no WhatsApp..."
              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-purple-500/50 transition-all"
            />
          </div>

          {/* Card Interativo Notificar via WhatsApp (Estilo Verde WhatsApp Premium) */}
          <div 
            onClick={() => setNotifyWhatsApp(!notifyWhatsApp)}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
              notifyWhatsApp
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 shadow-md shadow-emerald-500/5'
                : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 opacity-70 hover:opacity-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl transition-all ${notifyWhatsApp ? 'bg-[#25D366] text-white shadow-md shadow-[#25D366]/30' : 'bg-slate-200 dark:bg-white/10 text-slate-400'}`}>
                <MessageCircle className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                  Notificar via WhatsApp
                  {notifyWhatsApp && <span className="text-[10px] bg-[#25D366]/20 text-[#25D366] px-2 py-0.2 rounded-full font-bold">Ativo</span>}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-zinc-400">Enviar recibo atualizado ao salvar</p>
              </div>
            </div>

            {/* Toggle Switch */}
            <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${notifyWhatsApp ? 'bg-[#25D366]' : 'bg-slate-300 dark:bg-white/20'}`}>
              <div className={`w-4 h-4 rounded-full bg-white transition-transform shadow-md ${notifyWhatsApp ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-end gap-2 bg-slate-50 dark:bg-white/5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaveDisabled}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg flex items-center gap-1.5 transition-all ${
              isSaveDisabled
                ? 'bg-zinc-800 text-zinc-400 border border-zinc-700 cursor-not-allowed opacity-70'
                : 'text-white hover:opacity-90 active:scale-95 cursor-pointer'
            }`}
            style={{ backgroundColor: isSaveDisabled ? undefined : settings.primaryColor }}
          >
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" /> Salvando...
              </>
            ) : isMethodRequired && !isMethodSelected ? (
              <>
                ⚠️ Selecione a Forma de Pagamento
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Salvar Pagamento
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
