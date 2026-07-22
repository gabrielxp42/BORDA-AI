interface OrderPDFData {
  id: string;
  orderNumber?: string;
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
}

export const printOrderReceipt = (order: OrderPDFData) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const paymentStatusText = order.paymentStatus === 'paid' ? 'PAGO (100%)' : order.paymentStatus === 'half_paid' ? 'SINAL (50%)' : 'PENDENTE';
  const companyName = order.companyName || 'SISTEMA DE BORDADOS';

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Ordem de Serviço - #${order.id.slice(0, 6)}</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          color: #1e293b;
          margin: 0;
          padding: 40px;
          background-color: #ffffff;
        }
        .receipt-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        .company-title {
          font-size: 24px;
          font-weight: 900;
          color: #6b21a8;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .order-title {
          font-size: 18px;
          font-weight: 800;
          color: #334155;
          text-align: right;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 30px;
          background: #f8fafc;
          padding: 20px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        }
        .meta-box h4 {
          margin: 0 0 5px 0;
          font-size: 11px;
          text-transform: uppercase;
          color: #64748b;
          letter-spacing: 1px;
        }
        .meta-box p {
          margin: 0;
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        th {
          background-color: #f1f5f9;
          text-align: left;
          padding: 12px 16px;
          font-size: 11px;
          text-transform: uppercase;
          color: #475569;
          border-bottom: 2px solid #cbd5e1;
        }
        td {
          padding: 14px 16px;
          font-size: 13px;
          border-bottom: 1px solid #e2e8f0;
        }
        .total-box {
          display: flex;
          justify-content: flex-end;
          margin-top: 20px;
        }
        .total-card {
          background-color: #0f172a;
          color: #ffffff;
          padding: 20px 30px;
          border-radius: 12px;
          text-align: right;
          min-width: 250px;
        }
        .total-card span {
          display: block;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1px;
          opacity: 0.8;
        }
        .total-card strong {
          font-size: 26px;
          font-weight: 900;
        }
        .footer-notes {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e2e8f0;
          font-size: 11px;
          color: #64748b;
        }
        @media print {
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="receipt-header">
        <div>
          <div class="company-title">${companyName}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Comprovante de Ordem de Serviço de Bordado</div>
        </div>
        <div class="order-title">
          ORDEM #${order.id.slice(0, 6)}<br>
          <span style="font-size: 12px; font-weight: normal; color: #64748b;">Data: ${new Date(order.createdAt).toLocaleDateString('pt-BR')}</span>
        </div>
      </div>

      <div class="meta-grid">
        <div class="meta-box">
          <h4>Cliente</h4>
          <p>${order.clientName}</p>
          ${order.clientPhone ? `<span style="font-size:12px; color:#475569;">📞 ${order.clientPhone}</span>` : ''}
        </div>
        <div class="meta-box">
          <h4>Status do Pagamento</h4>
          <p style="color: ${order.paymentStatus === 'paid' ? '#16a34a' : order.paymentStatus === 'half_paid' ? '#2563eb' : '#d97706'}; font-weight: 900;">
            ${paymentStatusText}
          </p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Descrição / Matriz</th>
            <th style="text-align: center;">Quantidade</th>
            <th style="text-align: right;">Valor Unit.</th>
            <th style="text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${(order.items || []).map((item: any) => {
            const unitPrice = Number(item.unitPrice ?? item.unit_price ?? 0);
            const totalPrice = Number(item.totalPrice ?? item.total_price ?? 0);
            return `
              <tr>
                <td><strong>${item.description || 'Matriz de Bordado'}</strong></td>
                <td style="text-align: center;">${item.quantity || 1} un</td>
                <td style="text-align: right;">R$ ${unitPrice.toFixed(2)}</td>
                <td style="text-align: right;"><strong>R$ ${totalPrice.toFixed(2)}</strong></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <div class="total-box">
        <div class="total-card">
          <span>VALOR TOTAL DO PEDIDO</span>
          <strong>R$ ${order.totalAmount.toFixed(2)}</strong>
        </div>
      </div>

      ${order.notes ? `
        <div style="margin-top: 30px; background: #f1f5f9; padding: 15px; border-radius: 8px;">
          <strong style="font-size: 11px; text-transform: uppercase; color: #475569;">Observações:</strong>
          <p style="margin: 5px 0 0 0; font-size: 13px;">${order.notes}</p>
        </div>
      ` : ''}

      <div class="footer-notes">
        <p>Documento emitido digitalmente via ERP de Bordados. Obrigado pela preferência!</p>
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
};
