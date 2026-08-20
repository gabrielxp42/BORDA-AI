import React, { useState, useEffect, useMemo } from 'react';
import { X, DollarSign, Send, Save, RefreshCw, Check, MessageCircle, FileText, Calendar, Layers } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { parsePaymentMetadata, serializePaymentMetadata, updatePaymentMetadata, formatPaymentMethodName } from '@/utils/paymentHelper';
import { useProfile } from '@/contexts/ProfileContext';
import { sendEvolutionText } from '@/services/whatsappService';
import { format } from 'date-fns';

export function calculateOrderExactValue(ord: any): number {
  if (!ord) return 0;
  let total = Number(ord.total_amount || 0);
  if (total > 0) return total;

  const items = ord.order_items || ord.items || [];
  if (Array.isArray(items) && items.length > 0) {
    return items.reduce((acc: number, item: any) => {
      const p = Number(item.total_price || item.total || item.price || item.unit_price || item.val || 0);
      const q = Number(item.quantity || item.qty || 1);
      const itemVal = p > 0 ? (item.total_price ? p : p * q) : 0;
      return acc + itemVal;
    }, 0);
  }
  return 0;
}

export function calculateOrderPendingVal(ord: any): number {
  const total = calculateOrderExactValue(ord);
  if (ord?.payment_status === 'paid') return 0;
  if (ord?.payment_status === 'half_paid') {
    const { metadata } = parsePaymentMetadata(ord?.notes);
    if (metadata.depositAmount && metadata.depositAmount > 0) {
      return Math.max(0, total - metadata.depositAmount);
    }
    return total * 0.5;
  }
  return total;
}

interface PaymentStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  order?: {
    id: string;
    order_number?: number;
    client?: { name: string; phone?: string };
    payment_status: 'pending' | 'paid' | 'half_paid';
    payment_method?: string;
    total_amount: number;
    notes?: string;
    due_date?: string;
    order_items?: any[];
  } | null;
  /** Suporte a Múltiplos Pedidos para Quitação Coletiva em Lote (Quitar Tudo) */
  orders?: any[] | null;
  onStatusUpdated?: () => void;
  /** Se true ou se defaultStatus for 'paid', pre-seleciona Pago (100%) para dar baixa direto */
  isBaixaMode?: boolean;
  defaultStatus?: 'pending' | 'paid' | 'half_paid';
}

