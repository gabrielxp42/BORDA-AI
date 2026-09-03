import { parseLocalDate } from '@/utils/dateHelper';
/**
 * RELATÓRIO FINANCEIRO POR PERÍODO (Entradas & Saídas)
 *
 * Consolida pedidos pagos, lançamentos manuais, compra de insumos e contas
 * fixas num extrato diário — pensado para conferência contra o extrato do banco.
 * Usa o mesmo padrão de impressão via iframe do restante do sistema.
 */

export interface FinancialMovement {
  id: string;
  date: string;
  type: 'income' | 'expense';
  title: string;
  category?: string;
  method?: string;
  who?: string;
  source: 'pedido' | 'manual';
  amount: number;
}

export interface FinancialReportPDFData {
  periodLabel: string;
  movements: FinancialMovement[];
  companyName?: string;
  companyColor?: string;
  filterLabel?: string;
}

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Evita quebrar o HTML do relatório com descrições digitadas pelo usuário. */
const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const buildFinancialReportHTML = (data: FinancialReportPDFData): string => {
  const companyName = esc(data.companyName || 'GUAÇU BORDADOS');
  const brandColor = data.companyColor || '#8B5CF6';
  const emittedAt = new Date().toLocaleString('pt-BR');

  const sorted = [...data.movements].sort(
    (a, b) => (parseLocalDate(a.date)?.getTime() ?? 0) - (parseLocalDate(b.date)?.getTime() ?? 0)
  );

  const totalIn = sorted.filter(m => m.type === 'income').reduce((s, m) => s + Number(m.amount || 0), 0);
  const totalOut = sorted.filter(m => m.type === 'expense').reduce((s, m) => s + Number(m.amount || 0), 0);
  const balance = totalIn - totalOut;

  // Agrupa por dia preservando a ordem cronológica
  const groups: Array<{ key: string; items: FinancialMovement[] }> = [];
  sorted.forEach(m => {
    const k = dayKey(m.date);
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.items.push(m);
    else groups.push({ key: k, items: [m] });
  });

  const daysHtml = groups.map(g => {
    const dIn = g.items.filter(i => i.type === 'income').reduce((s, i) => s + Number(i.amount || 0), 0);
    const dOut = g.items.filter(i => i.type === 'expense').reduce((s, i) => s + Number(i.amount || 0), 0);
    const dBal = dIn - dOut;
    const label = new Date(`${g.key}T12:00:00`).toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
    });

    const rows = g.items.map(i => {
      const hora = (parseLocalDate(i.date) || new Date(i.date)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const isIn = i.type === 'income';
      return `
        <tr>
          <td class="mono">${hora}</td>
          <td>
            <div class="desc">${esc(i.title) || '-'}</div>
            <div class="meta">${esc(i.category || 'Sem categoria')}${i.who ? ` &bull; ${esc(i.who)}` : ''}</div>
          </td>
          <td><span class="src ${i.source === 'pedido' ? 'src-order' : 'src-manual'}">${i.source === 'pedido' ? 'PEDIDO' : 'MANUAL'}</span></td>
          <td>${esc(i.method || '-')}</td>
          <td class="text-right ${isIn ? 'in' : 'out'}">${isIn ? '+' : '-'} ${brl(Math.abs(Number(i.amount || 0)))}</td>
        </tr>`;
    }).join('');

    return `
      <div class="day">
        <div class="day-head">
          <span class="day-label">${label}</span>
          <span class="day-tot">
            <b class="in">Entradas ${brl(dIn)}</b>
            <b class="out">Saidas ${brl(dOut)}</b>
            <b class="${dBal >= 0 ? 'in' : 'out'}">Saldo ${brl(dBal)}</b>
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:56px">Hora</th>
              <th>Descrição</th>
              <th style="width:76px">Origem</th>
              <th style="width:120px">Forma</th>
              <th style="width:120px" class="text-right">Valor</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Relatório Financeiro - ${esc(data.periodLabel)}</title>
      <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { margin: 0; padding: 22px; color: #1e293b; font-size: 12px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${brandColor}; padding-bottom: 14px; margin-bottom: 16px; }
        .title { font-size: 19px; font-weight: 900; color: #0f172a; text-transform: uppercase; }
        .subtitle { font-size: 11px; color: #64748b; font-weight: 600; margin-top: 2px; }
        .cards { display: flex; gap: 10px; margin-bottom: 18px; }
        .card { flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; background: #f8fafc; }
        .card-l { font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: .04em; }
        .card-v { font-size: 16px; font-weight: 900; margin-top: 3px; }
        .in { color: #059669; }
        .out { color: #dc2626; }
        .day { margin-bottom: 16px; page-break-inside: avoid; }
        .day-head { display: flex; justify-content: space-between; align-items: center; background: #0f172a; color: #fff; padding: 7px 11px; border-radius: 8px 8px 0 0; }
        .day-label { font-size: 11px; font-weight: 800; text-transform: capitalize; }
        .day-tot b { font-size: 10px; font-weight: 800; margin-left: 12px; }
        .day-tot .in { color: #34d399; }
        .day-tot .out { color: #f87171; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f1f5f9; text-align: left; padding: 6px 10px; font-size: 9px; font-weight: 800; text-transform: uppercase; color: #475569; border-bottom: 1px solid #cbd5e1; }
        td { padding: 7px 10px; border-bottom: 1px solid #eef2f7; vertical-align: top; }
        .text-right { text-align: right; }
        .mono { font-variant-numeric: tabular-nums; color: #64748b; font-weight: 700; }
        .desc { font-weight: 700; color: #0f172a; }
        .meta { font-size: 9px; color: #94a3b8; margin-top: 1px; }
        .src { font-size: 8px; font-weight: 900; padding: 2px 6px; border-radius: 5px; }
        .src-order { background: #ede9fe; color: #6d28d9; }
        .src-manual { background: #e0f2fe; color: #0369a1; }
        td.in, td.out { font-weight: 800; font-variant-numeric: tabular-nums; }
        .footer-total { display: flex; justify-content: space-between; align-items: center; background: #0f172a; color: #fff; padding: 14px 18px; border-radius: 12px; margin-top: 8px; }
        .empty { padding: 40px; text-align: center; color: #94a3b8; border: 1px dashed #cbd5e1; border-radius: 10px; }
        @media print { body { padding: 10px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="title">${companyName}</div>
          <div class="subtitle">Relatório Financeiro &mdash; Entradas &amp; Saídas</div>
          <div class="subtitle"><b>Período:</b> ${esc(data.periodLabel)}${data.filterLabel ? ` &nbsp;&bull;&nbsp; <b>Filtro:</b> ${esc(data.filterLabel)}` : ''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800; font-size:10px; color:#64748b;">EMISSÃO</div>
          <div style="font-weight:700; font-size:11px;">${emittedAt}</div>
          <div style="font-size:10px; color:#64748b; margin-top:2px;">${sorted.length} lançamento(s)</div>
        </div>
      </div>

      <div class="cards">
        <div class="card">
          <div class="card-l">Total de Entradas</div>
          <div class="card-v in">${brl(totalIn)}</div>
        </div>
        <div class="card">
          <div class="card-l">Total de Saídas</div>
          <div class="card-v out">${brl(totalOut)}</div>
        </div>
        <div class="card">
          <div class="card-l">Saldo do Período</div>
          <div class="card-v ${balance >= 0 ? 'in' : 'out'}">${brl(balance)}</div>
        </div>
      </div>

      ${sorted.length === 0
        ? '<div class="empty">Nenhum lançamento encontrado neste período.</div>'
        : daysHtml}

      <div class="footer-total">
        <div>
          <div style="font-size:10px; font-weight:800; text-transform:uppercase; color:#94a3b8;">Saldo Final do Período</div>
          <div style="font-size:10px; color:#cbd5e1;">Entradas ${brl(totalIn)} &mdash; Saídas ${brl(totalOut)}</div>
        </div>
        <div style="font-size:22px; font-weight:900; color:${balance >= 0 ? '#34d399' : '#f87171'};">${brl(balance)}</div>
      </div>

      <div style="margin-top:22px; text-align:center; font-size:9px; color:#94a3b8;">
        ${companyName} &bull; Gestão Inteligente de Bordados &bull; Documento gerado automaticamente
      </div>
    </body>
    </html>
  `;
};

/** Abre a caixa de impressão do navegador com o relatório (salvar como PDF). */
export const printFinancialReportPDF = (data: FinancialReportPDFData) => {
  const existingFrame = document.getElementById('borda-print-iframe');
  if (existingFrame) existingFrame.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'borda-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const frameDoc = iframe.contentWindow?.document;
  if (!frameDoc) return;

  frameDoc.open();
  frameDoc.write(buildFinancialReportHTML(data));
  frameDoc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error('Erro ao imprimir relatório financeiro:', err);
    }
  }, 500);
};
