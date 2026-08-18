import { parseLocalDate } from '@/utils/dateHelper';
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

const formatItemDesc = (desc?: string): string => {
  if (!desc || !desc.trim()) return 'Bordado Personalizado';
  return desc
    .replace(/\s*\(\s*\d+([\.,]\d+)?\s*(pts|pontos|ponto|p)\s*,\s*\d+\s*(cores|cor|c)\s*\)/gi, '')
    .replace(/\s*\(\s*\d+\s*(cores|cor|c)\s*,\s*\d+([\.,]\d+)?\s*(pts|pontos|ponto|p)\s*\)/gi, '')
    .replace(/\s*\(\s*\d+([\.,]\d+)?\s*(pts|pontos|ponto|p)\s*\)/gi, '')
    .replace(/\s*\(\s*\d+\s*(cores|cor|c)\s*\)/gi, '')
    .replace(/\s*-\s*\d+([\.,]\d+)?\s*(pts|pontos|ponto|p)/gi, '')
    .trim();
};

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
    ? parseLocalDate(order.dueDate)!.toLocaleDateString('pt-BR')
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
            ${order.items.map(item => {
              const uPrice = Number(item.unitPrice ?? (item as any).unit_price ?? 0);
              const tPrice = Number(item.totalPrice ?? (item as any).total_price ?? (uPrice * (item.quantity || 1)));
              return `
              <tr>
                <td class="font-bold">${formatItemDesc(item.description)}</td>
                <td class="text-center">${item.quantity} un</td>
                ${canSee ? `<td class="text-right">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(uPrice)}</td><td class="text-right font-bold">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tPrice)}</td>` : ''}
              </tr>
            `;
            }).join('')}
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
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '-9999px';
  container.style.background = 'white';
  container.style.width = '794px'; // 210mm a 96DPI
  container.style.padding = '20px';
  container.style.boxSizing = 'border-box';
  document.body.appendChild(container);

  // Aguarda 100ms para carregar quaisquer fontes ou imagens
  await new Promise(r => setTimeout(r, 100));

  const canvas = await html2canvas(container, {
    scale: 2,
    useCORS: true,
    logging: false,
    y: 0,
    scrollY: 0,
    windowWidth: 800
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  
  const imgProps = pdf.getImageProperties(imgData);
  const calculatedHeight = (imgProps.height * pdfWidth) / imgProps.width;

  // Se a altura couber na página A4, centraliza levemente com margem
  if (calculatedHeight <= pdfHeight) {
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, calculatedHeight);
  } else {
    // Se for maior que 1 página, adiciona com proporção
    let heightLeft = calculatedHeight;
    let position = 0;

    pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, calculatedHeight);
    heightLeft -= pdfHeight;

    while (heightLeft >= 0) {
      position = heightLeft - calculatedHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, calculatedHeight);
      heightLeft -= pdfHeight;
    }
  }

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
    items?: Array<{
      id?: string;
      description?: string;
      item_name?: string;
      name?: string;
      quantity?: number;
      unit_price?: number;
      unitPrice?: number;
      total_price?: number;
      totalPrice?: number;
    }>;
  }>;
  grandPending: number;
  companyName?: string;
  companyColor?: string;
  pixKey?: string;
  workingHours?: string;
}

