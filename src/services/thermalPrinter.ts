import { OrderPDFData } from './pdfGenerator';
import { parsePaymentMetadata } from '../utils/paymentHelper';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const printThermalReceipt = (order: OrderPDFData, canSeeFinancials: boolean = true) => {
  const width = '80mm';

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  // Format date
  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "dd/MM - HH:mm", { locale: ptBR });
  };

  const { cleanNotes, metadata } = parsePaymentMetadata(order.notes);

  // Determine status text
  let statusText = 'PENDENTE';
  if (order.paymentStatus === 'paid') statusText = 'PAGO (100%)';
  if (order.paymentStatus === 'half_paid') statusText = 'SINAL (50%)';

  // Build Items HTML
  const itemsHtml = (order.items || []).map(item => {
    // Limpar contagem de pontos e cores (ex: "(10.000 pts, 4 cores)")
    const cleanDesc = item.description.replace(/\s*\([\d.,]+\s*pts,\s*\d+\s*cores\)/i, '').trim();
    
    return `
    <div class="item-block">
      <div class="line"><strong>Ref:</strong> ${cleanDesc}</div>
      <div class="compact-row" style="margin-top: 3px;">
        <span class="compact-name">${item.quantity} un x ${canSeeFinancials ? formatCurrency(item.unitPrice) : '***'}</span>
        <span class="compact-price"><strong>${canSeeFinancials ? formatCurrency(item.totalPrice) : '***'}</strong></span>
      </div>
    </div>
    <div class="separator-dashed">- - - - - - - - - - - -</div>
  `}).join('');

  const companyName = order.companyName || 'BORDADOS';
  const phoneStr = order.companyPhone ? `<div class="line">Tel: ${order.companyPhone}</div>` : '';

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Cupom Pedido #${order.orderNumber || order.id.slice(0, 6)}</title>
      <style>
        @page {
          margin: 0;
          size: ${width} auto; 
        }
        body {
          font-family: 'Arial', 'Helvetica', sans-serif;
          width: 72mm;
          margin: 0 auto;
          padding: 5px 0;
          color: #000;
          background: #fff;
          font-size: 13px;
          line-height: 1.3;
          font-weight: 500;
        }
        .header {
          text-align: center;
          margin-bottom: 15px;
        }
        .title {
          font-size: 18px;
          font-weight: 900;
          display: block;
        }
        .subtitle {
          font-size: 14px;
          margin-top: 5px;
        }
        .section {
          margin-bottom: 10px;
        }
        .line {
          margin-bottom: 3px;
        }
        .separator {
          margin: 10px 0;
          border-bottom: 2px solid #000;
        }
        .separator-dashed {
          margin: 5px 0;
          text-align: center;
          color: #333;
          font-size: 10px;
        }
        .item-block {
          margin-bottom: 8px;
        }
        .compact-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          margin-bottom: 2px;
        }
        .compact-name {
          flex: 1;
          text-align: left;
        }
        .compact-price {
          text-align: right;
          min-width: 60px;
        }
        .total-block {
          margin-top: 10px;
          font-size: 18px;
          font-weight: 900;
          text-align: right;
          border-top: 2px solid #000;
          padding-top: 5px;
        }
        .footer {
          margin-top: 25px;
          text-align: center;
          font-size: 11px;
        }
        ::-webkit-scrollbar {
          display: none;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <span class="title">${companyName.toUpperCase()}</span>
        <span class="subtitle">PEDIDO #${order.orderNumber || order.id.slice(0, 6)}</span>
        <div style="font-size: 11px; margin-top: 3px;">${formatDate(order.createdAt)}</div>
      </div>

      <div class="separator"></div>

      <div class="section">
        <div class="line" style="font-size: 15px; font-weight: bold;">CLI: ${order.clientName?.toUpperCase() || 'CLIENTE GERAL'}</div>
        ${order.clientPhone ? `<div class="line">Tel: ${order.clientPhone}</div>` : ''}
      </div>

      <div class="separator"></div>

      <div style="font-weight: bold; margin-bottom: 8px; font-size: 12px;">ITENS DO PEDIDO</div>
      ${itemsHtml}

      ${canSeeFinancials ? `
      <div class="total-block">
        TOTAL: ${formatCurrency(order.totalAmount)}
      </div>
      ` : ''}
      
      <div style="margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 5px; font-size: 11px;">
        ${order.dueDate ? `
        <div class="line" style="text-align: right;">
          ENTREGA: <strong>${format(new Date(order.dueDate), 'dd/MM/yyyy')}</strong>
        </div>` : ''}
        
        <div class="line" style="text-align: right;">
          STATUS FINAN: <strong>${statusText}</strong>
        </div>

        ${canSeeFinancials && metadata?.depositAmount ? `
        <div class="line" style="text-align: right;">
          SINAL PAGO: <strong>${formatCurrency(metadata.depositAmount)}</strong>
        </div>
        <div class="line" style="text-align: right;">
          RESTANTE: <strong>${formatCurrency(Math.max(0, order.totalAmount - metadata.depositAmount))}</strong>
        </div>
        ` : ''}

        ${canSeeFinancials && order.paymentMethod ? `
        <div class="line" style="text-align: right;">
          MÉTODO: <strong>${order.paymentMethod.toUpperCase()}</strong>
        </div>` : ''}
      </div>

      ${cleanNotes ? `
      <div class="separator"></div>
      <div style="font-size: 11px;">
        <strong>OBSERVAÇÕES:</strong><br/>
        ${cleanNotes.replace(/\n/g, '<br/>')}
      </div>
      ` : ''}

      <div class="footer">
        <p>*** AGRADECEMOS A PREFERÊNCIA ***</p>
        <p style="font-size: 9px; margin-top: 5px;">${phoneStr}</p>
      </div>
      
      <script>
        window.onload = function() {
          window.print();
        }
      </script>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank', 'width=450,height=600');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
  } else {
    alert('Pop-up bloqueado. Permita pop-ups para imprimir a nota.');
  }
};
