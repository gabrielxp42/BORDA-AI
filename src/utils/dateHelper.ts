/**
 * Helpers de data à prova de fuso horário.
 *
 * O PROBLEMA QUE ISSO RESOLVE
 * `new Date('2026-08-19')` — string só com data, sem hora — é interpretada pelo
 * JavaScript como MEIA-NOITE UTC. No Brasil (UTC-3) isso vira 18/08 às 21:00,
 * então a tela mostra o dia 18 quando o usuário digitou 19. É a origem dos
 * relatos de "a data erra por 1 dia" e "lancei hoje e aparece domingo".
 *
 * A solução é ancorar ao MEIO-DIA local: nenhum fuso do mundo (-12 a +14)
 * consegue empurrar 12:00 para o dia anterior ou seguinte.
 *
 * Use `parseLocalDate` para colunas DATE (due_date, vencimentos) e deixe o
 * `new Date()` normal para colunas TIMESTAMP (created_at, paid_at), que já
 * trazem hora e fuso corretos.
 */

/** Detecta 'YYYY-MM-DD' puro, sem componente de hora. */
const SOMENTE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Converte um valor de data do banco em Date no fuso local, sem deslocar o dia.
 * Retorna null para entradas vazias ou inválidas.
 */
export function parseLocalDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  const texto = String(value).trim();
  if (!texto) return null;

  // Data pura: ancora ao meio-dia local para não cair no dia anterior.
  const d = SOMENTE_DATA.test(texto)
    ? new Date(`${texto}T12:00:00`)
    : new Date(texto);

  return isNaN(d.getTime()) ? null : d;
}

/** Igual a parseLocalDate, mas devolve a data de hoje quando o valor é inválido. */
export function parseLocalDateOrToday(value?: string | Date | null): Date {
  return parseLocalDate(value) ?? new Date();
}

/**
 * Converte uma Date para 'YYYY-MM-DD' usando os componentes LOCAIS.
 * Não use toISOString() para isso: ele converte para UTC e volta a errar o dia.
 */
export function toLocalDateInput(value?: string | Date | null): string {
  const d = parseLocalDate(value);
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Converte uma Date para 'YYYY-MM-DDTHH:mm' local, para <input type="datetime-local">. */
export function toLocalDateTimeInput(value?: string | Date | null): string {
  const d = parseLocalDate(value);
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Início do dia local (00:00:00.000). */
export function startOfLocalDay(value?: string | Date | null): Date {
  const d = parseLocalDateOrToday(value);
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Fim do dia local (23:59:59.999). */
export function endOfLocalDay(value?: string | Date | null): Date {
  const d = parseLocalDateOrToday(value);
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

/** Diferença em dias inteiros entre duas datas, ignorando horário. */
export function diffInDays(a: string | Date, b: string | Date): number {
  const d1 = startOfLocalDay(a);
  const d2 = startOfLocalDay(b);
  return Math.round((d1.getTime() - d2.getTime()) / 86400000);
}

/**
 * Junta o DIA de uma coluna DATE com a HORA de uma coluna timestamptz.
 *
 * A tabela `financial_transactions` guarda `date` como DATE — o Postgres
 * descarta a hora que o app envia. Lendo de volta vem só "2026-09-02", e
 * `new Date()` nisso resolve para meia-noite UTC, que no Brasil aparece como
 * 01/09 às 21:00. Era esse o relato de "vem tudo na data de ontem, 21 horas".
 *
 * Enquanto a coluna não virar timestamptz, esta função monta a data correta:
 * o dia vem de `date` (sem escorregar de fuso) e a hora vem de `created_at`.
 */
export function combineDayAndTime(
  dayValue?: string | Date | null,
  timeValue?: string | Date | null
): Date {
  const dia = parseLocalDate(dayValue);
  if (!dia) return parseLocalDateOrToday(timeValue);

  const hora = timeValue ? new Date(timeValue as any) : null;
  if (!hora || isNaN(hora.getTime())) return dia;

  const out = new Date(dia);
  out.setHours(hora.getHours(), hora.getMinutes(), hora.getSeconds(), 0);
  return out;
}
