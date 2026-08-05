import React, { useState, useMemo } from 'react';
import { X, TrendingDown, Trash2, Search } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '@/utils/currencyFormatter';
import { FinancialTransaction } from '@/types/stockTypes';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DespesasDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: FinancialTransaction[];
  onRefreshData: () => void;
}

export const DespesasDetailsModal: React.FC<DespesasDetailsModalProps> = ({
  isOpen, onClose, transactions, onRefreshData
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('financial_transactions').delete().eq('id', id);
      if (error) throw error;
      toast.info('Despesa removida.');
      onRefreshData();
    } catch (err) {
      console.error('Erro ao remover:', err);
      toast.error('Erro ao remover.');
    }
  };

  const filteredTransactions = useMemo(() => transactions.filter(tx => 
    tx.type === 'expense' && (
        tx.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (tx.category || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
  ), [transactions, searchTerm]);

  const totalExpense = filteredTransactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-zinc-950 border border-rose-500/30 rounded-3xl w-full max-w-2xl p-6 space-y-6 shadow-2xl animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <TrendingDown className="h-6 w-6 text-rose-400" /> Detalhes das Despesas
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input 
            type="text" 
            placeholder="Buscar despesa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-black/60 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white outline-none focus:border-rose-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
          {filteredTransactions.length === 0 ? (
            <p className="text-center text-zinc-500 text-xs py-4">Nenhuma despesa encontrada.</p>
          ) : (
            filteredTransactions.map(tx => (
              <div key={tx.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-white">{tx.description}</p>
                  <p className="text-[10px] text-zinc-500">
                    {tx.category} • {format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm')}
                    {(tx as any).created_by_profile ? ` • Por: ${(tx as any).created_by_profile}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-black text-rose-400">{formatCurrency(tx.amount)}</p>
                  <button onClick={() => handleDelete(tx.id)} className="text-zinc-500 hover:text-rose-400">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="pt-4 border-t border-white/10 text-right">
          <p className="text-sm font-bold text-zinc-400">Total Despesas</p>
          <p className="text-3xl font-black text-rose-400">{formatCurrency(totalExpense)}</p>
        </div>
      </div>
    </div>
  );
};