const getClientStatementHTML = (data: ClientStatementPDFData) => {
  const companyName = data.companyName || 'GUAÇU BORDADOS';
  const brandColor = data.companyColor || '#8B5CF6';
  const formattedDate = new Date().toLocaleDateString('pt-BR');
  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formattedGrandPending = fmt(data.grandPending);

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Extrato Detalhado de Débitos - ${data.clientName}</title>
      <style>
        @page { size: A4; margin: 12mm; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; word-spacing: normal; letter-spacing: normal; }
        body { font-family: 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif; margin: 0; padding: 0; color: #1e293b; font-size: 12px; line-height: 1.4; background: #ffffff; }
        .brand-bar { height: 6px; background: ${brandColor}; width: 100%; border-radius: 4px 4px 0 0; margin-bottom: 16px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; }
        .title { font-size: 20px; font-weight: 900; color: ${brandColor}; text-transform: uppercase; letter-spacing: -0.5px; margin: 0; }
        .subtitle { font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
        .client-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; }
        .client-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 2px; letter-spacing: 0.5px; }
        .client-name { font-size: 15px; font-weight: 800; color: #0f172a; }
        
        .order-card { margin-bottom: 16px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #ffffff; page-break-inside: avoid; }
        .order-header { background: #f8fafc; padding: 10px 14px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
        .order-num { font-size: 13px; font-weight: 900; color: #0f172a; }
        .order-dates { font-size: 11px; color: #64748b; margin-left: 8px; }
        
        .pending-tag { background: #fef2f2; color: #dc2626; padding: 3px 8px; border-radius: 16px; font-weight: 800; font-size: 9px; border: 1px solid #fca5a5; display: inline-block; white-space: nowrap; }
        .half-tag { background: #eff6ff; color: #2563eb; padding: 3px 8px; border-radius: 16px; font-weight: 800; font-size: 9px; border: 1px solid #93c5fd; display: inline-block; white-space: nowrap; }
        
        table.items-table { width: 100%; border-collapse: collapse; }
        table.items-table th { background: #f1f5f9; color: #475569; text-align: left; padding: 6px 12px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #cbd5e1; }
        table.items-table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-size: 11px; color: #334155; }
        table.items-table tr:nth-child(even) { background-color: #f8fafc; }
        
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-bold { font-weight: 700; }
        
        .total-container { display: flex; justify-content: space-between; align-items: center; background: #0f172a; color: white; padding: 14px 18px; border-radius: 10px; margin-top: 16px; margin-bottom: 16px; }
        .total-val { font-size: 22px; font-weight: 900; color: #ffffff; }
        .pix-box { padding: 12px 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; color: #92400e; font-size: 11px; margin-bottom: 16px; }
        .footer { border-top: 1px solid #e2e8f0; padding-top: 12px; text-align: center; font-size: 10px; color: #94a3b8; }
      </style>
    </head>
    <body>
      <div class="brand-bar"></div>
      <div class="header">
        <div>
          <h1 class="title">${companyName}</h1>
          <div class="subtitle">Extrato Detalhado de Fechamento de Pedidos</div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 800; font-size: 10px; color: #64748b; text-transform: uppercase;">DATA DE EMISSÃO</div>
          <div style="font-weight: 700; font-size: 12px; color: #0f172a;">${formattedDate}</div>
        </div>
      </div>

      <div class="client-box">
        <div class="client-title">Cliente / Destinatário</div>
        <div class="client-name">${data.clientName} ${data.clientCompany ? `(${data.clientCompany})` : ''}</div>
        ${data.clientPhone ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">📞 ${data.clientPhone}</div>` : ''}
      </div>

      <!-- Pedidos Detalhados com seus Respectivos Itens -->
      ${data.orders.map(o => {
        const orderNumStr = o.orderNumber ? `#${o.orderNumber}` : `#${o.id.slice(0, 6)}`;
        const dateStr = new Date(o.createdAt).toLocaleDateString('pt-BR');
        const dueStr = o.dueDate ? parseLocalDate(o.dueDate)!.toLocaleDateString('pt-BR') : 'A combinar';
        const hasItems = o.items && o.items.length > 0;

        return `
          <div class="order-card">
            <div class="order-header">
              <div>
                <span class="order-num">Pedido ${orderNumStr}</span>
                <span class="order-dates">Entrada: ${dateStr} • Vencimento: ${dueStr}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 12px;">
                ${o.paymentStatus === 'half_paid' ? '<span class="half-tag">SINAL 50% RECEBIDO</span>' : '<span class="pending-tag">100% PENDENTE</span>'}
                <div style="text-align: right;">
                  <span style="font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block;">A Receber</span>
                  <span style="font-size: 13px; font-weight: 900; color: #dc2626;">${fmt(o.pendingAmount)}</span>
                </div>
              </div>
            </div>

            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 50%;">Item / Descrição do Bordado</th>
                  <th class="text-center" style="width: 15%;">Qtd</th>
                  <th class="text-right" style="width: 17%;">Valor Unit.</th>
                  <th class="text-right" style="width: 18%;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${hasItems ? o.items!.map(it => {
                  const desc = formatItemDesc(it.description || it.item_name || it.name || 'Bordado Personalizado');
                  const qty = it.quantity || 1;
                  const unitPrice = it.unit_price ?? it.unitPrice ?? (qty ? (it.total_price ?? it.totalPrice ?? o.totalAmount) / qty : 0);
                  const totalPrice = it.total_price ?? it.totalPrice ?? (qty * unitPrice);

                  return `
                    <tr>
                      <td class="font-bold">${desc}</td>
                      <td class="text-center font-bold">${qty} pçs</td>
                      <td class="text-right">${fmt(unitPrice)}</td>
                      <td class="text-right font-bold">${fmt(totalPrice)}</td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td class="font-bold">Serviços de Bordado / Ficha Técnica</td>
                    <td class="text-center font-bold">1 un</td>
                    <td class="text-right">${fmt(o.totalAmount)}</td>
                    <td class="text-right font-bold">${fmt(o.totalAmount)}</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        `;
      }).join('')}

      <div class="total-container">
        <div>
          <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #94a3b8;">Total Acumulado a Pagar</div>
          <div style="font-size: 11px; color: #cbd5e1;">Sumatório dos pedidos em aberto deste cliente</div>
        </div>
        <div class="total-val">${formattedGrandPending}</div>
      </div>

      ${data.pixKey ? `
        <div class="pix-box">
          🔑 <strong>Chave PIX para Pagamento:</strong> ${data.pixKey}<br/>
          Por favor, envie o comprovante de pagamento para este mesmo número de WhatsApp.
        </div>
      ` : ''}

      <div class="footer">${companyName} — Tecnologia ERP para Oficinas de Bordado</div>
    </body>
    </html>
  `;
};

export const printClientStatementPDF = (data: ClientStatementPDFData) => {
  const html = getClientStatementHTML(data);
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

export const generateClientStatementPDFBase64 = async (data: ClientStatementPDFData): Promise<string> => {
  const container = document.createElement('div');
  container.innerHTML = getClientStatementHTML(data);
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '-9999px';
  container.style.background = 'white';
  container.style.width = '794px';
  container.style.padding = '20px';
  container.style.boxSizing = 'border-box';
  document.body.appendChild(container);

  await new Promise(r => setTimeout(r, 100));

  const canvas = await html2canvas(container, {
    scale: 2,
    useCORS: true,
    logging: false,
    y: 0,
    scrollY: 0,
    windowWidth: 800
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  
  const imgProps = pdf.getImageProperties(imgData);
  const calculatedHeight = (imgProps.height * pdfWidth) / imgProps.width;

  if (calculatedHeight <= pdfHeight) {
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, calculatedHeight);
  } else {
    let heightLeft = calculatedHeight;
    let position = 0;

    pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, calculatedHeight);
    heightLeft -= pdfHeight;

    while (heightLeft >= 0) {
      position = heightLeft - calculatedHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, calculatedHeight);
      heightLeft -= pdfHeight;
    }
  }

  document.body.removeChild(container);
  return pdf.output('datauristring').split(',')[1];
};
