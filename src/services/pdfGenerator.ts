import { parsePaymentMetadata } from '@/utils/paymentHelper';

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

export const printOrderReceipt = (order: OrderPDFData) => {
  const { cleanNotes } = parsePaymentMetadata(order.notes);
  const canSee = order.canSeeFinancials !== false; // defaults to true if not provided

  const brandColor = order.companyColor || '#9333ea';
  const companyName = order.companyName || 'GUAÇU BORDADOS';
  const companySubtitle = order.companySubtitle || 'GESTÃO INTELIGENTE DE BORDADOS';
  const orderCode = order.orderNumber ? `#${order.orderNumber}` : `#${order.id.slice(0, 6)}`;

  // Formatação do Status de Pagamento
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

  // Remove iframe anterior se existir
  const existingFrame = document.getElementById('borda-print-iframe');
  if (existingFrame) {
    existingFrame.remove();
  }

  // Cria um iframe invisível isolado no documento (evitando travar a aba principal do Chrome)
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

  const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!frameDoc) return;

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Ordem de Serviço ${orderCode} - ${companyName}</title>
      <style>
        @page {
          size: A4;
          margin: 15mm;
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          font-family: 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif;
          color: #1e293b;
          margin: 0;
          padding: 0;
          background-color: #ffffff;
          font-size: 13px;
          line-height: 1.5;
        }
        
        .brand-bar {
          height: 6px;
          background: ${brandColor};
          width: 100%;
          border-radius: 4px 4px 0 0;
          margin-bottom: 20px;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-bottom: 20px;
          border-bottom: 2px solid #f1f5f9;
          margin-bottom: 24px;
        }
        .company-brand {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .company-logo {
          max-height: 64px;
          max-width: 180px;
          object-fit: contain;
        }
        .company-title {
          font-size: 22px;
          font-weight: 900;
          color: ${brandColor};
          letter-spacing: -0.5px;
          margin: 0;
          text-transform: uppercase;
        }
        .company-subtitle {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-top: 2px;
        }
        .company-info {
          font-size: 11px;
          color: #475569;
          margin-top: 6px;
        }

        .document-title {
          text-align: right;
        }
        .doc-badge {
          font-size: 20px;
          font-weight: 900;
          color: #0f172a;
          letter-spacing: -0.5px;
        }
        .doc-date {
          font-size: 11px;
          color: #64748b;
          margin-top: 4px;
        }

        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 24px;
        }
        .info-card {
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px 16px;
        }
        .card-label {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #64748b;
          margin-bottom: 6px;
        }
        .card-value {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
        }
        .card-subtext {
          font-size: 11px;
          color: #475569;
          margin-top: 2px;
        }

        .status-pill {
          display: inline-block;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          background-color: ${paymentBadgeBg};
          color: ${paymentBadgeColor};
          border: 1px solid ${paymentBadgeColor}40;
        }

        .table-container {
          margin-bottom: 24px;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid #e2e8f0;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th {
          background-color: ${brandColor};
          color: #ffffff;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 12px 16px;
          text-align: left;
        }
        td {
          padding: 12px 16px;
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
          font-size: 12px;
        }
        tr:nth-child(even) {
          background-color: #f8fafc;
        }
        tr:last-child td {
          border-bottom: none;
        }
        .text-right {
          text-align: right;
        }
        .text-center {
          text-align: center;
        }
        .font-bold {
          font-weight: 700;
        }

        .notes-box {
          background-color: #faf5ff;
          border: 1px solid #e9d5ff;
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 24px;
        }
        .notes-title {
          font-size: 11px;
          font-weight: 800;
          color: ${brandColor};
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .notes-content {
          font-size: 12px;
          color: #475569;
          font-style: italic;
        }

        .summary-container {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          margin-bottom: 30px;
        }
        .payment-info-box {
          flex: 1;
          background-color: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 12px;
          padding: 14px 16px;
        }
        .payment-info-title {
          font-size: 11px;
          font-weight: 800;
          color: #d97706;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .payment-info-text {
          font-size: 11px;
          color: #78350f;
          line-height: 1.6;
        }

        .total-box {
          min-width: 220px;
          background-color: #0f172a;
          color: #ffffff;
          border-radius: 12px;
          padding: 16px;
          text-align: right;
        }
        .total-label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #94a3b8;
        }
        .total-amount {
          font-size: 24px;
          font-weight: 900;
          color: #ffffff;
          margin-top: 4px;
          letter-spacing: -0.5px;
        }

        .footer {
          border-top: 1px solid #e2e8f0;
          padding-top: 16px;
          text-align: center;
          font-size: 10px;
          color: #94a3b8;
        }
        .footer-highlight {
          font-weight: 700;
          color: #64748b;
        }
      </style>
    </head>
    <body>
      <div class="brand-bar"></div>

      <!-- Cabeçalho -->
      <div class="header">
        <div class="company-brand">
          ${order.companyLogo ? `<img src="${order.companyLogo}" class="company-logo" alt="Logo" />` : ''}
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
        </div>

        <div class="document-title">
          <div class="doc-badge">ORDEM DE SERVIÇO ${orderCode}</div>
          <div class="doc-date">Data da Entrada: <strong>${formattedDate}</strong></div>
          <div class="doc-date">Previsão de Entrega: <strong>${formattedDueDate}</strong></div>
        </div>
      </div>

      <!-- Dados do Cliente e Pagamento -->
      <div class="info-grid">
        <div class="info-card">
          <div class="card-label">Cliente / Destinatário</div>
          <div class="card-value">${order.clientName}</div>
          ${order.clientCompany ? `<div class="card-subtext">🏢 ${order.clientCompany}</div>` : ''}
          ${order.clientPhone ? `<div class="card-subtext">📞 ${order.clientPhone}</div>` : ''}
        </div>

        <div class="info-card">
          <div class="card-label">Status do Pagamento</div>
          <div style="margin-top: 4px;">
            <span class="status-pill">${paymentStatusText}</span>
          </div>
          ${order.paymentMethod ? `<div class="card-subtext" style="margin-top: 8px;">Método: <strong>${order.paymentMethod.toUpperCase()}</strong></div>` : ''}
        </div>
      </div>

      <!-- Tabela de Itens de Bordado -->
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Descrição do Serviço / Matriz</th>
              <th class="text-center">Quantidade</th>
              ${canSee ? '<th class="text-right">Valor Unitário</th>' : ''}
              ${canSee ? '<th class="text-right">Total</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${order.items.map(item => {
              const cleanDesc = item.description.replace(/\s*\([\d.,]+\s*pts,\s*\d+\s*cores\)/i, '').trim();
              return `
              <tr>
                <td class="font-bold">${cleanDesc}</td>
                <td class="text-center">${item.quantity} un</td>
                ${canSee ? `<td class="text-right">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unitPrice || 0)}</td>` : ''}
                ${canSee ? `<td class="text-right font-bold">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.totalPrice || 0)}</td>` : ''}
              </tr>
            `}).join('')}
          </tbody>
        </table>
      </div>

      <!-- Observações Limpas se Existirem -->
      ${cleanNotes && cleanNotes.trim().length > 0 ? `
        <div class="notes-box">
          <div class="notes-title">📝 Observações & Especificações da Encomenda</div>
          <div class="notes-content">"${cleanNotes.trim()}"</div>
        </div>
      ` : ''}

      <!-- Resumo Financeiro & Dados de Pagamento -->
      <div class="summary-container">
        <div class="payment-info-box">
          <div class="payment-info-title">🔑 Dados para Pagamento & Atendimento</div>
          <div class="payment-info-text">
            ${canSee && order.pixKey ? `Chave PIX: <strong>${order.pixKey}</strong><br/>` : ''}
            ${order.workingHours ? `Horário de Funcionamento: <strong>${order.workingHours}</strong><br/>` : ''}
            Qualquer dúvida sobre a programação ou produção, entre em contato via WhatsApp!
          </div>
        </div>

        ${canSee ? `
        <div class="total-box">
          <div class="total-label">Valor Total do Pedido</div>
          <div class="total-amount">${formattedTotal}</div>
        </div>
        ` : ''}
      </div>

      <!-- Rodapé Oficial -->
      <div class="footer">
        <div class="footer-highlight">${companyName} — Tecnologia ERP para Oficinas de Bordado</div>
        <div>Documento emitido digitalmente em ${formattedDate}. Obrigado pela preferência!</div>
      </div>
    </body>
    </html>
  `;

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  // Dispara a janela de impressão diretamente pelo iframe sem abrir guia extra nem congelar o app!
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error("Erro ao disparar impressão:", err);
    }
  }, 400);
};
