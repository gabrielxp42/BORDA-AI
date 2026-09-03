import React, { useState } from 'react';
import { X, AlertTriangle, CalendarClock, Copy, Trash2, Check } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ProblemaHub } from '@/services/hubHealthService';
import { parseLocalDate, toLocalDateInput } from '@/utils/dateHelper';

interface HubHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
  problemas: ProblemaHub[];
  onResolvido?: () => void;
}

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export const HubHealthModal: React.FC<HubHealthModalProps> = ({
  isOpen, onClose, problemas, onResolvido,
}) => {
  const [editandoData, setEditandoData] = useState<string | null>(null);
  const [novaData, setNovaData] = useState('');
  const [ocupado, setOcupado] = useState(false);

  if (!isOpen) return null;

  const salvarVencimento = async (id: string) => {
    if (!novaData) { setEditandoData(null); return; }
    setOcupado(true);
    try {
      const { error } = await supabase
        .from('financial_transactions')
        .update({ due_date: novaData })
        .eq('id', id);
      if (error) throw error;
      toast.success(`Cobrança marcada para ${format(parseLocalDate(novaData)!, 'dd/MM/yyyy')}.`);
      setEditandoData(null);
      onResolvido?.();
    } catch (err: any) {
      toast.error('Não foi possível salvar: ' + (err?.message || 'erro'));
    } finally {
      setOcupado(false);
    }
  };

  const apagar = async (id: string, descricao: string) => {
    if (!window.confirm(
      `Apagar este lançamento?\n\n${descricao}\n\nUse isto apenas se for repetição do mesmo acordo. Não dá para desfazer.`
    )) return;

    setOcupado(true);
    try {
      const { error } = await supabase.from('financial_transactions').delete().eq('id', id);
      if (error) throw error;
      toast.success('Lançamento repetido removido.');
      onResolvido?.();
    } catch (err: any) {
      toast.error('Não foi possível apagar: ' + (err?.message || 'erro'));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-amber-500/30 bg-white dark:bg-[#0d0d14] text-slate-900 dark:text-zinc-100 shadow-2xl overflow-hidden">

        <div className="flex items-start justify-between p-5 border-b border-slate-200 dark:border-white/10 bg-amber-500/10">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="font-black text-base sm:text-lg">Coisas para você conferir</h2>
              <p className="text-xs text-slate-600 dark:text-zinc-400">
                O sistema achou {problemas.length} ponto(s) que podem bagunçar seu fechamento.
                Nada foi alterado — você decide.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-4">
          {problemas.length === 0 ? (
            <div className="py-14 text-center">
              <Check className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
              <p className="font-bold text-sm">Está tudo em ordem por aqui.</p>
            </div>
          ) : problemas.map((p, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                <div className="flex items-center gap-2">
                  {p.tipo === 'sem_vencimento'
                    ? <CalendarClock className="h-4 w-4 text-amber-500 shrink-0" />
                    : <Copy className="h-4 w-4 text-rose-500 shrink-0" />}
                  <span className="font-black text-xs">{p.titulo}</span>
                  {p.valorTotal > 0 && (
                    <span className="ml-auto text-xs font-black text-amber-600 dark:text-amber-400 shrink-0">
                      {brl(p.valorTotal)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-zinc-400 mt-1">{p.consequencia}</p>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {p.itens.map(item => (
                  <div key={item.id} className="px-4 py-3 flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate">{item.descricao}</p>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-500">
                        {brl(item.valor)}
                        {item.status === 'paid' && ' • já quitada'}
                        {item.created_at && ` • criada ${format(new Date(item.created_at), 'dd/MM')}`}
                      </p>
                    </div>

                    {p.tipo === 'sem_vencimento' ? (
                      editandoData === item.id ? (
                        <span className="flex items-center gap-1 shrink-0">
                          <input
                            type="date"
                            autoFocus
                            value={novaData}
                            onChange={e => setNovaData(e.target.value)}
                            className="bg-white dark:bg-black/50 border border-amber-500/40 rounded-lg px-2 py-1 text-[11px] outline-none"
                          />
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() => salvarVencimento(item.id)}
                            className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/30"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setEditandoData(item.id); setNovaData(toLocalDateInput(item.due_date) || ''); }}
                          className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase hover:bg-amber-500/25 transition-colors"
                        >
                          Marcar data
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => apagar(item.id, item.descricao)}
                        title="Apagar este lançamento repetido"
                        className="shrink-0 px-3 py-1.5 rounded-xl bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[10px] font-black uppercase hover:bg-rose-500/25 transition-colors flex items-center gap-1 disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" /> Apagar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
            Na dúvida, deixe como está e chame o suporte — nada aqui é urgente a ponto de arriscar.
          </p>
        </div>
      </div>
    </div>
  );
};
