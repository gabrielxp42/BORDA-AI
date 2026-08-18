import React, { useState, useMemo } from 'react';
import { X, Receipt, Trash2, Search } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '@/utils/currencyFormatter';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ReceitaDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalRevenue: number;
  paidTotal: number;
  pendingTotal: number;
  avgTicket: number;
  topClient: { name: string; totalAmount: number } | null;
  incomeEntries: any[];
  onRefreshData: () => void;
}

export const ReceitaDetailsModal: React.FC<ReceitaDetailsModalProps> = ({
  isOpen, 
  onClose, 
  totalRevenue, 
  paidTotal, 
  pendingTotal, 
  incomeEntries, 
  onRefreshData
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const handleDelete = async (id: string) => {
    if (!id) return;
    try {
      const { error } = await supabase.from('financial_transactions').delete().eq('id', id);
      if (error) throw error;
      toast.info('Receita manual removida.');
      onRefreshData();
    } catch (err) {
      console.error('Erro ao remover:', err);
      toast.error('Erro ao remover.');
    }
  };

  const filteredIncomes = useMemo(() => incomeEntries.filter(entry => 
    (entry.title || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (entry.paymentMethod || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (entry.profileName || '').toLowerCase().includes(searchTerm.toLowerCase())
  ), [incomeEntries, searchTerm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-zinc-950 border border-emerald-500/30 rounded-3xl w-full max-w-2xl p-6 space-y-6 shadow-2xl animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider mb-1">
              <Receipt className="h-3.5 w-3.5" /> Extrato Inteligente de Entradas
            </span>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              Detalhes das Receitas do Caixa
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-2xl transition-colors text-zinc-400 hover:text-white cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Resumo Rápido */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
            <span className="text-[10px] text-zinc-400 font-bold block">Total Liquido Recebido</span>
            <p className="text-xl font-black text-emerald-400 mt-1">{formatCurrency(paidTotal)}</p>
          </div>
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
            <span className="text-[10px] text-zinc-400 font-bold block">Faturas Pendentes</span>
            <p className="text-xl font-black text-amber-400 mt-1">{formatCurrency(pendingTotal)}</p>
          </div>
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input 
            type="text" 
            placeholder="Buscar por cliente, pedido, método ou perfil..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-black/60 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
          />
        </div>

        {/* Lista de Receitas */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-2 custom-scrollbar">
          {filteredIncomes.length === 0 ? (
            <p className="text-center text-zinc-500 text-xs py-8">Nenhuma entrada encontrada neste filtro.</p>
          ) : (
            filteredIncomes.map(entry => (
              <div key={entry.id} className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs transition-all ${
                (entry as any).isInstallment
                  ? 'bg-indigo-500/[0.07] hover:bg-indigo-500/[0.12] border-indigo-500/25'
                  : entry.isOrder
                    ? 'bg-white/[0.03] hover:bg-white/[0.06] border-white/10'
                    : 'bg-sky-500/[0.05] hover:bg-sky-500/[0.09] border-sky-500/20'
              }`}>
                <div className="space-y-1">
                  <p className="font-bold text-white text-xs flex items-center gap-2">
                    {entry.title}
                    {entry.isOrder && (
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        entry.orderStatus === 'half_paid' 
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' 
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {entry.orderStatus === 'half_paid' ? '⚡ Sinal 50%' : '✅ Quitação'}
                      </span>
                    )}
                    {/* Parcela não é pedido: recebe rótulo e cor próprios para
                        o usuário não confundir uma coisa com a outra. */}
                    {(entry as any).isInstallment && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        📆 {(entry as any).installmentLabel || 'Parcela de acordo'}
                      </span>
                    )}
                    {!entry.isOrder && !(entry as any).isInstallment && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-sky-500/20 text-sky-300 border border-sky-500/30">
                        ✍️ Lançamento manual
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-zinc-400 flex flex-wrap items-center gap-2">
                    <span>💳 {entry.paymentMethod}</span>
                    <span>•</span>
                    <span>📅 {format(entry.date, 'dd/MM/yyyy HH:mm')}</span>
                    <span>•</span>
                    <span>👤 {entry.profileName}</span>
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <p className="font-black text-emerald-400 text-sm">+ {formatCurrency(entry.amount)}</p>
                  {!entry.isOrder && (
                    <button onClick={() => handleDelete(entry.originalTx?.id)} className="text-zinc-500 hover:text-rose-400 p-1 cursor-pointer">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs">
          <span className="text-zinc-400 font-bold">Total Acumulado de Receitas</span>
          <span className="text-2xl font-black text-emerald-400">{formatCurrency(totalRevenue)}</span>
        </div>
      </div>
    </div>
  );
};
