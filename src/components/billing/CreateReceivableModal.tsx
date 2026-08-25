import React, { useState, useEffect } from 'react';
import { X, DollarSign, Calendar, User, Package, Truck, Clock, Check, Plus, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { toast } from 'sonner';
import { formatCurrency } from '@/utils/currencyFormatter';
import { useProfile } from '@/contexts/ProfileContext';
import { ClientSelect } from '@/components/ui/ClientSelect';
import { parsePaymentMetadata } from '@/utils/paymentHelper';

interface ClientOption {
  id: string;
  name: string;
  phone?: string;
  company_name?: string;
}

interface OrderOption {
  id: string;
  order_number?: number;
  total_amount: number;
  payment_status: string;
  notes?: string;
}

interface CreateReceivableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CreateReceivableModal: React.FC<CreateReceivableModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const { settings } = useCompanySettings();
  const { permissions } = useProfile();
  
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [clientOrders, setClientOrders] = useState<OrderOption[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  
  const [amount, setAmount] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [productionStatus, setProductionStatus] = useState<'em_producao' | 'ja_entregue'>('em_producao');
  const [description, setDescription] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [installments, setInstallments] = useState<{ dueDate: string; amount: string }[]>([
    { dueDate: new Date().toISOString().split('T')[0], amount: '' }
  ]);
  const [isMultiInstallment, setIsMultiInstallment] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      fetchClients();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedClientId) {
      fetchOrdersForClient(selectedClientId);
    } else {
      setClientOrders([]);
      setSelectedOrderIds([]);
    }
  }, [selectedClientId]);

  const fetchClients = async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) return;

      const { data, error } = await supabase
        .from('clients')
        .select('id, name, phone, company_name')
        .eq('user_id', userId)
        .order('name', { ascending: true });

      if (error) throw error;
      setClients(data || []);
    } catch (err) {
      console.error('Erro ao buscar clientes:', err);
    }
  };

  const fetchOrdersForClient = async (clientId: string) => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, total_amount, payment_status, notes')
        .eq('client_id', clientId)
        .neq('payment_status', 'paid')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setClientOrders(data || []);
    } catch (err) {
      console.error('Erro ao buscar pedidos do cliente:', err);
    }
  };

  const handleToggleOrder = (orderId: string) => {
    setSelectedOrderIds(prev => {
      const isSelected = prev.includes(orderId);
      const next = isSelected ? prev.filter(id => id !== orderId) : [...prev, orderId];
      
      const sum = clientOrders
        .filter(o => next.includes(o.id))
        .reduce((acc, o) => {
          const { metadata } = parsePaymentMetadata(o.notes);
          const totalVal = Number(o.total_amount || 0);
          const isHalf = o.payment_status === 'half_paid';
          const depositVal = isHalf ? (metadata.depositAmount || totalVal * 0.5) : 0;
          const pendingVal = Math.max(0, totalVal - depositVal);
          return acc + pendingVal;
        }, 0);
      
      if (sum > 0) {
        setAmount(sum.toFixed(2));
      }
      
      return next;
    });
  };

  if (!isOpen) return null;

  const handleAddInstallment = () => {
    const today = new Date();
    today.setDate(today.getDate() + 30 * installments.length);
    setInstallments(prev => [...prev, { dueDate: today.toISOString().split('T')[0], amount: '' }]);
  };

  const handleRemoveInstallment = (index: number) => {
    setInstallments(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateInstallment = (index: number, field: 'dueDate' | 'amount', value: string) => {
    setInstallments(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSave = async () => {
    if (!selectedClientId) {
      toast.error('Por favor, selecione o cliente.');
      return;
    }

    const selectedClient = clients.find(c => c.id === selectedClientId);
    const clientName = selectedClient?.name || 'Cliente';

    // Validação de valores
    if (isMultiInstallment) {
      if (installments.length === 0) {
        toast.error('Adicione pelo menos uma parcela.');
        return;
      }
      for (let i = 0; i < installments.length; i++) {
        const val = parseFloat(installments[i].amount);
        if (isNaN(val) || val <= 0) {
          toast.error(`Informe um valor válido para a parcela ${i + 1}.`);
          return;
        }
      }
    } else {
      const numericAmount = parseFloat(amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        toast.error('Por favor, informe um valor válido maior que zero.');
        return;
      }
    }

    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) throw new Error('Usuário não autenticado');

      const desc = description.trim() || `Lançamento a Receber - ${clientName}`;

      const notesMetadata = {
        productionStatus,
        associatedOrderIds: selectedOrderIds,
        clientName,
        clientPhone: selectedClient?.phone || '',
        userNotes: notes.trim()
      };

      if (isMultiInstallment) {
        // Registra cada parcela com sua data e valor específicos
        for (let i = 0; i < installments.length; i++) {
          const inst = installments[i];
          const instVal = parseFloat(inst.amount);
          const instDesc = `${desc} (Parcela ${i + 1}/${installments.length})`;

          const { error } = await supabase
            .from('financial_transactions')
            .insert({
              user_id: userId,
              type: 'income',
              amount: instVal,
              description: instDesc,
              category: 'Parcela de Acordo',
              payment_method: 'other',
              date: inst.dueDate,
              due_date: inst.dueDate,
              status: 'pending',
              order_id: selectedOrderIds.length === 1 ? selectedOrderIds[0] : null,
              notes: JSON.stringify({ ...notesMetadata, installmentIndex: i + 1, totalInstallments: installments.length })
            });

          if (error) throw error;
        }
      } else {
        const numericAmount = parseFloat(amount);
        const { error } = await supabase
          .from('financial_transactions')
          .insert({
            user_id: userId,
            type: 'income',
            amount: numericAmount,
            description: desc,
            category: productionStatus === 'em_producao' ? 'A Receber (Em Produção)' : 'A Receber (Já Entregue)',
            payment_method: 'other',
            date: dueDate,
            due_date: dueDate,
            status: 'pending',
            order_id: selectedOrderIds.length === 1 ? selectedOrderIds[0] : null,
            notes: JSON.stringify(notesMetadata)
          });

        if (error) throw error;
      }

      // IMPORTANTE: Atualiza os pedidos vinculados adicionando tag [ACORDO COMERCIAL]
      // para que ELES SUMAM da lista solta de "A Receber" e fique apenas o Acordo Comercial!
      if (selectedOrderIds.length > 0) {
        for (const ordId of selectedOrderIds) {
          const ord = clientOrders.find(o => o.id === ordId);
          const currentNotes = ord?.notes || '';
          if (!currentNotes.includes('[ACORDO COMERCIAL')) {
            const updatedNotes = currentNotes 
              ? `${currentNotes}\n[ACORDO COMERCIAL - Vinculado em ${new Date().toLocaleDateString('pt-BR')}]`
              : `[ACORDO COMERCIAL - Vinculado em ${new Date().toLocaleDateString('pt-BR')}]`;

            await supabase
              .from('orders')
              .update({ notes: updatedNotes })
              .eq('id', ordId);
          }
        }
      }

      toast.success(`✨ Acordo / Entrada a receber registrado com sucesso!`);
      
      window.dispatchEvent(new CustomEvent('borda_orders_changed'));
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao registrar lançamento a receber:', err);
      toast.error('Erro ao registrar lançamento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div 
        className="relative w-full max-w-lg bg-white dark:bg-[#0f0f18] text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-100/80 dark:bg-gradient-to-r dark:from-amber-950/30 dark:via-purple-950/20 dark:to-black">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">Nova Entrada Futura (A Receber)</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Cadastre previsões de recebimento e prazos combinados</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:hover:bg-white/10 dark:text-zinc-400 dark:hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar">
          
          {/* Seletor de Status de Produção */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-zinc-400 block">
              Status da Entrega / Serviço
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setProductionStatus('em_producao')}
                className={`p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                  productionStatus === 'em_producao'
                    ? 'border-amber-500/60 bg-amber-50 dark:bg-amber-500/15 text-amber-900 dark:text-amber-300 ring-1 ring-amber-500/40'
                    : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-black">Em Produção</div>
                  <div className="text-[10px] opacity-75">Serviço sendo produzido</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setProductionStatus('ja_entregue')}
                className={`p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                  productionStatus === 'ja_entregue'
                    ? 'border-cyan-500/60 bg-cyan-50 dark:bg-cyan-500/15 text-cyan-900 dark:text-cyan-300 ring-1 ring-cyan-500/40'
                    : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 shrink-0">
                  <Truck className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-black">Já Entregue</div>
                  <div className="text-[10px] opacity-75">Entregue a prazo</div>
                </div>
              </button>
            </div>
          </div>

          {/* Seleção de Cliente */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" /> Cliente de Origem
            </label>
            <ClientSelect
              value={selectedClientId}
              onChange={setSelectedClientId}
            />
          </div>

          {/* Vínculo Opcional com Pedidos do Cliente */}
          {selectedClientId && clientOrders.length > 0 && (
            <div className="space-y-2 bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-200 dark:border-white/5">
              <label className="text-[11px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" /> Anexar Pedido(s) Pendente(s) deste Cliente
              </label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                {clientOrders.map(order => {
                  const isChecked = selectedOrderIds.includes(order.id);
                  const isHalf = order.payment_status === 'half_paid';
                  const { metadata } = parsePaymentMetadata(order.notes);
                  const totalVal = Number(order.total_amount || 0);
                  const depositVal = isHalf ? (metadata.depositAmount || totalVal * 0.5) : 0;
                  const pendingVal = Math.max(0, totalVal - depositVal);

                  return (
                    <div
                      key={order.id}
                      onClick={() => handleToggleOrder(order.id)}
                      className={`p-2.5 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition-all ${
                        isChecked
                          ? 'border-amber-500/50 bg-amber-500/10 text-slate-900 dark:text-white shadow-sm'
                          : 'border-slate-200 dark:border-white/5 bg-white dark:bg-black/30 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`h-4 w-4 rounded flex items-center justify-center border shrink-0 ${isChecked ? 'bg-amber-500 border-amber-500 text-black' : 'border-slate-300 dark:border-white/20'}`}>
                          {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900 dark:text-white">#{order.order_number || order.id.slice(0, 4)}</span>
                            {isHalf ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/40">
                                ⚡ Sinal 50% Recebido
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40">
                                ⏳ 100% Pendente
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5 flex flex-wrap items-center gap-x-2">
                            <span>Total Pedido: <strong className="text-slate-700 dark:text-zinc-300">{formatCurrency(totalVal, permissions?.canSeeFinancials ?? true)}</strong></span>
                            {isHalf && (
                              <span>• Sinal Pago: <strong className="text-emerald-600 dark:text-emerald-400">{formatCurrency(depositVal, permissions?.canSeeFinancials ?? true)}</strong></span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[9px] text-slate-400 dark:text-zinc-500 font-bold block uppercase">Restante a Cobrar</span>
                        <span className="font-black text-amber-600 dark:text-amber-400 text-sm">{formatCurrency(pendingVal, permissions?.canSeeFinancials ?? true)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Valor e Data Combinada */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-zinc-400 block">
                Valor Total (R$) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-slate-400 dark:text-zinc-500 font-bold text-sm">R$</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 font-bold focus:border-amber-500/50 outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" /> Combinado p/ Pagamento *
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 font-bold focus:border-amber-500/50 outline-none"
              />
            </div>
          </div>

          {/* Descrição e Observações */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-zinc-400 block">
              Descrição / Identificador
            </label>
            <input
              type="text"
              placeholder="Ex: Faturamento Quinzenal de Uniformes"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-200 focus:border-amber-500/50 outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-zinc-400 block">
              Observações Internas (Opcional)
            </label>
            <textarea
              rows={2}
              placeholder="Ex: Cliente prometeu pagar via PIX até às 17h..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-200 focus:border-amber-500/50 outline-none resize-none"
            />
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-white/5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white bg-slate-200 dark:bg-white/5 hover:bg-slate-300 dark:hover:bg-white/10 transition-all border border-slate-300 dark:border-white/10"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-black bg-gradient-to-r from-amber-400 to-amber-500 hover:brightness-110 shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center gap-2"
          >
            {saving ? 'REGISTRANDO...' : 'REGISTRAR A RECEBER'}
          </button>
        </div>

      </div>
    </div>
  );
};
