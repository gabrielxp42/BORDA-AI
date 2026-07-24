import React, { useState, useEffect } from 'react';
import { X, DollarSign, Send, Save, RefreshCw, Check, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { parsePaymentMetadata, serializePaymentMetadata, updatePaymentMetadata } from '@/utils/paymentHelper';

interface PaymentStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    id: string;
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
  const [method, setMethod] = useState<string>('pix');
  const [customAmount, setCustomAmount] = useState<number | ''>(0);
  const [notifyWhatsApp, setNotifyWhatsApp] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (order) {
      const initialStatus = order.payment_status || 'pending';
      setStatus(initialStatus);
      setMethod(order.payment_method || 'pix');

      const { metadata } = parsePaymentMetadata(order.notes);
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
    if (newStatus === 'paid') {
      setCustomAmount(order.total_amount || 0);
    } else if (newStatus === 'half_paid') {
      const { metadata } = parsePaymentMetadata(order.notes);
      setCustomAmount(metadata.depositAmount || (order.total_amount || 0) / 2);
    } else {
      setCustomAmount(0);
    }
  };

  if (!isOpen || !order) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const paidVal = Number(customAmount) || 0;
      
      // Parse existing metadata and update it
      const { cleanNotes, metadata: existingMetadata } = parsePaymentMetadata(order.notes);
      const updatedMetadata = updatePaymentMetadata(
        existingMetadata,
        status,
        order.total_amount,
        method,
        status === 'half_paid' ? paidVal : undefined
      );
      
      const noteWithMetadata = serializePaymentMetadata(cleanNotes, updatedMetadata);

      const { error } = await supabase
        .from('orders')
        .update({
          payment_status: status,
          payment_method: method,
          notes: noteWithMetadata
        })
        .eq('id', order.id);

      if (error) throw error;

      toast.success('Status financeiro atualizado com sucesso!');

      // Notificação opcional no WhatsApp
      if (notifyWhatsApp && order.client?.phone) {
        const statusText = status === 'paid' ? 'PAGO (100%)' : status === 'half_paid' ? `ENTRADA / SINAL (R$ ${paidVal.toFixed(2)})` : 'PENDENTE';
        const msg = `Olá ${order.client.name}!\n\nConfirmamos a atualização do seu pedido *#${order.id.slice(0, 6)}* no *${settings.systemName}*:\n💰 Status: *${statusText}*\n💵 Valor Pago: *R$ ${paidVal.toFixed(2)}*\n💳 Forma: *${method.toUpperCase()}*\n\nQualquer dúvida, estamos à disposição!`;
        window.open(`https://wa.me/${order.client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
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
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-white dark:bg-[#12121a] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
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

          {/* Forma de Pagamento */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 block">
              Forma de Pagamento
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
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center ${
                    method === pm.id
                      ? 'bg-purple-500/20 text-purple-400 border-purple-500/50 shadow-sm'
                      : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  {pm.label}
                </button>
              ))}
            </div>
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
            disabled={saving}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow-lg flex items-center gap-1.5 hover:opacity-90 transition-all disabled:opacity-50"
            style={{ backgroundColor: settings.primaryColor }}
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Pagamento
          </button>
        </div>

      </div>
    </div>
  );
};
