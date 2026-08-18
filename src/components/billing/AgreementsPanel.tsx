import React, { useMemo, useState } from 'react';
import {
  CalendarClock, Search, AlertTriangle, CheckCircle2, Clock, ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import { Agreement } from '@/services/installmentService';
import { parseLocalDate, diffInDays } from '@/utils/dateHelper';

interface AgreementsPanelProps {
  agreements: Agreement[];
  onOpenAgreement: (a: Agreement) => void;
  canSeeFinancials?: boolean;
}

const brl = (v: number, pode = true) =>
  pode
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
    : 'R$ ***';

type Filtro = 'abertos' | 'atrasados' | 'quitados' | 'todos';

const FILTROS: Array<{ id: Filtro; label: string }> = [
  { id: 'abertos', label: 'Em aberto' },
  { id: 'atrasados', label: 'Atrasados' },
  { id: 'quitados', label: 'Quitados' },
  { id: 'todos', label: 'Todos' },
];

/** Um acordo está atrasado se a próxima parcela em aberto já venceu. */
function estaAtrasado(a: Agreement): boolean {
  if (a.isSettled || !a.nextDue?.due_date) return false;
  return diffInDays(parseLocalDate(a.nextDue.due_date)!, new Date()) < 0;
}

export const AgreementsPanel: React.FC<AgreementsPanelProps> = ({
  agreements, onOpenAgreement, canSeeFinancials = true,
}) => {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('abertos');

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return agreements.filter(a => {
      if (filtro === 'abertos' && a.isSettled) return false;
      if (filtro === 'quitados' && !a.isSettled) return false;
      if (filtro === 'atrasados' && !estaAtrasado(a)) return false;
      if (!termo) return true;
      return `${a.clientName} ${a.associatedOrders}`.toLowerCase().includes(termo);
    });
  }, [agreements, busca, filtro]);

  const totais = useMemo(() => {
    const abertos = agreements.filter(a => !a.isSettled);
    return {
      aReceber: abertos.reduce((s, a) => s + a.pendingTotal, 0),
      qtdAbertos: abertos.length,
      qtdAtrasados: agreements.filter(estaAtrasado).length,
    };
  }, [agreements]);

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-amber-300">A receber em parcelas</span>
          <p className="text-sm sm:text-lg font-black text-amber-400 mt-0.5">{brl(totais.aReceber, canSeeFinancials)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Acordos abertos</span>
          <p className="text-sm sm:text-lg font-black text-white mt-0.5">{totais.qtdAbertos}</p>
        </div>
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-rose-300">Atrasados</span>
          <p className="text-sm sm:text-lg font-black text-rose-400 mt-0.5">{totais.qtdAtrasados}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar acordo por cliente ou pedido..."
            className="w-full bg-black/50 border border-white/10 rounded-2xl pl-9 pr-4 py-2.5 text-xs text-zinc-200 outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex gap-1.5">
          {FILTROS.map(f => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all ${
                filtro === f.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                  : 'bg-white/5 text-zinc-400 hover:text-white border border-white/10'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {lista.length === 0 ? (
        <div className="py-14 text-center border border-dashed border-white/10 rounded-2xl">
          <CalendarClock className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-zinc-500 text-sm font-semibold">Nenhum acordo de parcelamento aqui.</p>
          <p className="text-zinc-600 text-xs mt-1">Crie um acordo a partir das faturas de um cliente.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map(a => {
            const atrasado = estaAtrasado(a);
            const venc = parseLocalDate(a.nextDue?.due_date);
            const progresso = a.totalCount ? Math.round((a.paidCount / a.totalCount) * 100) : 0;

            return (
              <button
                key={a.agreementId}
                type="button"
                onClick={() => onOpenAgreement(a)}
                className={`w-full text-left rounded-2xl border px-4 py-3.5 transition-all active:scale-[0.995] hover:bg-white/[0.06] ${
                  a.isSettled
                    ? 'border-emerald-500/20 bg-emerald-500/[0.06]'
                    : atrasado
                      ? 'border-rose-500/30 bg-rose-500/[0.06]'
                      : 'border-indigo-500/20 bg-indigo-500/[0.05]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 shrink-0 rounded-2xl border flex items-center justify-center ${
                    a.isSettled
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      : atrasado
                        ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                        : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                  }`}>
                    {a.isSettled ? <CheckCircle2 className="h-5 w-5" />
                      : atrasado ? <AlertTriangle className="h-5 w-5" />
                      : <Clock className="h-5 w-5" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        Parcelamento
                      </span>
                      <p className="text-xs font-black text-zinc-100 truncate">{a.clientName}</p>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5 truncate">
                      {a.paidCount}/{a.totalCount} parcelas pagas
                      {a.associatedOrders && ` • ${a.associatedOrders}`}
                      {!a.isSettled && venc && ` • próxima ${format(venc, 'dd/MM')}`}
                    </p>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-1.5 max-w-[240px]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                        style={{ width: `${progresso}%` }}
                      />
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-black tabular-nums ${a.isSettled ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {brl(a.isSettled ? a.total : a.pendingTotal, canSeeFinancials)}
                    </p>
                    <p className="text-[9px] text-zinc-500 font-bold uppercase">
                      {a.isSettled ? 'quitado' : 'falta pagar'}
                    </p>
                  </div>

                  <ChevronRight className="h-4 w-4 text-zinc-600 shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
