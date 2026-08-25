import React, { useState, useEffect } from 'react';
import { X, ArrowUpRight, ArrowDownRight, Check, DollarSign, User } from 'lucide-react';
import { FinancialTransaction, FinancialTransactionType } from '@/types/stockTypes';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ClientSelect } from '@/components/ui/ClientSelect';
import { CustomSelect } from '@/components/ui/CustomSelect';

interface FinancialTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: FinancialTransactionType; // 'income' | 'expense'
  onSubmitTransaction: (transaction: Omit<FinancialTransaction, 'id' | 'created_at'>) => void;
}

export const FinancialTransactionModal: React.FC<FinancialTransactionModalProps> = ({
  isOpen,
  onClose,
  type,
  onSubmitTransaction,
}) => {
  const { settings } = useCompanySettings();

  const isIncome = type === 'income';

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [category, setCategory] = useState<string>(isIncome ? 'Venda Avulsa / Balcão' : 'Compra de Insumo / Linha');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'cash' | 'credit_card' | 'transfer' | 'other'>('pix');
  const [expenseType, setExpenseType] = useState<'fixed' | 'variable'>('variable');
  const [dueDate, setDueDate] = useState<string>('');
  const [status, setStatus] = useState<'pending' | 'paid'>('paid');
  const [customDate, setCustomDate] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchClients();
    }
  }, [isOpen]);

  const fetchClients = async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) return;

      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .eq('user_id', userId)
        .order('name', { ascending: true });

      if (error) throw error;
      setClients(data || []);
    } catch (err) {
      console.error('Erro ao buscar clientes:', err);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) {
      toast.error('Informe um valor válido maior que zero.');
      return;
    }
    if (!description.trim()) {
      toast.error('Informe a descrição do lançamento.');
      return;
    }

    setIsSubmitting(true);
    try {
      const finalDate = customDate ? new Date(customDate).toISOString() : new Date().toISOString();
      const finalDueDate = expenseType === 'fixed' && dueDate ? dueDate : finalDate.split('T')[0];

      onSubmitTransaction({
        type,
        amount: Number(amount),
        description: description.trim(),
        category,
        payment_method: paymentMethod,
        date: finalDate,
        due_date: finalDueDate,
        status,
        order_id: selectedClientId ? `client:${selectedClientId}` : undefined,
        notes: notes.trim() || undefined,
      });

      toast.success(isIncome ? 'Receita lançada no caixa!' : 'Despesa lançada no caixa!');
      window.dispatchEvent(new CustomEvent('borda_orders_changed'));
      onClose();
    } catch (err) {
      console.error('Erro ao submeter transação:', err);
      toast.error('Erro ao salvar lançamento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusOptions = [
    { value: 'paid', label: '✅ Quitada / Entrou no Caixa' },
    { value: 'pending', label: '⏳ Pendente (A Receber / A Pagar)' },
  ];

  const incomeCategories = [
    { value: 'Venda Avulsa / Balcão', label: '💰 Venda Avulsa / Balcão' },
    { value: 'Serviço de Programação / Matriz', label: '💻 Serviço de Programação / Matriz' },
    { value: 'Sinal de Pedido', label: '💵 Sinal de Pedido' },
    { value: 'Outras Receitas', label: '✨ Outras Receitas' },
  ];

  const expenseCategories = [
    { value: 'Compra de Insumo / Linha', label: '🧵 Compra de Insumo / Linha / Entretela' },
    { value: 'Manutenção de Máquinas', label: '⚙️ Manutenção de Bordadeira' },
    { value: 'Energia / Contas', label: '⚡ Conta de Energia / Água / Net' },
    { value: 'Aluguel / Estrutura', label: '🏢 Aluguel / Espaço' },
    { value: 'Salários / Pró-Labore', label: '👤 Salários / Pró-Labore' },
    { value: 'Outras Despesas', label: '🧾 Outras Despesas Operacionais' },
  ];

  const paymentMethodOptions = [
    { value: 'pix', label: '⚡ Pix' },
    { value: 'cash', label: '💵 Dinheiro em Espécie' },
    { value: 'credit_card', label: '💳 Cartão de Crédito / Débito' },
    { value: 'transfer', label: '🏦 Transferência Bancária / TED' },
    { value: 'other', label: 'Outro' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md max-h-[90dvh] overflow-y-auto custom-scrollbar rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d0d14] text-slate-900 dark:text-zinc-100 shadow-2xl p-5 sm:p-6 space-y-5 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div
              className={`h-11 w-11 rounded-2xl flex items-center justify-center font-black ${
                isIncome
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30'
              }`}
            >
              {isIncome ? <ArrowUpRight className="h-6 w-6" /> : <ArrowDownRight className="h-6 w-6" />}
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                {isIncome ? '⚡ Nova Receita / Entrada' : '📉 Nova Despesa / Saída de Caixa'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {isIncome ? 'Lançar recebimentos avulsos no financeiro' : 'Lançar contas pagas, insumos e custos'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Valor */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-400 mb-1.5">
              Valor (R$) *
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400 dark:text-zinc-400 text-sm">R$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0.00"
                className={`w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl pl-11 pr-4 py-3 text-lg font-black focus:outline-none transition-colors ${
                  isIncome ? 'text-emerald-600 dark:text-emerald-400 focus:border-emerald-500' : 'text-rose-600 dark:text-rose-400 focus:border-rose-500'
                }`}
                required
              />
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-400 mb-1.5">
              Descrição do Lançamento *
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isIncome ? 'Ex: Serviço de Digitalização de Matriz' : 'Ex: Compra de Linha Lumina + Entretela'}
              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 transition-colors"
              required
            />
          </div>

          {/* Data do Lançamento & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-400 mb-1.5">
                📅 Data do Lançamento
              </label>
              <input
                type="datetime-local"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-3 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-400 mb-1.5">
                Status da Transação
              </label>
              <CustomSelect
                options={statusOptions}
                value={status}
                onChange={(val) => setStatus(val as any)}
              />
            </div>
          </div>

          {/* Categoria */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-400 mb-1.5">
              Categoria do Lançamento
            </label>
            <CustomSelect
              options={isIncome ? incomeCategories : expenseCategories}
              value={category}
              onChange={setCategory}
            />
          </div>

          {/* Cliente Vincular (Opcional) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-400 mb-1.5 flex items-center justify-between">
              <span>Cliente (Opcional)</span>
              <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-normal">Vincular a um cadastro</span>
            </label>
            <ClientSelect
              value={selectedClientId}
              onChange={setSelectedClientId}
            />
          </div>

          {/* Tipo de Despesa (Fixo vs Variável) */}
          {!isIncome && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setExpenseType('variable')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                  expenseType === 'variable' 
                    ? 'bg-purple-600 text-white shadow-md' 
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                💸 Gasto Variável
              </button>
              <button
                type="button"
                onClick={() => setExpenseType('fixed')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                  expenseType === 'fixed' 
                    ? 'bg-amber-600 text-white shadow-md' 
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                📌 Gasto Fixo / Conta
              </button>
            </div>
          )}

          {/* Vencimento e Status para Gastos Fixos */}
          {!isIncome && expenseType === 'fixed' && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">
                  Data de Vencimento *
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-white dark:bg-black/40 border border-amber-500/30 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-400"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">
                  Status da Fatura
                </label>
                <CustomSelect
                  options={[
                    { value: 'pending', label: '⏳ A Vencer / Pendente' },
                    { value: 'paid', label: '✅ Já Paga' }
                  ]}
                  value={status}
                  onChange={(val) => setStatus(val as any)}
                />
              </div>
            </div>
          )}

          {/* Forma de Pagamento */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-400 mb-1.5">
              Forma de Pagamento
            </label>
            <CustomSelect
              options={paymentMethodOptions}
              value={paymentMethod}
              onChange={(val) => setPaymentMethod(val as any)}
            />
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-3.5 rounded-2xl font-black text-sm text-white shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 ${
                isIncome
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:brightness-110 shadow-emerald-500/25'
                  : 'bg-gradient-to-r from-rose-600 to-amber-600 hover:brightness-110 shadow-rose-500/25'
              }`}
            >
              <Check className="h-4 w-4" />
              <span>{isSubmitting ? 'Salvando...' : isIncome ? 'Lançar Receita no Caixa' : 'Lançar Despesa no Caixa'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
