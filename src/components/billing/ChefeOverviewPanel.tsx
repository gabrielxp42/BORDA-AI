import React, { useMemo } from 'react';
import {
  Crown, TrendingUp, AlertTriangle, CalendarClock, Users,
  ChevronRight, Wallet, Package, CheckCircle2
} from 'lucide-react';
import { format } from 'date-fns';
import { Agreement } from '@/services/installmentService';
import { parseLocalDate, diffInDays } from '@/utils/dateHelper';

/** Formato mínimo que o painel precisa de um cliente devedor. */
export interface DebtorSummary {
  clientId: string;
  clientName: string;
  clientCompany?: string;
  totalPending: number;
  hasOverdue: boolean;
  overdueDays: number;
  orders: any[];
}

interface ChefeOverviewPanelProps {
  debtors: DebtorSummary[];
  agreements: Agreement[];
  recentPaidTotal: number;
  recentPaidCount: number;
  canSeeFinancials?: boolean;
  onOpenDebtor: (d: DebtorSummary) => void;
  onOpenAgreement: (a: Agreement) => void;
}

const brl = (v: number, pode = true) =>
  pode
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
    : 'R$ ***';

export const ChefeOverviewPanel: React.FC<ChefeOverviewPanelProps> = ({
  debtors,
  agreements,
  recentPaidTotal,
  recentPaidCount,
  canSeeFinancials = true,
  onOpenDebtor,
  onOpenAgreement,
}) => {
  const resumo = useMemo(() => {
    const pedidosPend = debtors.reduce((s, d) => s + d.totalPending, 0);
    const abertos = agreements.filter(a => !a.isSettled);
    const parcelasPend = abertos.reduce((s, a) => s + a.pendingTotal, 0);

    const atrasadoPedidos = debtors
      .filter(d => d.hasOverdue)
      .reduce((s, d) => s + d.totalPending, 0);

    const parcelasAtrasadas = abertos.filter(a => {
      const v = parseLocalDate(a.nextDue?.due_date);
      return v ? diffInDays(v, new Date()) < 0 : false;
    });

    // Parcelas que vencem nos próximos 7 dias
    const proximas = abertos
      .filter(a => {
        const v = parseLocalDate(a.nextDue?.due_date);
        if (!v) return false;
        const d = diffInDays(v, new Date());
        return d >= 0 && d <= 7;
      })
      .sort((x, y) => {
        const dx = parseLocalDate(x.nextDue?.due_date)?.getTime() ?? 0;
        const dy = parseLocalDate(y.nextDue?.due_date)?.getTime() ?? 0;
        return dx - dy;
      });

    return {
      pedidosPend,
      parcelasPend,
      totalGeral: pedidosPend + parcelasPend,
      atrasadoTotal: atrasadoPedidos + parcelasAtrasadas.reduce((s, a) => s + a.pendingTotal, 0),
      qtdDevedores: debtors.length,
      qtdAtrasados: debtors.filter(d => d.hasOverdue).length + parcelasAtrasadas.length,
      qtdAcordos: abertos.length,
      proximas,
    };
  }, [debtors, agreements]);

  const ranking = useMemo(
    () => [...debtors].sort((a, b) => b.totalPending - a.totalPending).slice(0, 8),
    [debtors]
  );

  const maiorDivida = ranking[0]?.totalPending || 1;

  return (
    <div className="space-y-5">

      {/* Cabeçalho */}
      <div className="flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
          <Crown className="h-4.5 w-4.5 text-amber-400" />
        </div>
        <div>
          <h3 className="text-sm font-black text-white">Visão do Chefe</h3>
          <p className="text-[11px] text-zinc-500">Quem está devendo, quanto e o que vence primeiro</p>
        </div>
      </div>

      {/* Total consolidado */}
      <div className="rounded-3xl border border-amber-500/25 bg-gradient-to-br from-amber-950/40 via-zinc-900/60 to-black px-5 py-4">
        <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5" /> Total a receber
        </span>
        <p className="text-3xl font-black text-white mt-1 tabular-nums">
          {brl(resumo.totalGeral, canSeeFinancials)}
        </p>

        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5 text-[11px] font-bold">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Package className="h-3 w-3 text-purple-400" />
            Pedidos: <span className="text-zinc-200">{brl(resumo.pedidosPend, canSeeFinancials)}</span>
          </span>
          <span className="text-zinc-400 flex items-center gap-1.5">
            <CalendarClock className="h-3 w-3 text-indigo-400" />
            Parcelas: <span className="text-zinc-200">{brl(resumo.parcelasPend, canSeeFinancials)}</span>
          </span>
        </div>

        {/* Proporção pedidos x parcelas */}
        {resumo.totalGeral > 0 && (
          <div className="flex h-2 rounded-full overflow-hidden mt-3 bg-white/10">
            <div
              className="bg-purple-500"
              style={{ width: `${(resumo.pedidosPend / resumo.totalGeral) * 100}%` }}
              title="Pedidos avulsos"
            />
            <div
              className="bg-indigo-400"
              style={{ width: `${(resumo.parcelasPend / resumo.totalGeral) * 100}%` }}
              title="Parcelas de acordo"
            />
          </div>
        )}
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-rose-300 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Em atraso
          </span>
          <p className="text-sm sm:text-base font-black text-rose-400 mt-0.5">
            {brl(resumo.atrasadoTotal, canSeeFinancials)}
          </p>
          <p className="text-[9px] text-rose-300/70 font-bold">{resumo.qtdAtrasados} cobrança(s)</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
            <Users className="h-3 w-3" /> Devedores
          </span>
          <p className="text-sm sm:text-base font-black text-white mt-0.5">{resumo.qtdDevedores}</p>
          <p className="text-[9px] text-zinc-500 font-bold">clientes em aberto</p>
        </div>

        <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/10 px-3 py-2.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-indigo-300 flex items-center gap-1">
            <CalendarClock className="h-3 w-3" /> Acordos
          </span>
          <p className="text-sm sm:text-base font-black text-indigo-300 mt-0.5">{resumo.qtdAcordos}</p>
          <p className="text-[9px] text-indigo-300/70 font-bold">parcelamentos ativos</p>
        </div>

        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Recuperado
          </span>
          <p className="text-sm sm:text-base font-black text-emerald-400 mt-0.5">
            {brl(recentPaidTotal, canSeeFinancials)}
          </p>
          <p className="text-[9px] text-emerald-300/70 font-bold">{recentPaidCount} baixa(s)</p>
        </div>
      </div>

      {/* Vence nos próximos 7 dias */}
      {resumo.proximas.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[11px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 text-indigo-400" /> Vence nos próximos 7 dias
          </h4>
          <div className="space-y-1.5">
            {resumo.proximas.slice(0, 5).map(a => {
              const venc = parseLocalDate(a.nextDue?.due_date)!;
              const dias = diffInDays(venc, new Date());
              return (
                <button
                  key={a.agreementId}
                  type="button"
                  onClick={() => onOpenAgreement(a)}
                  className="w-full text-left flex items-center gap-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.06] px-3.5 py-2.5 hover:bg-indigo-500/[0.12] transition-all active:scale-[0.995]"
                >
                  <span className="shrink-0 text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {dias === 0 ? 'Hoje' : `${dias}d`}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-zinc-100 truncate">{a.clientName}</p>
                    <p className="text-[10px] text-zinc-500">
                      Parcela {a.nextDue?.meta.installmentIndex}/{a.nextDue?.meta.totalInstallments} • {format(venc, 'dd/MM')}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-black text-indigo-300 tabular-nums">
                    {brl(a.nextDue?.amount || 0, canSeeFinancials)}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Ranking de devedores */}
      <div className="space-y-2">
        <h4 className="text-[11px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-purple-400" /> Quem mais deve
        </h4>

        {ranking.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-white/10 rounded-2xl">
            <CheckCircle2 className="h-7 w-7 text-emerald-500/60 mx-auto mb-2" />
            <p className="text-zinc-400 text-sm font-bold">Ninguém devendo. Tudo em dia!</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {ranking.map((d, i) => (
              <button
                key={d.clientId}
                type="button"
                onClick={() => onOpenDebtor(d)}
                className={`w-full text-left flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 transition-all active:scale-[0.995] ${
                  d.hasOverdue
                    ? 'border-rose-500/25 bg-rose-500/[0.06] hover:bg-rose-500/[0.12]'
                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
                }`}
              >
                <span className="shrink-0 h-6 w-6 rounded-lg bg-white/10 flex items-center justify-center text-[10px] font-black text-zinc-300">
                  {i + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-zinc-100 truncate">
                    {d.clientName}
                    {d.clientCompany && <span className="text-zinc-500 font-normal"> · {d.clientCompany}</span>}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {d.orders.length} fatura(s)
                    {d.hasOverdue && (
                      <span className="text-rose-400 font-bold"> • {d.overdueDays}d em atraso</span>
                    )}
                  </p>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-1.5 max-w-[220px]">
                    <div
                      className={`h-full rounded-full ${d.hasOverdue ? 'bg-rose-500' : 'bg-purple-500'}`}
                      style={{ width: `${Math.max(6, (d.totalPending / maiorDivida) * 100)}%` }}
                    />
                  </div>
                </div>

                <span className={`shrink-0 text-sm font-black tabular-nums ${d.hasOverdue ? 'text-rose-400' : 'text-amber-400'}`}>
                  {brl(d.totalPending, canSeeFinancials)}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
