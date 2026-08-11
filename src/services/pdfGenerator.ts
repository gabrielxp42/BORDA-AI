import { parsePaymentMetadata } from '@/utils/paymentHelper';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface OrderPDFData {
  id: string;
  orderNumber?: string | number;
  createdAt: string;
  dueDate?: string;
  clientName: string;
  clientPhone?: string;
  clientCompany?: string;
  paymentStatus: 'pending' | 'paid' | 'half_paid';
  paymentMethod?: string;
  totalAmount: number;
  notes?: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  companyName?: string;
  companySubtitle?: string;
  companyLogo?: string | null;
  companyColor?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyAddress?: string;
  companyDocument?: string;
  pixKey?: string;
  workingHours?: string;
  canSeeFinancials?: boolean;
}

const getOrderHTML = (order: OrderPDFData) => {
  const { cleanNotes } = parsePaymentMetadata(order.notes);
  const canSee = order.canSeeFinancials !== false;

  let fallbackColor = '#8B5CF6';
  try {
    const saved = localStorage.getItem('borda_company_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.primaryColor) fallbackColor = parsed.primaryColor;
    }
  } catch (e) {}

  const brandColor = order.companyColor || fallbackColor;
  const companyName = order.companyName || 'GUAÇU BORDADOS';
  const companySubtitle = order.companySubtitle || 'GESTÃO INTELIGENTE DE BORDADOS';
  const orderCode = order.orderNumber ? `#${order.orderNumber}` : `#${order.id.slice(0, 6)}`;

  let paymentBadgeBg = '#fef2f2';
  let paymentBadgeColor = '#dc2626';
  let paymentStatusText = 'PENDENTE DE PAGAMENTO';

  if (order.paymentStatus === 'paid') {
    paymentBadgeBg = '#ecfdf5';
    paymentBadgeColor = '#059669';
    paymentStatusText = '✓ PAGO TOTAL (100%)';
  } else if (order.paymentStatus === 'half_paid') {
    paymentBadgeBg = '#eff6ff';
    paymentBadgeColor = '#2563eb';
    paymentStatusText = '⚡ SINAL RECEBIDO (50%)';
  }

  const formattedDate = new Date(order.createdAt).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const formattedDueDate = order.dueDate
    ? new Date(order.dueDate).toLocaleDateString('pt-BR')
    : 'A combinar';

  const formattedTotal = canSee
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.totalAmount || 0)
    : 'R$ ***,**';

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Ordem de Serviço ${orderCode} - ${companyName}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { font-family: 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif; color: #1e293b; margin: 0; padding: 0; background-color: #ffffff; font-size: 13px; line-height: 1.5; }
        .brand-bar { height: 6px; background: ${brandColor}; width: 100%; border-radius: 4px 4px 0 0; margin-bottom: 20px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; border-bottom: 2px solid #f1f5f9; margin-bottom: 24px; }
        .company-title { font-size: 22px; font-weight: 900; color: ${brandColor}; letter-spacing: -0.5px; margin: 0; text-transform: uppercase; }
        .company-subtitle { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
        .company-info { font-size: 11px; color: #475569; margin-top: 6px; }
        .document-title { text-align: right; }
        .doc-badge { font-size: 20px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; }
        .doc-date { font-size: 11px; color: #64748b; margin-top: 4px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        .info-card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; }
        .card-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 6px; }
        .card-value { font-size: 14px; font-weight: 700; color: #0f172a; }
        .card-subtext { font-size: 11px; color: #475569; margin-top: 2px; }
        .status-pill { display: inline-block; padding: 6px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; background-color: ${paymentBadgeBg}; color: ${paymentBadgeColor}; border: 1px solid ${paymentBadgeColor}40; }
        .table-container { margin-bottom: 24px; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
        table { width: 100%; border-collapse: collapse; }
        th { background-color: ${brandColor}; color: #ffffff; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding: 12px 16px; text-align: left; }
        td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 12px; }
        tr:nth-child(even) { background-color: #f8fafc; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-bold { font-weight: 700; }
        .notes-box { background-color: #faf5ff; border: 1px solid #e9d5ff; border-radius: 12px; padding: 14px 16px; margin-bottom: 24px; }
        .notes-title { font-size: 11px; font-weight: 800; color: ${brandColor}; text-transform: uppercase; margin-bottom: 4px; }
        .notes-content { font-size: 12px; color: #475569; font-style: italic; }
        .summary-container { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 30px; }
        .payment-info-box { flex: 1; background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 14px 16px; }
        .payment-info-title { font-size: 11px; font-weight: 800; color: #d97706; text-transform: uppercase; margin-bottom: 6px; }
        .payment-info-text { font-size: 11px; color: #78350f; line-height: 1.6; }
        .total-box { min-width: 220px; background-color: #0f172a; color: #ffffff; border-radius: 12px; padding: 16px; text-align: right; }
        .total-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; }
        .total-amount { font-size: 24px; font-weight: 900; color: #ffffff; margin-top: 4px; letter-spacing: -0.5px; }
        .footer { border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; font-size: 10px; color: #94a3b8; }
      </style>
    </head>
    <body>
      <div class="brand-bar"></div>
      <div class="header">
        <div>
            <h1 class="company-title">${companyName}</h1>
            <div class="company-subtitle">${companySubtitle}</div>
            <div class="company-info">
              ${order.companyAddress ? `📍 ${order.companyAddress}<br/>` : ''}
              ${order.companyPhone ? `📞 ${order.companyPhone}` : ''} 
              ${order.companyEmail ? ` | ✉️ ${order.companyEmail}` : ''}
              ${order.companyDocument ? `<br/>📄 CNPJ/CPF: ${order.companyDocument}` : ''}
            </div>
        </div>
        <div class="document-title">
          <div class="doc-badge">ORDEM DE SERVIÇO ${orderCode}</div>
          <div class="doc-date">Data da Entrada: <strong>${formattedDate}</strong></div>
          <div class="doc-date">Previsão de Entrega: <strong>${formattedDueDate}</strong></div>
        </div>
      </div>
      <div class="info-grid">
        <div class="info-card">
          <div class="card-label">Cliente / Destinatário</div>
          <div class="card-value">${order.clientName}</div>
          ${order.clientCompany ? `<div class="card-subtext">🏢 ${order.clientCompany}</div>` : ''}
          ${order.clientPhone ? `<div class="card-subtext">📞 ${order.clientPhone}</div>` : ''}
        </div>
        <div class="info-card">
          <div class="card-label">Status do Pagamento</div>
          <div style="margin-top: 4px;"><span class="status-pill">${paymentStatusText}</span></div>
          ${order.paymentMethod ? `<div class="card-subtext" style="margin-top: 8px;">Método: <strong>${order.paymentMethod.toUpperCase()}</strong></div>` : ''}
        </div>
      </div>
      <div class="table-container">
        <table>
          <thead><tr><th>Descrição do Serviço / Matriz</th><th class="text-center">Quantidade</th>${canSee ? '<th class="text-right">Valor Unitário</th><th class="text-right">Total</th>' : ''}</tr></thead>
          <tbody>
            ${order.items.map(item => `
              <tr>
                <td class="font-bold">${item.description}</td>
                <td class="text-center">${item.quantity} un</td>
                ${canSee ? `<td class="text-right">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unitPrice)}</td><td class="text-right font-bold">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.totalPrice)}</td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${cleanNotes && cleanNotes.trim().length > 0 ? `
        <div class="notes-box">
          <div class="notes-title">📝 Observações & Especificações da Encomenda</div>
          <div class="notes-content">"${cleanNotes.trim()}"</div>
        </div>
      ` : ''}
      <div class="summary-container">
        <div class="payment-info-box">
          <div class="payment-info-title">🔑 Dados para Pagamento & Atendimento</div>
          <div class="payment-info-text">${canSee && order.pixKey ? `Chave PIX: <strong>${order.pixKey}</strong><br/>` : ''}${order.workingHours ? `Horário de Funcionamento: <strong>${order.workingHours}</strong><br/>` : ''}</div>
        </div>
        ${canSee ? `<div class="total-box"><div class="total-label">Valor Total do Pedido</div><div class="total-amount">${formattedTotal}</div></div>` : ''}
      </div>
      <div class="footer">${companyName} — Tecnologia ERP para Oficinas de Bordado</div>
    </body>
    </html>
  `;
};

export const printOrderReceipt = (order: OrderPDFData) => {
  const html = getOrderHTML(order);
  const existingFrame = document.getElementById('borda-print-iframe');
  if (existingFrame) existingFrame.remove();
  const iframe = document.createElement('iframe');
  iframe.id = 'borda-print-iframe';
  iframe.style.visibility = 'hidden';
  iframe.style.position = 'fixed';
  document.body.appendChild(iframe);
  const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!frameDoc) return;
  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }, 400);
};

export const generateOrderPDFBase64 = async (order: OrderPDFData): Promise<string> => {
  const container = document.createElement('div');
  container.innerHTML = getOrderHTML(order);
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.background = 'white';
  container.style.width = '210mm';
  document.body.appendChild(container);
  const canvas = await html2canvas(container, { scale: 2 });
  const imgData = canvas.toDataURL('image/jpeg');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const imgProps = pdf.getImageProperties(imgData);
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
  pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
  document.body.removeChild(container);
  return pdf.output('datauristring').split(',')[1];
};

export interface ClientStatementPDFData {
  clientName: string;
  clientPhone?: string;
  clientCompany?: string;
  orders: Array<{
    id: string;
    orderNumber?: string | number;
    createdAt: string;
    dueDate?: string;
    totalAmount: number;
    paymentStatus: string;
    pendingAmount: number;
  }>;
  grandPending: number;
  companyName?: string;
  companyColor?: string;
  pixKey?: string;
}

export const printClientStatementPDF = (data: ClientStatementPDFData) => {
  const companyName = data.companyName || 'GUAÇU BORDADOS';
  const brandColor = data.companyColor || '#8B5CF6';
  const formattedDate = new Date().toLocaleDateString('pt-BR');
  const formattedGrandPending = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.grandPending);

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

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Extrato de Débitos - ${data.clientName}</title>
      <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { margin: 0; padding: 24px; color: #1e293b; font-size: 13px; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid ${brandColor}; padding-bottom: 16px; margin-bottom: 20px; }
        .title { font-size: 20px; font-weight: 900; color: #0f172a; text-transform: uppercase; }
        .subtitle { font-size: 11px; color: #64748b; font-weight: 600; }
        .client-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 20px; }
        .client-title { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
        .client-name { font-size: 16px; font-weight: 800; color: #0f172a; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th { background: #f1f5f9; text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 800; uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
        td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-bold { font-weight: 700; }
        .pending-tag { background: #fef2f2; color: #dc2626; padding: 4px 8px; border-radius: 6px; font-weight: 800; font-size: 10px; }
        .half-tag { background: #eff6ff; color: #2563eb; padding: 4px 8px; border-radius: 6px; font-weight: 800; font-size: 10px; }
        .total-container { display: flex; justify-content: space-between; align-items: center; background: #0f172a; color: white; padding: 16px 20px; border-radius: 12px; }
        .total-val { font-size: 22px; font-weight: 900; color: #f59e0b; }
        .pix-box { margin-top: 16px; padding: 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; color: #92400e; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="title">${companyName}</div>
          <div class="subtitle">Extrato Detalhado de Faturas & Débitos em Aberto</div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 800; font-size: 11px; color: #64748b;">EMISSÃO</div>
          <div style="font-weight: 700;">${formattedDate}</div>
        </div>
      </div>

      <div class="client-box">
        <div class="client-title">Cliente</div>
        <div class="client-name">${data.clientName} ${data.clientCompany ? `(${data.clientCompany})` : ''}</div>
        ${data.clientPhone ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">Telefone / WhatsApp: ${data.clientPhone}</div>` : ''}
      </div>

      <table>
        <thead>
          <tr>
            <th>Pedido #</th>
            <th>Data de Entrada</th>
            <th>Prazo Combinado</th>
            <th class="text-center">Status</th>
            <th class="text-right">Valor Total</th>
            <th class="text-right">Saldo Pendente</th>
          </tr>
        </thead>
        <tbody>
          ${data.orders.map(o => `
            <tr>
              <td class="font-bold">#${o.orderNumber || o.id.slice(0, 4)}</td>
              <td>${new Date(o.createdAt).toLocaleDateString('pt-BR')}</td>
              <td>${o.dueDate ? new Date(o.dueDate).toLocaleDateString('pt-BR') : 'A combinar'}</td>
              <td class="text-center">
                ${o.paymentStatus === 'half_paid' ? '<span class="half-tag">SINAL 50%</span>' : '<span class="pending-tag">100% PENDENTE</span>'}
              </td>
              <td class="text-right">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(o.totalAmount)}</td>
              <td class="text-right font-bold" style="color: #dc2626;">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(o.pendingAmount)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="total-container">
        <div>
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #94a3b8;">Total Geral a Pagar</div>
          <div style="font-size: 11px; color: #cbd5e1;">Sumatório de todas as faturas pendentes</div>
        </div>
        <div class="total-val">${formattedGrandPending}</div>
      </div>

      ${data.pixKey ? `
        <div class="pix-box">
          🔑 <strong>Chave PIX para Pagamento:</strong> ${data.pixKey}<br/>
          Por favor, envie o comprovante de pagamento para este mesmo número de WhatsApp.
        </div>
      ` : ''}

      <div style="margin-top: 30px; text-align: center; font-size: 10px; color: #94a3b8;">
        ${companyName} • Gestão Inteligente de Bordados
      </div>
    </body>
    </html>
  `;

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error('Erro ao imprimir extrato:', err);
    }
  }, 400);
};

export interface PeriodFinancialReportData {
  startDate: string;
  endDate: string;
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  companyName?: string;
  companyColor?: string;
  dailyEntries: Array<{
    date: string;
    description: string;
    category: string;
    type: 'income' | 'expense';
    amount: number;
    paymentMethod?: string;
  }>;
}

export const printPeriodFinancialReportPDF = (data: PeriodFinancialReportData) => {
  const companyName = data.companyName || 'BORDA AI';
  const brandColor = data.companyColor || '#8B5CF6';
  const formattedEmissao = new Date().toLocaleDateString('pt-BR');
  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

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

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Relatório Financeiro - ${data.startDate} até ${data.endDate}</title>
      <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { margin: 0; padding: 24px; color: #1e293b; font-size: 12px; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid ${brandColor}; padding-bottom: 14px; margin-bottom: 18px; }
        .title { font-size: 18px; font-weight: 900; color: #0f172a; text-transform: uppercase; }
        .subtitle { font-size: 11px; color: #64748b; font-weight: 600; }
        
        .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
        .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
        .kpi-label { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; }
        .kpi-val { font-size: 16px; font-weight: 900; margin-top: 4px; }
        
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #f1f5f9; text-align: left; padding: 8px 10px; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
        td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-bold { font-weight: 700; }
        .income-tag { color: #16a34a; font-weight: 800; }
        .expense-tag { color: #dc2626; font-weight: 800; }
        .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="title">${companyName} — Relatório Financeiro Geral</div>
          <div class="subtitle">Período Selecionado: <strong>${data.startDate}</strong> até <strong>${data.endDate}</strong></div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 800; font-size: 10px; color: #64748b;">DATA DE EMISSÃO</div>
          <div style="font-weight: 700;">${formattedEmissao}</div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card" style="border-left: 4px solid #16a34a;">
          <div class="kpi-label">Total de Entradas</div>
          <div class="kpi-val" style="color: #16a34a;">${fmt(data.totalIncome)}</div>
        </div>
        <div class="kpi-card" style="border-left: 4px solid #dc2626;">
          <div class="kpi-label">Total de Saídas / Custos</div>
          <div class="kpi-val" style="color: #dc2626;">${fmt(data.totalExpense)}</div>
        </div>
        <div class="kpi-card" style="border-left: 4px solid ${brandColor};">
          <div class="kpi-label">Resultado Líquido do Período</div>
          <div class="kpi-val" style="color: ${data.netProfit >= 0 ? '#0284c7' : '#dc2626'};">${fmt(data.netProfit)}</div>
        </div>
      </div>

      <h4 style="font-size: 12px; font-weight: 900; text-transform: uppercase; color: #334155; margin-bottom: 8px;">
        📋 Histórico Detalhado de Lançamentos do Período (${data.dailyEntries.length} itens)
      </h4>

      <table>
        <thead>
          <tr>
            <th>Data/Hora</th>
            <th>Descrição do Lançamento</th>
            <th>Categoria</th>
            <th>Método</th>
            <th class="text-right">Tipo</th>
            <th class="text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${data.dailyEntries.map(e => `
            <tr>
              <td>${new Date(e.date).toLocaleDateString('pt-BR')} ${new Date(e.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
              <td class="font-bold">${e.description}</td>
              <td>${e.category}</td>
              <td>${e.paymentMethod ? e.paymentMethod.toUpperCase() : 'N/A'}</td>
              <td class="text-right ${e.type === 'income' ? 'income-tag' : 'expense-tag'}">
                ${e.type === 'income' ? '+ ENTRADA' : '- SAÍDA'}
              </td>
              <td class="text-right font-bold ${e.type === 'income' ? 'income-tag' : 'expense-tag'}">
                ${fmt(e.amount)}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="footer">
        ${companyName} • Documento Financeiro Consolidado Gerado via BORDA AI
      </div>
    </body>
    </html>
  `;

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error('Erro ao imprimir relatório financeiro:', err);
    }
  }, 400);
};
