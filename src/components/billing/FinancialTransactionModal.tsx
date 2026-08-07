import React, { useState } from 'react';
import { X, ArrowUpRight, ArrowDownRight, Check, DollarSign } from 'lucide-react';
import { FinancialTransaction, FinancialTransactionType } from '@/types/stockTypes';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { toast } from 'sonner';

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
  const [category, setCategory] = useState<string>(isIncome ? 'Venda Avulsa / Balcão' : 'Compra de Insumo');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'cash' | 'credit_card' | 'transfer' | 'other'>('pix');
  const [expenseType, setExpenseType] = useState<'fixed' | 'variable'>('variable');
  const [dueDate, setDueDate] = useState<string>('');
  const [status, setStatus] = useState<'pending' | 'paid'>('paid');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error('Informe a descrição do lançamento.');
      return;
    }
    const val = Number(amount);
    if (isNaN(val) || val <= 0) {
      toast.error('Informe um valor válido maior que zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmitTransaction({
        type,
        amount: val,
        description: description.trim(),
        category,
        payment_method: paymentMethod,
        date: new Date().toISOString(),
        expense_type: isIncome ? undefined : expenseType,
        due_date: (!isIncome && expenseType === 'fixed' && dueDate) ? dueDate : undefined,
        status: !isIncome ? status : undefined,
        notes: notes.trim() || undefined,
      });

      toast.success(isIncome ? 'Receita lançada no caixa!' : 'Despesa registrada no caixa!');
      onClose();
      setDescription('');
      setAmount('');
      setNotes('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0d0d14] shadow-2xl overflow-hidden p-6 space-y-5 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div
              className={`h-11 w-11 rounded-2xl flex items-center justify-center font-black ${
                isIncome
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}
            >
              {isIncome ? <ArrowUpRight className="h-6 w-6" /> : <ArrowDownRight className="h-6 w-6" />}
            </div>
            <div>
              <h3 className="text-lg font-black text-white">
                {isIncome ? '⚡ Nova Receita / Entrada' : '📉 Nova Despesa / Saída de Caixa'}
              </h3>
              <p className="text-xs text-zinc-400">
                {isIncome ? 'Lançar recebimentos avulsos no financeiro' : 'Lançar contas pagas, insumos e custos'}
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

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Valor */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              Valor (R$) *
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-zinc-400 text-sm">R$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0.00"
                className={`w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-lg font-black focus:outline-none transition-colors ${
                  isIncome ? 'text-emerald-400 focus:border-emerald-500' : 'text-rose-400 focus:border-rose-500'
                }`}
                required
              />
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              Descrição do Lançamento *
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isIncome ? 'Ex: Serviço de Digitalização de Matriz' : 'Ex: Compra de Linha Lumina + Entretela'}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
              required
            />
          </div>

          {/* Categoria */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              Categoria do Lançamento
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
            >
              {isIncome ? (
                <>
                  <option value="Venda Avulsa / Balcão" className="bg-[#111118]">💰 Venda Avulsa / Balcão</option>
                  <option value="Serviço de Programação / Matriz" className="bg-[#111118]">💻 Serviço de Programação / Matriz</option>
                  <option value="Sinal de Pedido" className="bg-[#111118]">💵 Sinal de Pedido</option>
                  <option value="Outras Receitas" className="bg-[#111118]">✨ Outras Receitas</option>
                </>
              ) : (
                <>
                  <option value="Compra de Insumo / Linha" className="bg-[#111118]">🧵 Compra de Insumo / Linha / Entretela</option>
                  <option value="Manutenção de Máquinas" className="bg-[#111118]">⚙️ Manutenção de Bordadeira</option>
                  <option value="Energia / Contas" className="bg-[#111118]">⚡ Conta de Energia / Água / Net</option>
                  <option value="Aluguel / Estrutura" className="bg-[#111118]">🏢 Aluguel / Espaço</option>
                  <option value="Salários / Pró-Labore" className="bg-[#111118]">👤 Salários / Pró-Labore</option>
                  <option value="Outras Despesas" className="bg-[#111118]">🧾 Outras Despesas Operacionais</option>
                </>
              )}
            </select>
          </div>

          {/* Tipo de Despesa (Fixo vs Variável) */}
          {!isIncome && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-white/5 border border-white/10">
              <button
                type="button"
                onClick={() => setExpenseType('variable')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                  expenseType === 'variable' 
                    ? 'bg-purple-600 text-white shadow-md' 
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
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
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
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
                <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-300 mb-1">
                  Data de Vencimento *
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-black/40 border border-amber-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-300 mb-1">
                  Status da Fatura
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full bg-black/40 border border-amber-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                >
                  <option value="pending" className="bg-[#111118]">⏳ A Vencer / Pendente</option>
                  <option value="paid" className="bg-[#111118]">✅ Já Paga</option>
                </select>
              </div>
            </div>
          )}

          {/* Forma de Pagamento */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              Forma de Pagamento
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
            >
              <option value="pix" className="bg-[#111118]">⚡ Pix</option>
              <option value="cash" className="bg-[#111118]">💵 Dinheiro em Espécie</option>
              <option value="credit_card" className="bg-[#111118]">💳 Cartão de Crédito / Débito</option>
              <option value="transfer" className="bg-[#111118]">🏦 Transferência Bancária / TED</option>
              <option value="other" className="bg-[#111118]">Outro</option>
            </select>
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
