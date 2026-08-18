import { supabase } from '@/integrations/supabase/client';
import { parseLocalDate } from '@/utils/dateHelper';

/**
 * ACORDOS DE PARCELAMENTO
 *
 * O PROBLEMA QUE ISSO RESOLVE
 * Antes, um acordo não existia como entidade: eram N linhas soltas em
 * `financial_transactions` amarradas só por um texto na descrição. Consequências:
 *
 *  1. Os pedidos incluídos continuavam `pending` em `orders`, então o "A Receber"
 *     contava o pedido original E a parcela gerada dele — o valor dobrava.
 *  2. Não dava para editar um acordo (mudar o vencimento do dia 19 para o 20).
 *  3. Não dava para agrupar, listar ou mostrar detalhes.
 *
 * A SOLUÇÃO
 * Todo acordo ganha um `agreementId`. Ele é gravado no JSON de `notes` de cada
 * parcela e também nos metadados de cada pedido coberto. Com isso conseguimos
 * agrupar, editar em bloco e — principalmente — excluir das pendências os
 * pedidos que já viraram parcela.
 */

export interface InstallmentMeta {
  agreementId?: string;
  clientId?: string;
  clientName?: string;
  clientPhone?: string;
  installmentIndex?: number;
  totalInstallments?: number;
  associatedOrders?: string;
  associatedOrderIds?: string[];
  isDownPayment?: boolean;
  notifyGabi?: boolean;
  autoRemindDue?: boolean;
  reminderTiming?: string;
  notifyClientOnDue?: boolean;
  notifyOwnerOnDue?: boolean;
  reminded_dates?: string[];
}

export interface InstallmentRow {
  id: string;
  amount: number;
  description: string;
  due_date?: string;
  date: string;
  status?: string;
  payment_method?: string;
  meta: InstallmentMeta;
}

export interface Agreement {
  agreementId: string;
  clientName: string;
  clientPhone?: string;
  clientId?: string;
  associatedOrders: string;
  associatedOrderIds: string[];
  installments: InstallmentRow[];
  total: number;
  paidTotal: number;
  pendingTotal: number;
  paidCount: number;
  totalCount: number;
  /** Próxima parcela em aberto, ordenada por vencimento. */
  nextDue?: InstallmentRow;
  isSettled: boolean;
}

export const AGREEMENT_CATEGORY = 'Parcela de Acordo';

/** Lê o JSON de notes sem estourar em dado malformado. */
export function parseInstallmentMeta(notes?: string | null): InstallmentMeta {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

/** Identificador estável de acordo. */
export function newAgreementId(): string {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `ACD-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

/** True se a transação é uma parcela de acordo. */
export function isInstallment(t: { category?: string; notes?: string | null }): boolean {
  if (t.category === AGREEMENT_CATEGORY) return true;
  return !!parseInstallmentMeta(t.notes).agreementId;
}

/**
 * Agrupa transações soltas nos acordos que elas representam.
 * Aceita tanto linhas novas (com agreementId) quanto as antigas, que caem num
 * agrupamento por cliente + pedidos associados.
 */
export function groupIntoAgreements(transactions: any[]): Agreement[] {
  const mapa = new Map<string, Agreement>();

  transactions
    .filter(t => t.type === 'income' && isInstallment(t))
    .forEach(t => {
      const meta = parseInstallmentMeta(t.notes);
      if (meta.isDownPayment) return; // sinal não é parcela

      const chave = meta.agreementId
        || `legado:${meta.clientName || 'sem-cliente'}:${meta.associatedOrders || ''}`;

      if (!mapa.has(chave)) {
        mapa.set(chave, {
          agreementId: chave,
          clientName: meta.clientName || 'Cliente',
          clientPhone: meta.clientPhone,
          clientId: meta.clientId,
          associatedOrders: meta.associatedOrders || '',
          associatedOrderIds: meta.associatedOrderIds || [],
          installments: [],
          total: 0,
          paidTotal: 0,
          pendingTotal: 0,
          paidCount: 0,
          totalCount: 0,
          isSettled: false,
        });
      }

      const acordo = mapa.get(chave)!;
      const valor = Number(t.amount || 0);
      const quitada = t.status === 'paid';

      acordo.installments.push({
        id: t.id,
        amount: valor,
        description: t.description || '',
        due_date: t.due_date,
        date: t.date,
        status: t.status,
        payment_method: t.payment_method,
        meta,
      });

      acordo.total += valor;
      acordo.totalCount += 1;
      if (quitada) {
        acordo.paidTotal += valor;
        acordo.paidCount += 1;
      } else {
        acordo.pendingTotal += valor;
      }

      if (!acordo.associatedOrderIds.length && meta.associatedOrderIds?.length) {
        acordo.associatedOrderIds = meta.associatedOrderIds;
      }
    });

  return Array.from(mapa.values()).map(a => {
    a.installments.sort((x, y) => (x.meta.installmentIndex || 0) - (y.meta.installmentIndex || 0));
    a.nextDue = a.installments
      .filter(i => i.status !== 'paid')
      .sort((x, y) => {
        const dx = parseLocalDate(x.due_date)?.getTime() ?? Infinity;
        const dy = parseLocalDate(y.due_date)?.getTime() ?? Infinity;
        return dx - dy;
      })[0];
    a.isSettled = a.pendingTotal <= 0.009;
    return a;
  }).sort((a, b) => {
    const da = parseLocalDate(a.nextDue?.due_date)?.getTime() ?? Infinity;
    const db = parseLocalDate(b.nextDue?.due_date)?.getTime() ?? Infinity;
    return da - db;
  });
}

/**
 * IDs dos pedidos já cobertos por algum acordo em aberto.
 * A página de faturas usa isso para não listar o pedido E a parcela dele.
 */
export function ordersCoveredByAgreements(transactions: any[]): Set<string> {
  const cobertos = new Set<string>();
  groupIntoAgreements(transactions).forEach(a => {
    a.associatedOrderIds.forEach(id => cobertos.add(id));
  });
  return cobertos;
}

/** Reagenda o vencimento de uma parcela. */
export async function updateInstallmentDueDate(id: string, novaData: string): Promise<void> {
  const { error } = await supabase
    .from('financial_transactions')
    .update({ due_date: novaData, date: novaData })
    .eq('id', id);
  if (error) throw error;
}

/** Altera o valor de uma parcela. */
export async function updateInstallmentAmount(id: string, valor: number): Promise<void> {
  const { error } = await supabase
    .from('financial_transactions')
    .update({ amount: valor })
    .eq('id', id);
  if (error) throw error;
}

/** Dá baixa numa parcela, registrando quando e por quem. */
export async function settleInstallment(
  id: string,
  opts?: { paidAt?: string; method?: string; operator?: string }
): Promise<void> {
  const { data: atual } = await supabase
    .from('financial_transactions')
    .select('notes')
    .eq('id', id)
    .maybeSingle();

  const meta = parseInstallmentMeta(atual?.notes);
  const quitadaEm = opts?.paidAt || new Date().toISOString();

  const { error } = await supabase
    .from('financial_transactions')
    .update({
      status: 'paid',
      date: quitadaEm,
      payment_method: opts?.method,
      notes: JSON.stringify({ ...meta, paidAt: quitadaEm, paidByOperator: opts?.operator }),
    })
    .eq('id', id);
  if (error) throw error;
}

/** Remove um acordo inteiro (todas as parcelas ainda em aberto). */
export async function deleteAgreement(agreementId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase
    .from('financial_transactions')
    .delete()
    .in('id', ids);
  if (error) throw error;
}
