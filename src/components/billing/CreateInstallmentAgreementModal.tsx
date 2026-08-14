import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Layers, Calendar, DollarSign, Send, Check, ShieldCheck, 
  Crown, Sparkles, CreditCard, AlertCircle, Plus, Trash2, Clock,
  MessageSquare, Smartphone
} from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { formatCurrency } from '@/utils/currencyFormatter';
import { sendEvolutionText } from '@/services/whatsappService';

interface OrderItem {
  id: string;
  order_number?: number;
  total_amount: number;
  payment_status: 'pending' | 'half_paid';
  created_at: string;
}

interface CreateInstallmentAgreementModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientData: {
    id: string;
    name: string;
    phone?: string;
    company_name?: string;
    orders: OrderItem[];
  } | null;
  onAgreementCreated?: () => void;
}

interface CustomInstallment {
  index: number;
  dueDate: string;
  amount: number;
  method: string;
}

export const CreateInstallmentAgreementModal: React.FC<CreateInstallmentAgreementModalProps> = ({
  isOpen,
  onClose,
  clientData,
  onAgreementCreated
}) => {
  const { settings } = useCompanySettings();
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [downPayment, setDownPayment] = useState<number>(0);
  const [installmentCount, setInstallmentCount] = useState<number>(2);
  const [intervalDays, setIntervalDays] = useState<number>(15);
  const [firstDueDate, setFirstDueDate] = useState<string>(() => format(addDays(new Date(), 15), 'yyyy-MM-dd'));
  const [paymentMethod, setPaymentMethod] = useState<string>('pix');
  const [notifyClient, setNotifyClient] = useState<boolean>(true);
  const [notifyOwner, setNotifyOwner] = useState<boolean>(true);
  const [autoRemindDue, setAutoRemindDue] = useState<boolean>(true);
  const [reminderTiming, setReminderTiming] = useState<'3_days_before' | '1_day_before' | 'on_due_date' | 'both_before_and_on_due'>('3_days_before');
  const [manualCustomTotal, setManualCustomTotal] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Lista de parcelas personalizadas
  const [customInstallments, setCustomInstallments] = useState<CustomInstallment[]>([]);

  useEffect(() => {
    if (clientData) {
      setSelectedOrderIds(clientData.orders.map(o => o.id));
      setDownPayment(0);
      setManualCustomTotal(null);
    }
  }, [clientData]);

  // Calcula o total dos pedidos selecionados com fallback para a soma dos itens
  const grossTotalFromOrders = useMemo(() => {
    if (!clientData) return 0;
    return clientData.orders
      .filter(o => selectedOrderIds.includes(o.id))
      .reduce((acc, o) => {
        let val = Number(o.total_amount || (o as any).total_price || 0);
        if (val <= 0 && ((o as any).order_items || (o as any).items)) {
          const rawItems = (o as any).order_items || (o as any).items || [];
          val = rawItems.reduce((iAcc: number, item: any) => {
            return iAcc + Number(item.total_price || (item.unit_price ? Number(item.unit_price) * Number(item.quantity || 1) : 0));
          }, 0);
        }
        const effectiveVal = o.payment_status === 'half_paid' ? val * 0.5 : val;
        return acc + effectiveVal;
      }, 0);
  }, [clientData, selectedOrderIds]);

  // Valor total efetivo (pode ser dos pedidos ou digitado manualmente se os pedidos não tiverem valor registrado)
  const effectiveTotal = manualCustomTotal !== null ? manualCustomTotal : grossTotalFromOrders;

  // Saldo restante líquido a parcelar
  const remainingTotal = Math.max(0, effectiveTotal - downPayment);

  // Gera o cronograma de parcelas automaticamente ao alterar os campos
  useEffect(() => {
    if (remainingTotal <= 0 || installmentCount <= 0) {
      setCustomInstallments([]);
      return;
    }

    const valPerInstallment = Number((remainingTotal / installmentCount).toFixed(2));
    const baseDate = parseISO(firstDueDate || format(new Date(), 'yyyy-MM-dd'));

    const list: CustomInstallment[] = [];
    let accumulated = 0;

    for (let i = 0; i < installmentCount; i++) {
      const isLast = i === installmentCount - 1;
      const amt = isLast ? Number((remainingTotal - accumulated).toFixed(2)) : valPerInstallment;
      accumulated += amt;

      const dateObj = addDays(baseDate, i * intervalDays);
      list.push({
        index: i + 1,
        dueDate: format(dateObj, 'yyyy-MM-dd'),
        amount: amt,
        method: paymentMethod,
      });
    }

    setCustomInstallments(list);
  }, [remainingTotal, installmentCount, intervalDays, firstDueDate, paymentMethod]);

  if (!isOpen || !clientData) return null;

  const handleSaveAgreement = async () => {
    if (selectedOrderIds.length === 0) {
      toast.error('Selecione pelo menos uma encomenda para incluir no acordo.');
      return;
    }

    if (remainingTotal <= 0) {
      toast.error('O saldo devedor restante precisa ser maior que zero.');
      return;
    }

    setIsSaving(true);
    const toastId = toast.loading('Registrando acordo de parcelamento e configurando avisos da Gabi AI...');

    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) throw new Error('Usuário não autenticado');

      const selectedOrders = clientData.orders.filter(o => selectedOrderIds.includes(o.id));
      const orderNumbersStr = selectedOrders.map(o => `#${o.order_number || o.id.slice(0, 4)}`).join(', ');

      // 1. Se houve sinal / entrada paga hoje, registra como receita quitada em caixa
      if (downPayment > 0) {
        await supabase.from('financial_transactions').insert({
          user_id: userId,
          type: 'income',
          amount: downPayment,
          description: `Sinal / Entrada do Acordo ${clientData.name} (${orderNumbersStr})`,
          category: 'Entrada Acordo',
          payment_method: paymentMethod,
          date: new Date().toISOString(),
          status: 'paid',
          notes: JSON.stringify({ clientName: clientData.name, isDownPayment: true })
        });
      }

      // 2. Salva cada parcela programada no Supabase
      for (const inst of customInstallments) {
        const desc = `Parcela ${inst.index}/${installmentCount} - Acordo ${clientData.name} (${orderNumbersStr})`;
        
        await supabase.from('financial_transactions').insert({
          user_id: userId,
          type: 'income',
          amount: inst.amount,
          description: desc,
          category: 'Parcela de Acordo',
          payment_method: inst.method,
          date: inst.dueDate,
          due_date: inst.dueDate,
          status: 'pending',
          notes: JSON.stringify({
            clientName: clientData.name,
            clientPhone: clientData.phone,
            installmentIndex: inst.index,
            totalInstallments: installmentCount,
            associatedOrders: orderNumbersStr,
            notifyGabi: true,
            autoRemindDue: autoRemindDue,
            reminderTiming: reminderTiming,
            notifyClientOnDue: notifyClient,
            notifyOwnerOnDue: notifyOwner,
            reminded_dates: []
          })
        });
      }

      // 3. Notificação da Gabi Secretária via WhatsApp para o Cliente
      if (notifyClient && clientData.phone) {
        const scheduleText = customInstallments
          .map(inst => `• Parcela ${inst.index}/${installmentCount}: *R$ ${inst.amount.toFixed(2)}* em *${format(parseISO(inst.dueDate), 'dd/MM/yyyy')}*`)
          .join('\n');

        const msgClient = `*${settings.systemName || 'GUAÇU BORDADOS'}* — Acordo de Parcelamento Aprovado 📝✨\n\n` +
          `Olá *${clientData.name}*! Aqui é a *Gabi*, secretária virtual da oficina.\n\n` +
          `Registramos o seu plano de pagamento das encomendas (${orderNumbersStr}):\n\n` +
          `💰 *Total:* R$ ${effectiveTotal.toFixed(2)}\n` +
          `${downPayment > 0 ? `💵 *Entrada Quitada:* R$ ${downPayment.toFixed(2)}\n` : ''}` +
          `💳 *Saldo Parcelado:* ${installmentCount}x de R$ ${(remainingTotal / installmentCount).toFixed(2)}\n\n` +
          `📅 *Cronograma de Vencimentos:*\n${scheduleText}\n\n` +
          `${settings.pixKey ? `🔑 *Chave PIX:* ${settings.pixKey}\n` : ''}\n` +
          `Qualquer dúvida estamos à disposição!`;

        sendEvolutionText(clientData.phone, msgClient);
      }

      // 4. Notificação da Gabi Secretária para o Chefe / Diretor
      if (notifyOwner && settings.ownerPhone) {
        const msgOwner = `👑 *AVISO PARA O CHEFE — GABI AI*\n\n` +
          `Acordo de parcelamento confirmado com o cliente *${clientData.name}*!\n\n` +
          `📋 Encomendas: ${orderNumbersStr}\n` +
          `💰 Saldo Restante: *R$ ${remainingTotal.toFixed(2)}* em *${installmentCount}x*\n` +
          `📅 1º Vencimento: *${format(parseISO(firstDueDate), 'dd/MM/yyyy')}*\n\n` +
          `A Gabi monitorará o vencimento de cada parcela e te avisará!`;

        sendEvolutionText(settings.ownerPhone, msgOwner);
      }

      toast.success(`🎉 Acordo de ${installmentCount}x salvo com sucesso!`, { id: toastId });
      if (onAgreementCreated) onAgreementCreated();
      onClose();
    } catch (err: any) {
      console.error('Erro ao registrar acordo:', err);
      toast.error('Erro ao salvar acordo: ' + err.message, { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999999] flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-2xl animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0c0c14] border border-purple-500/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto text-white">
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-gradient-to-r from-purple-950/70 via-zinc-900 to-black flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-600/40 font-black">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-tight">
                Programador de Acordo & Parcelamento
              </h2>
              <p className="text-xs text-zinc-400">
                Cliente: <strong>{clientData.name}</strong> {clientData.company_name ? `(🏢 ${clientData.company_name})` : ''}
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

        {/* Form Body */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
          
          {/* Passo 1: Seleção de Pedidos */}
          <div className="space-y-2">
            <label className="text-xs font-extrabold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
              1. Encomendas do Cliente Incluídas no Acordo:
            </label>
            <div className="space-y-1.5">
              {clientData.orders.map(ord => {
                const isChecked = selectedOrderIds.includes(ord.id);
                const val = ord.payment_status === 'half_paid' ? Number(ord.total_amount) * 0.5 : Number(ord.total_amount);

                return (
                  <div
                    key={ord.id}
                    onClick={() => {
                      if (isChecked) {
                        setSelectedOrderIds(prev => prev.filter(id => id !== ord.id));
                      } else {
                        setSelectedOrderIds(prev => [...prev, ord.id]);
                      }
                    }}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer select-none transition-all active:scale-[0.99] ${
                      isChecked
                        ? 'bg-purple-500/15 border-purple-500/50 text-white shadow-md shadow-purple-950/30'
                        : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-5 w-5 rounded-lg flex items-center justify-center shrink-0 border transition-all ${
                        isChecked ? 'bg-purple-600 border-purple-400 text-white' : 'border-white/20 bg-black/40 text-transparent'
                      }`}>
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                      </div>
                      <span className="text-xs font-bold text-white">
                        Pedido #{ord.order_number || ord.id.slice(0, 4)} — ({format(new Date(ord.created_at), 'dd/MM/yyyy')})
                      </span>
                    </div>
                    <span className="text-xs font-black text-purple-300">
                      {formatCurrency(val, true)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Passo 2: Abatimento de Entrada & Saldo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-purple-300 mb-1 flex items-center justify-between">
                <span>Subtotal do Acordo</span>
                {grossTotalFromOrders === 0 && <span className="text-[9px] text-amber-400 font-bold">(Digitar Valor)</span>}
              </label>
              {grossTotalFromOrders > 0 ? (
                <div className="text-base font-black text-white py-1">
                  {formatCurrency(effectiveTotal, true)}
                </div>
              ) : (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={manualCustomTotal ?? ''}
                  onChange={(e) => setManualCustomTotal(e.target.value ? Math.max(0, Number(e.target.value)) : null)}
                  className="w-full bg-black/50 border border-purple-500/40 rounded-xl px-3 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-purple-400"
                  placeholder="R$ Digite o valor total"
                />
              )}
            </div>

            <div>
              <label className="block text-[10px] font-extrabold uppercase text-emerald-400 mb-1">
                Sinal / Entrada Já Paga (R$)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={downPayment}
                onChange={(e) => setDownPayment(Math.max(0, Number(e.target.value)))}
                className="w-full bg-black/50 border border-emerald-500/30 rounded-xl px-3 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-emerald-500"
                placeholder="R$ 0,00"
              />
            </div>

            <div>
              <label className="block text-[10px] font-extrabold uppercase text-purple-300 mb-1">
                Saldo a Parcelar
              </label>
              <div className="text-base font-black text-purple-300 py-1">
                {formatCurrency(remainingTotal, true)}
              </div>
            </div>
          </div>

          {/* Passo 3: Configuração das Parcelas */}
          <div className="space-y-3 p-4 rounded-2xl bg-white/[0.02] border border-white/10">
            <label className="text-xs font-extrabold uppercase tracking-wider text-purple-300 block">
              2. Frequência e Condições do Parcelamento:
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                  Nº de Parcelas
                </label>
                <select
                  value={installmentCount}
                  onChange={(e) => setInstallmentCount(Number(e.target.value))}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  {[1, 2, 3, 4, 5, 6, 8, 10, 12].map(n => (
                    <option key={n} value={n} className="bg-[#111118]">{n}x Parcela(s)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                  Frequência
                </label>
                <select
                  value={intervalDays}
                  onChange={(e) => setIntervalDays(Number(e.target.value))}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value={15} className="bg-[#111118]">15 em 15 Dias</option>
                  <option value={30} className="bg-[#111118]">Mensal (30 Dias)</option>
                  <option value={7} className="bg-[#111118]">Semanal (7 Dias)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                  1º Vencimento
                </label>
                <input
                  type="date"
                  value={firstDueDate}
                  onChange={(e) => setFirstDueDate(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                  Forma de Pagamento
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="pix" className="bg-[#111118]">PIX</option>
                  <option value="boleto" className="bg-[#111118]">Boleto Bancário</option>
                  <option value="card" className="bg-[#111118]">Cartão de Crédito</option>
                  <option value="cash" className="bg-[#111118]">Dinheiro</option>
                </select>
              </div>
            </div>
          </div>

          {/* Prévia dos Vencimentos */}
          {customInstallments.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 block">
                Cronograma de Vencimentos Gerado:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {customInstallments.map(inst => (
                  <div
                    key={inst.index}
                    className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 font-black text-[10px]">
                        {inst.index}ª Parcela
                      </span>
                      <span className="text-zinc-300 font-bold">
                        {format(parseISO(inst.dueDate), 'dd/MM/yyyy')}
                      </span>
                    </div>
                    <span className="font-black text-purple-200">
                      {formatCurrency(inst.amount, true)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Passo 4: Automação da Gabi Secretária AI (WhatsApp) */}
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-purple-950/40 via-zinc-900/90 to-black border border-purple-500/30 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400">
                  <Sparkles className="h-4 w-4 animate-pulse" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-purple-200">
                  Automação da Gabi Secretária AI (WhatsApp)
                </span>
              </div>
              <span className="text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                Avisos Automáticos
              </span>
            </div>

            <div className="space-y-2.5">
              {/* Chave 1: WhatsApp do Cliente */}
              <div
                onClick={() => setNotifyClient(!notifyClient)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none active:scale-[0.99] ${
                  notifyClient
                    ? 'bg-purple-600/15 border-purple-500/50 text-white shadow-lg shadow-purple-950/40'
                    : 'bg-white/[0.02] border-white/10 text-zinc-400 hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    notifyClient ? 'bg-purple-600 text-white shadow-md' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    <MessageSquare className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      Enviar resumo do acordo no WhatsApp do Cliente
                    </p>
                    <p className="text-[10px] text-zinc-400 truncate">
                      Notifica parcelas e chave PIX para {clientData.phone || 'o número do cliente'}
                    </p>
                  </div>
                </div>

                {/* Chave de Alternância (iOS Switch Button) */}
                <div className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-300 shrink-0 flex items-center ${
                  notifyClient ? 'bg-purple-600' : 'bg-zinc-800 border border-white/10'
                }`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${
                    notifyClient ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </div>
              </div>

              {/* Chave 2: Notificar Chefe / Gerente */}
              <div
                onClick={() => setNotifyOwner(!notifyOwner)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none active:scale-[0.99] ${
                  notifyOwner
                    ? 'bg-purple-600/15 border-purple-500/50 text-white shadow-lg shadow-purple-950/40'
                    : 'bg-white/[0.02] border-white/10 text-zinc-400 hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    notifyOwner ? 'bg-amber-500 text-black shadow-md' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    <Crown className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      Notificar o Chefe/Gerente sobre este parcelamento
                    </p>
                    <p className="text-[10px] text-zinc-400 truncate">
                      Envia alerta imediato no WhatsApp {settings.ownerPhone ? `(${settings.ownerPhone})` : 'do responsável'}
                    </p>
                  </div>
                </div>

                {/* Chave de Alternância (iOS Switch Button) */}
                <div className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-300 shrink-0 flex items-center ${
                  notifyOwner ? 'bg-purple-600' : 'bg-zinc-800 border border-white/10'
                }`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${
                    notifyOwner ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </div>
              </div>

              {/* Chave 3: Lembretes Automáticos Próximos ao Vencimento */}
              <div className="space-y-2 pt-1 border-t border-white/5">
                <div
                  onClick={() => setAutoRemindDue(!autoRemindDue)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none active:scale-[0.99] ${
                    autoRemindDue
                      ? 'bg-purple-600/15 border-purple-500/50 text-white shadow-lg shadow-purple-950/40'
                      : 'bg-white/[0.02] border-white/10 text-zinc-400 hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      autoRemindDue ? 'bg-emerald-500 text-black shadow-md' : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      <Clock className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        Agendar Lembretes Automáticos de Vencimento de Parcela
                      </p>
                      <p className="text-[10px] text-zinc-400 truncate">
                        Gabi IA monitora o vencimento de cada parcela e envia lembrete no WhatsApp
                      </p>
                    </div>
                  </div>

                  {/* Chave de Alternância (iOS Switch Button) */}
                  <div className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-300 shrink-0 flex items-center ${
                    autoRemindDue ? 'bg-purple-600' : 'bg-zinc-800 border border-white/10'
                  }`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${
                      autoRemindDue ? 'translate-x-6' : 'translate-x-0'
                    }`} />
                  </div>
                </div>

                {/* Subopções de Frequência do Lembrete quando ativado */}
                {autoRemindDue && (
                  <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2 animate-in fade-in duration-200">
                    <label className="text-[10px] font-black uppercase text-purple-300 block tracking-wider">
                      ⏰ Quando disparar o lembrete da parcela?
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        { id: '3_days_before', label: '🕒 3 Dias Antes do Vencimento', desc: 'Aviso prévio para o cliente se planejar' },
                        { id: '1_day_before', label: '⏳ 1 Dia Antes (Véspera)', desc: 'Lembrete direto 24h antes' },
                        { id: 'on_due_date', label: '📅 No Dia do Vencimento', desc: 'Disparo matutino no dia da cobrança' },
                        { id: 'both_before_and_on_due', label: '🚀 3 Dias Antes + No Dia "D"', desc: 'Aviso prévio + confirmação no dia' },
                      ].map(item => {
                        const isSel = reminderTiming === item.id;
                        return (
                          <div
                            key={item.id}
                            onClick={() => setReminderTiming(item.id as any)}
                            className={`p-2.5 rounded-xl border cursor-pointer select-none transition-all ${
                              isSel
                                ? 'bg-purple-600/20 border-purple-500 text-white font-bold shadow-sm'
                                : 'bg-black/40 border-white/5 text-zinc-400 hover:bg-white/5'
                            }`}
                          >
                            <p className="text-xs">{item.label}</p>
                            <p className="text-[9px] text-zinc-500 mt-0.5">{item.desc}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-white/10 bg-white/[0.02] flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Alerta explicativo de validação caso o saldo a parcelar seja <= 0 */}
          {remainingTotal <= 0 ? (
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold bg-amber-400/10 border border-amber-400/20 px-3 py-2 rounded-xl w-full sm:w-auto">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                {effectiveTotal === 0
                  ? 'Selecione uma encomenda acima ou digite o valor subtotal para liberar.'
                  : `A entrada (R$ ${downPayment}) é igual ou maior que o total (R$ ${effectiveTotal}).`}
              </span>
            </div>
          ) : <div />}

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isSaving || remainingTotal <= 0 || effectiveTotal <= 0}
              onClick={handleSaveAgreement}
              className="px-6 py-2.5 rounded-xl text-xs font-black text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:brightness-110 shadow-lg shadow-purple-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check className="h-4 w-4" />
              <span>{isSaving ? 'Salvando...' : 'Confirmar & Programar Parcelas'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
