import { parseInstallmentMeta } from '@/services/installmentService';

/**
 * DETECTOR DE INCONSISTÊNCIAS DO HUB
 *
 * Em vez de corrigir dados por conta própria — o que já deu errado uma vez,
 * quando um acordo antigo foi lido como inexistente só porque não tinha o
 * campo novo — o sistema mostra o que está estranho e deixa quem conhece o
 * negócio decidir.
 *
 * Cada problema vem com: o que é, por que atrapalha, e o que dá para fazer.
 */

export type TipoProblema = 'sem_vencimento' | 'possivel_duplicata' | 'sem_vinculo';

export interface ProblemaHub {
  tipo: TipoProblema;
  /** Título curto, em linguagem de oficina. */
  titulo: string;
  /** O que acontece de errado por causa disso. */
  consequencia: string;
  /** Transações envolvidas. */
  itens: Array<{
    id: string;
    descricao: string;
    valor: number;
    status?: string;
    due_date?: string | null;
    created_at?: string;
  }>;
  valorTotal: number;
  /** Quanto isso atrapalha: alta aparece primeiro. */
  severidade: 'alta' | 'media';
}

/** Extrai os números de pedido citados na descrição, em ordem, para comparar. */
function pedidosDaDescricao(desc: string): string {
  const nums = (desc.match(/#\d+/g) || []).map(n => n.replace('#', ''));
  return nums.sort((a, b) => Number(a) - Number(b)).join(',');
}

/** Nome do cliente conforme escrito na descrição da parcela. */
function clienteDaDescricao(desc: string): string {
  const m = desc.match(/Acordo\s+(.+?)\s*\(#/i);
  return (m ? m[1] : desc).trim().toLowerCase();
}

const ehParcela = (t: any) =>
  t?.category === 'Parcela de Acordo' || Boolean(parseInstallmentMeta(t?.notes).agreementId);

export function detectarProblemas(transacoes: any[]): ProblemaHub[] {
  const parcelas = (transacoes || []).filter(ehParcela);
  const problemas: ProblemaHub[] = [];

  // 1. Parcela sem data de vencimento -----------------------------------
  // Sem data ela não entra em "próximo a cobrar" e ninguém é lembrado dela.
  const semData = parcelas.filter(t => t.status !== 'paid' && !t.due_date);
  if (semData.length > 0) {
    problemas.push({
      tipo: 'sem_vencimento',
      titulo: `${semData.length} parcela(s) sem data de cobrança`,
      consequencia:
        'Sem data marcada, essas parcelas não aparecem em "próximo a cobrar" e passam batido no fechamento do mês.',
      itens: semData.map(t => ({
        id: t.id,
        descricao: t.description || 'Parcela',
        valor: Number(t.amount || 0),
        status: t.status,
        due_date: t.due_date,
        created_at: t.created_at,
      })),
      valorTotal: semData.reduce((s, t) => s + Number(t.amount || 0), 0),
      severidade: 'alta',
    });
  }

  // 2. Possível acordo lançado duas vezes --------------------------------
  // Mesmo cliente, mesmo valor e MESMOS pedidos — mesmo que a descrição
  // liste os pedidos em ordem diferente, o que engana comparação por texto.
  const grupos = new Map<string, any[]>();
  parcelas.forEach(t => {
    const desc = t.description || '';
    const chave = [
      clienteDaDescricao(desc),
      Number(t.amount || 0).toFixed(2),
      pedidosDaDescricao(desc),
    ].join('|');
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(t);
  });

  const repetidas = Array.from(grupos.values()).filter(g => g.length > 1);
  repetidas.forEach(g => {
    problemas.push({
      tipo: 'possivel_duplicata',
      titulo: `Acordo possivelmente lançado ${g.length}x`,
      consequencia:
        'O mesmo valor pode estar sendo contado mais de uma vez no total a receber. Confira e apague o que estiver sobrando.',
      itens: g.map(t => ({
        id: t.id,
        descricao: t.description || 'Parcela',
        valor: Number(t.amount || 0),
        status: t.status,
        due_date: t.due_date,
        created_at: t.created_at,
      })),
      valorTotal: Number(g[0].amount || 0) * (g.length - 1),
      severidade: 'alta',
    });
  });

  return problemas.sort((a, b) => {
    if (a.severidade !== b.severidade) return a.severidade === 'alta' ? -1 : 1;
    return b.valorTotal - a.valorTotal;
  });
}