export const PaymentStatusModal: React.FC<PaymentStatusModalProps> = ({
  isOpen,
  onClose,
  order,
  orders,
  onStatusUpdated,
  isBaixaMode = false,
  defaultStatus
}) => {
  const { settings } = useCompanySettings();
  const { activeProfile } = useProfile();

  // Lista normalizada de pedidos a processar
  const targetOrders = useMemo(() => {
    if (orders && orders.length > 0) return orders;
    if (order) return [order];
    return [];
  }, [order, orders]);

  // Verifica se é uma transação manual/avulsa ou parcela de acordo
  const isTxMode = useMemo(() => {
    const first = targetOrders[0];
    return Boolean(first && (first.isManualTx || first.type === 'income' || first.rawTx || first.isAgreementParcel));
  }, [targetOrders]);

  const isMultiple = targetOrders.length > 1;
  const targetClient = targetOrders[0]?.client;

  const totalSumToPay = useMemo(() => {
    if (isTxMode) {
      const first = targetOrders[0];
      return Number(first.total_amount || first.amount || 0);
    }
    return targetOrders.reduce((acc, o) => acc + calculateOrderPendingVal(o), 0);
  }, [targetOrders, isTxMode]);

  const [status, setStatus] = useState<'pending' | 'paid' | 'half_paid'>('paid');
  const [method, setMethod] = useState<string>('pix');
  const [customAmount, setCustomAmount] = useState<number | ''>(totalSumToPay);
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [scheduledDueDate, setScheduledDueDate] = useState<string>('');
  const [customPaidAt, setCustomPaidAt] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [notifyWhatsApp, setNotifyWhatsApp] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && targetOrders.length > 0) {
      const targetDefault = defaultStatus || (isBaixaMode ? 'paid' : null);
      const firstOrd = targetOrders[0];
      const initialStatus = targetDefault 
        ? targetDefault 
        : (firstOrd.payment_status === 'pending' && isBaixaMode ? 'paid' : (firstOrd.payment_status || 'pending'));

      setStatus(initialStatus);

      const { metadata } = parsePaymentMetadata(firstOrd.notes);
      const savedMethod = firstOrd.payment_method || metadata.paymentMethod || 'pix';
      setMethod(initialStatus === 'pending' ? '' : savedMethod);

      if (initialStatus === 'paid') {
        setCustomAmount(totalSumToPay);
      } else if (initialStatus === 'half_paid') {
        setCustomAmount(Math.round((totalSumToPay / 2) * 100) / 100);
      } else {
        setCustomAmount(0);
      }
    }
  }, [isOpen, targetOrders, isBaixaMode, defaultStatus, totalSumToPay]);

  const handleStatusChange = (newStatus: 'pending' | 'paid' | 'half_paid') => {
    setStatus(newStatus);
    if (newStatus === 'pending') {
      setMethod('');
      setCustomAmount(0);
    } else if (newStatus === 'paid') {
      setCustomAmount(totalSumToPay);
    } else if (newStatus === 'half_paid') {
      setCustomAmount(Math.round((totalSumToPay / 2) * 100) / 100);
    }
  };

  const handleAmountChange = (val: number | '') => {
    setCustomAmount(val);
    if (val === '') return;
    const num = Number(val);
    if (num < totalSumToPay - 0.01 && num > 0) {
      setStatus('half_paid');
    } else if (num >= totalSumToPay - 0.01) {
      setStatus('paid');
    }
  };

  if (!isOpen || targetOrders.length === 0) return null;

  const isMethodRequired = status === 'paid' || status === 'half_paid';
  const isMethodSelected = Boolean(method && method.trim().length > 0);
  const isSaveDisabled = saving || (isMethodRequired && !isMethodSelected);

  const handleSave = async () => {
    if (isMethodRequired && !isMethodSelected) {
      toast.error('⚠️ Seleção Obrigatória: Escolha a Forma de Pagamento (PIX, Dinheiro, Cartão ou Transferência) para salvar!');
      return;
    }

    setSaving(true);
    try {
      const paidVal = Number(customAmount) || 0;
      if (paidVal <= 0 && status !== 'pending') {
        toast.error('Informe um valor válido recebido maior que zero.');
        setSaving(false);
        return;
      }

      // Blindagem contra quitação parcial acidental:
      const isPartial = paidVal < totalSumToPay - 0.01;
      const effectiveStatus: 'pending' | 'paid' | 'half_paid' = 
        status === 'pending' ? 'pending' : isPartial ? 'half_paid' : 'paid';

      const selectedMethod = effectiveStatus === 'pending' ? '' : method;
      const exactPaidAt = customPaidAt ? new Date(customPaidAt).toISOString() : new Date().toISOString();
      const operatorName = activeProfile?.name || 'Operador';

      // FLUXO A: Se for Lançamento Manual / Parcela de Acordo (tabela financial_transactions)
      if (isTxMode) {
        const txTarget = targetOrders[0];
        const txId = txTarget.id || txTarget.rawTx?.id;
        const remainingVal = Math.max(0, totalSumToPay - paidVal);

        if (!isPartial || remainingVal <= 0.01) {
          // Quitação total da transação
          const { error: txErr } = await supabase
            .from('financial_transactions')
            .update({
              status: 'paid',
              payment_method: selectedMethod || 'pix',
              amount: paidVal > 0 ? paidVal : totalSumToPay,
              date: exactPaidAt,
              updated_at: new Date().toISOString()
            })
            .eq('id', txId);

          if (txErr) throw txErr;
        } else {
          // Pagamento Parcial / Sinal de transação avulsa:
          // 1. Atualiza a transação para o valor recebido como paga
          const { error: txErr } = await supabase
            .from('financial_transactions')
            .update({
              status: 'paid',
              payment_method: selectedMethod || 'pix',
              amount: paidVal,
              date: exactPaidAt,
              description: `${txTarget.description || 'Lançamento'} (Entrada/Sinal)`,
              category: 'Sinal de Pedido',
              updated_at: new Date().toISOString()
            })
            .eq('id', txId);

          if (txErr) throw txErr;

          // 2. Insere a diferença restante como pendente no Hub de Cobranças
          const { data: authUser } = await supabase.auth.getUser();
          if (authUser?.user?.id) {
            await supabase.from('financial_transactions').insert({
              user_id: authUser.user.id,
              type: 'income',
              amount: remainingVal,
              description: `${txTarget.description || 'Lançamento'} (Restante)`,
              category: txTarget.category || 'Venda de Bordado',
              payment_method: 'other',
              date: txTarget.created_at || new Date().toISOString(),
              due_date: txTarget.due_date || txTarget.date || new Date().toISOString(),
              status: 'pending',
              notes: txTarget.notes || JSON.stringify({ clientName: targetClient?.name, clientPhone: targetClient?.phone })
            });
          }
        }

        toast.success(
          isPartial
            ? `🟡 Sinal de R$ ${paidVal.toFixed(2)} registrado! Restante de R$ ${remainingVal.toFixed(2)} continua em cobrança.`
            : '🎉 Lançamento/Parcela quitada e registrada no caixa!'
        );

        // Notificação WhatsApp para parcela/lançamento manual
        if (notifyWhatsApp && targetClient?.phone) {
          const toastId = toast.loading("📲 Enviando recibo de quitação via WhatsApp...");
          try {
            const methodText = formatPaymentMethodName(selectedMethod) || 'N/A';
            const desc = txTarget.description || 'Lançamento A Receber';
            const msg = `*${settings.systemName || 'BORDA AI'}* — Comprovante de Recebimento 📋\n\n` +
              `👤 *Cliente:* ${targetClient.name}\n` +
              `📝 *Item:* ${desc}\n` +
              `💰 *Valor Recebido:* R$ ${paidVal.toFixed(2)}\n` +
              `💳 *Forma de Pagamento:* ${methodText}\n` +
              `⏰ *Data:* ${format(new Date(exactPaidAt), "dd/MM/yyyy 'às' HH:mm")}\n\n` +
              (isPartial ? `📌 *Saldo Restante Pendente:* R$ ${remainingVal.toFixed(2)}\n\n` : '') +
              `Agradecemos a preferência!`;

            const res = await sendEvolutionText(targetClient.phone, msg);
            if (res) {
              toast.success("✅ Recibo entregue no WhatsApp!", { id: toastId });
            }
          } catch (e) {
            console.warn('Erro ao notificar WhatsApp:', e);
            toast.info("WhatsApp indisponível para este envio.", { id: toastId });
          }
        }

        window.dispatchEvent(new CustomEvent('borda_orders_changed'));
        if (onStatusUpdated) onStatusUpdated();
        onClose();
        return;
      }

      // FLUXO B: Encomendas de Produção (tabela orders)
      // 1. Atualiza todos os pedidos envolvidos no banco de dados
      for (const ord of targetOrders) {
        const { cleanNotes, metadata: existingMetadata } = parsePaymentMetadata(ord.notes);
        const ordVal = calculateOrderExactValue(ord);

        const updatedMetadata = {
          ...updatePaymentMetadata(
            existingMetadata,
            effectiveStatus,
            ordVal,
            selectedMethod,
            effectiveStatus === 'half_paid' ? paidVal / targetOrders.length : undefined,
            paymentNote
          ),
          paidAt: effectiveStatus !== 'pending' ? exactPaidAt : undefined,
          paidByOperator: effectiveStatus !== 'pending' ? operatorName : undefined,
          registeredAt: effectiveStatus !== 'pending' ? new Date().toISOString() : undefined,
          scheduledPaymentDate: scheduledDueDate || undefined,
        };

        const noteWithMetadata = serializePaymentMetadata(cleanNotes, updatedMetadata);

        await supabase
          .from('orders')
          .update({
            payment_status: effectiveStatus,
            payment_method: selectedMethod,
            due_date: scheduledDueDate ? scheduledDueDate : null,
            notes: noteWithMetadata
          })
          .eq('id', ord.id);
      }

      // 2. Sincroniza uma ÚNICA entrada financeira consolidada no Faturamento (financial_transactions)
      if (effectiveStatus !== 'pending' && paidVal > 0) {
        const { data: authUser } = await supabase.auth.getUser();
        if (authUser?.user?.id) {
          const clientNameText = targetClient?.name || 'Cliente';
          const isHalf = effectiveStatus === 'half_paid';
          const categoryText = isHalf ? 'Sinal de Pedido' : 'Venda de Bordado';
          
          const descriptionText = isMultiple
            ? `Quitação de ${targetOrders.length} Encomendas (#${targetOrders.map(o => o.order_number || o.id.slice(0, 4)).join(', ')}) de ${clientNameText}`
            : isHalf
            ? `Sinal/Entrada do Pedido #${targetOrders[0].order_number || targetOrders[0].id.slice(0, 4)} de ${clientNameText}`
            : `Recebimento Pedido #${targetOrders[0].order_number || targetOrders[0].id.slice(0, 4)} de ${clientNameText}`;

          await supabase.from('financial_transactions').insert({
            user_id: authUser.user.id,
            type: 'income',
            amount: paidVal,
            description: descriptionText,
            category: categoryText,
            payment_method: selectedMethod || 'pix',
            date: exactPaidAt,
            due_date: exactPaidAt,
            status: 'paid',
            order_id: targetOrders[0]?.id || null,
            notes: JSON.stringify({
              orderIds: targetOrders.map(o => o.id),
              paymentStatus: effectiveStatus,
              operator: operatorName,
              registeredAt: new Date().toISOString()
            })
          });
        }
      }

      toast.success(
        isMultiple 
          ? `🎉 Quitação coletiva de ${targetOrders.length} encomendas salva e sincronizada!` 
          : isPartial
          ? `🟡 Sinal de R$ ${paidVal.toFixed(2)} registrado! Restante continua em cobrança.`
          : `🎉 Quitação do Pedido #${targetOrders[0]?.order_number || ''} registrada com sucesso!`
      );

      // 3. Notificação consolidada via WhatsApp Evolution API
      if (notifyWhatsApp && targetClient?.phone) {
        const toastId = toast.loading("📲 Enviando recibo de quitação via WhatsApp...");
        try {
          const statusText = status === 'paid' 
            ? `QUITADO 100% (R$ ${paidVal.toFixed(2)})` 
            : `ENTRADA / SINAL (R$ ${paidVal.toFixed(2)})`;
          
          const methodText = formatPaymentMethodName(selectedMethod) || 'N/A';
          const noteText = paymentNote ? `\n📝 *Obs:* ${paymentNote}` : '';

          const ordersSummary = isMultiple
            ? targetOrders.map(o => `• Pedido #${o.order_number || o.id.slice(0, 4)}: R$ ${calculateOrderExactValue(o).toFixed(2)}`).join('\n')
            : `• Pedido #${targetOrders[0].order_number || targetOrders[0].id.slice(0, 4)}: R$ ${calculateOrderExactValue(targetOrders[0]).toFixed(2)}`;

          const msg = `*${settings.systemName || 'BORDA AI'}* — Confirmamos o recebimento do seu pagamento! 📋\n\n` +
            `👤 *Cliente:* ${targetClient.name}\n` +
            `📋 *Encomendas:*\n${ordersSummary}\n\n` +
            `💰 *Status:* ${statusText}\n` +
            `💳 *Forma de Pagamento:* ${methodText}${noteText}\n` +
            `⏰ *Data do Pagamento:* ${format(new Date(exactPaidAt), "dd/MM/yyyy 'às' HH:mm")}\n\n` +
            `Agradecemos a preferência! Qualquer dúvida, estamos à disposição!`;

          const res = await sendEvolutionText(targetClient.phone, msg);
          if (res) {
            toast.success("✅ Recibo de quitação entregue no WhatsApp!", { id: toastId });
          }
        } catch (e) {
          console.warn('Erro ao notificar via WhatsApp:', e);
          toast.info("WhatsApp Evolution API indisponível.", { id: toastId });
        }
      }

      window.dispatchEvent(new CustomEvent('borda_orders_changed'));
      if (onStatusUpdated) onStatusUpdated();
      onClose();
    } catch (err: any) {
      console.error('Erro ao dar baixa:', err);
      toast.error('Erro ao atualizar status de pagamento: ' + (err?.message || 'Tente novamente'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-lg bg-[#0e0e17] border border-emerald-500/30 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-5 text-white"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shadow-lg">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">
                  {isMultiple ? `Quitar ${targetOrders.length} Encomendas em Lote` : `Dar Baixa no Pedido #${targetOrders[0]?.order_number || 'Bordado'}`}
                </h3>
                <p className="text-xs text-zinc-400">
                  {targetClient?.name ? `Cliente: ${targetClient.name}` : 'Registrar recebimento'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Resumo dos Valores */}
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-emerald-300 uppercase tracking-wider">
                {isMultiple ? `Total das ${targetOrders.length} Encomendas:` : 'Valor da Encomenda:'}
              </span>
              <span className="text-xl font-black text-emerald-400">
                R$ {totalSumToPay.toFixed(2)}
              </span>
            </div>
            {isMultiple && (
              <p className="text-[11px] text-zinc-300 font-mono truncate">
                Pedidos: #{targetOrders.map(o => o.order_number || o.id.slice(0, 4)).join(', #')}
              </p>
            )}
          </div>

          {/* Seletor de Status */}
          <div className="space-y-2">
            <label className="text-xs font-black text-zinc-300 uppercase tracking-wider">
              Status do Pagamento:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleStatusChange('paid')}
                className={`py-3 px-4 rounded-2xl font-black text-xs border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  status === 'paid'
                    ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-600/30'
                    : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                }`}
              >
                <Check className="h-4 w-4" /> Quitado (100%)
              </button>

              <button
                type="button"
                onClick={() => handleStatusChange('half_paid')}
                className={`py-3 px-4 rounded-2xl font-black text-xs border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  status === 'half_paid'
                    ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/30'
                    : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                }`}
              >
                <DollarSign className="h-4 w-4" /> Sinal / Entrada (50%)
              </button>
            </div>
          </div>

          {/* Seletor de Forma de Pagamento */}
          {status !== 'pending' && (
            <div className="space-y-2">
              <label className="text-xs font-black text-zinc-300 uppercase tracking-wider">
                Forma de Pagamento Recebida: <span className="text-rose-400">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'pix', label: '🔑 PIX' },
                  { id: 'dinheiro', label: '💵 Dinheiro' },
                  { id: 'cartao', label: '💳 Cartão' },
                  { id: 'transferencia', label: '🏦 Transf.' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setMethod(item.id)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                      method === item.id
                        ? 'bg-purple-600 border-purple-400 text-white shadow-md'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Data do Pagamento Real */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-black text-zinc-300 uppercase tracking-wider block mb-1">
                Data do Recebimento:
              </label>
              <input
                type="datetime-local"
                value={customPaidAt}
                onChange={(e) => setCustomPaidAt(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="text-xs font-black text-zinc-300 uppercase tracking-wider block mb-1">
                Valor Recebido (R$):
              </label>
              <input
                type="number"
                step="0.01"
                value={customAmount}
                onChange={(e) => handleAmountChange(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-black focus:outline-none focus:border-emerald-500 text-emerald-400"
              />
            </div>
          </div>

          {/* Banner de Feedback Dinâmico sobre Quitação vs Sinal */}
          {Number(customAmount || 0) > 0 && (
            Number(customAmount) < totalSumToPay - 0.01 ? (
              <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs space-y-1 animate-in fade-in duration-200">
                <div className="flex items-center justify-between font-black">
                  <span>🟡 Sinal / Pagamento Parcial Detectado:</span>
                  <span className="bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/30">
                    Entrada: R$ {Number(customAmount).toFixed(2)}
                  </span>
                </div>
                <p className="text-[11px] text-amber-200/80 leading-relaxed font-medium">
                  Como o valor informado é menor que o total (R$ {totalSumToPay.toFixed(2)}), será registrado como <strong>Sinal de Entrada</strong>. O restante de <strong className="text-white">R$ {(totalSumToPay - Number(customAmount)).toFixed(2)}</strong> continuará <strong>pendente no Hub de Cobranças</strong> para você receber depois.
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between font-black animate-in fade-in duration-200">
                <span>🟢 Quitação Total (100%):</span>
                <span className="bg-emerald-500/20 px-2 py-0.5 rounded-md border border-emerald-500/30 text-emerald-400">
                  R$ {Number(customAmount).toFixed(2)} (Sem pendências)
                </span>
              </div>
            )
          )}

          {/* Toggle de Recibo WhatsApp Customizado Estilo iOS Glass */}
          <div 
            onClick={() => setNotifyWhatsApp(!notifyWhatsApp)}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
              notifyWhatsApp 
                ? 'bg-emerald-500/15 border-emerald-500/40 shadow-lg shadow-emerald-500/10' 
                : 'bg-white/5 border-white/10 opacity-70 hover:opacity-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`h-8 w-8 rounded-xl flex items-center justify-center transition-colors ${
                notifyWhatsApp ? 'bg-[#25D366] text-black shadow-md shadow-emerald-500/30' : 'bg-white/10 text-zinc-400'
              }`}>
                <MessageCircle className="h-4.5 w-4.5" />
              </div>
              <div>
                <span className="text-xs font-black text-white block">
                  Enviar Recibo de Quitação no WhatsApp
                </span>
                <span className="text-[10px] font-semibold text-emerald-400">
                  {notifyWhatsApp ? '✅ Cliente receberá o comprovante oficial no WhatsApp' : '⚡ Notificação automática desativada'}
                </span>
              </div>
            </div>

            {/* iOS Switch Toggle Button */}
            <div className={`w-11 h-6 rounded-full transition-colors p-0.5 relative shrink-0 ${
              notifyWhatsApp ? 'bg-[#25D366] shadow-md shadow-emerald-500/40' : 'bg-zinc-700'
            }`}>
              <div className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                notifyWhatsApp ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isSaveDisabled}
              onClick={handleSave}
              className="px-6 py-2.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-4 w-4" />
              <span>{isMultiple ? 'Confirmar Quitação em Lote' : 'Salvar Quitação'}</span>
            </button>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};
