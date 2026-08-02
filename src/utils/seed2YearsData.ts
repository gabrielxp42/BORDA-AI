import { supabase } from '@/integrations/supabase/client';
import { serializePaymentMetadata, updatePaymentMetadata, PaymentMetadata } from './paymentHelper';
import { subDays, format, subMonths } from 'date-fns';
import { toast } from 'sonner';

const SAMPLE_CLIENTS = [
  { name: 'Gabriel Silva', company_name: 'Uniformes Silva Ltda', phone: '11988776655', email: 'contato@uniformessilva.com.br' },
  { name: 'Ana Paula Rocha', company_name: 'Escola Modelo Integrada', phone: '11977665544', email: 'financeiro@escolamodelo.com.br' },
  { name: 'Carlos Eduardo', company_name: 'Confecções Oliveira', phone: '11966554433', email: 'carlos@confeccoesoliveira.com' },
  { name: 'Fernanda Lima', company_name: 'Studio Moda & Estilo', phone: '11955443322', email: 'fernanda@studiomoda.com.br' },
  { name: 'Roberto Alencar', company_name: 'E.C. União Futebol Clube', phone: '11944332211', email: 'diretoria@ecuniao.com.br' },
  { name: 'Juliana Mendes', company_name: 'Academia Fit & Power', phone: '11933221100', email: 'juliana@fitpower.com.br' },
  { name: 'Dr. Marcelo Viana', company_name: 'Clínica Saúde & Vida', phone: '11922110099', email: 'marcelo@clinicasaudevida.com' },
  { name: 'Renata Castro', company_name: 'Restaurante Sabor Real', phone: '11911009988', email: 'renata@saborreal.com.br' },
  { name: 'Marcos Vinícius', company_name: 'Grupo Baronesa Eventos', phone: '11900998877', email: 'marcos@baronesaeventos.com' },
  { name: 'Patrícia Souza', company_name: 'Hotel Pousada das Flores', phone: '11999887766', email: 'patricia@pousadadasflores.com' },
  { name: 'Thiago Barbosa', company_name: 'Oficina Auto Tech', phone: '11988990011', email: 'thiago@autotech.com.br' },
  { name: 'Luciana Martins', company_name: 'Boutique Chique', phone: '11977889922', email: 'luciana@boutiquechique.com' }
];

const ITEM_TYPES = [
  { name: 'Logo Peito Camisa Polo', stitches: 8500, colors: 3, unitPrice: 8.50 },
  { name: 'Bordado Costas Agasalho', stitches: 38000, colors: 5, unitPrice: 28.00 },
  { name: 'Emblema Frontal Boné', stitches: 14000, colors: 4, unitPrice: 12.00 },
  { name: 'Brasão Jaleco Médico + Nome', stitches: 11000, colors: 2, unitPrice: 18.00 },
  { name: 'Logo Toalha de Banho Luxo', stitches: 19500, colors: 3, unitPrice: 15.00 },
  { name: 'Tarja Emborrachada / Manchetê', stitches: 6500, colors: 2, unitPrice: 6.50 },
  { name: 'Bordado Computadorizado Mochila', stitches: 22000, colors: 4, unitPrice: 22.00 },
  { name: 'Escudo Esportivo em Relevo 3D', stitches: 45000, colors: 6, unitPrice: 35.00 }
];

const PAYMENT_METHODS = ['pix', 'credit_card', 'cash', 'transfer'];

export async function seed2YearsData(): Promise<boolean> {
  const toastId = toast.loading('🚀 Simulando 2 anos de histórico de vendas, clientes e caixa...');

  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) {
      toast.error('Usuário não autenticado.', { id: toastId });
      return false;
    }

    // 1. Inserir Clientes
    const clientsPayload = SAMPLE_CLIENTS.map(c => ({
      user_id: userId,
      name: c.name,
      company_name: c.company_name,
      phone: c.phone,
      email: c.email
    }));

    const { data: insertedClients, error: clientErr } = await supabase
      .from('clients')
      .insert(clientsPayload)
      .select();

    if (clientErr || !insertedClients || insertedClients.length === 0) {
      console.error("Erro ao inserir clientes:", clientErr);
      toast.error('Erro ao gerar clientes simulados.', { id: toastId });
      return false;
    }

    // 2. Gerar ~80 Pedidos distribuídos nos últimos 24 meses (730 dias)
    const totalOrdersToGenerate = 85;
    const ordersPayload = [];
    const orderItemsMap: Record<number, any[]> = {};

    for (let i = 0; i < totalOrdersToGenerate; i++) {
      // Distribuição de datas: 80% nos últimos 2 anos, 20% nos últimos 30 dias
      const isRecent = i < 15; // 15 pedidos bem recentes para o Kanban
      const daysAgo = isRecent 
        ? Math.floor(Math.random() * 15) 
        : Math.floor(Math.random() * 700) + 15;

      const orderDate = subDays(new Date(), daysAgo);
      const randomClient = insertedClients[Math.floor(Math.random() * insertedClients.length)];
      const randomItemType = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
      const randomQty = Math.floor(Math.random() * 80) + 10;
      const totalAmount = randomItemType.unitPrice * randomQty;

      // Status do Pedido
      let status: string;
      let paymentStatus: 'pending' | 'half_paid' | 'paid';
      let method = PAYMENT_METHODS[Math.floor(Math.random() * PAYMENT_METHODS.length)];

      if (daysAgo > 30) {
        // Pedidos antigos: 90% concluídos e pagos, 10% cancelados
        if (Math.random() > 0.1) {
          status = 'concluido';
          paymentStatus = 'paid';
        } else {
          status = 'cancelado';
          paymentStatus = 'pending';
        }
      } else {
        // Pedidos recentes: variam entre as colunas do Kanban
        const rand = Math.random();
        if (rand < 0.2) {
          status = 'orcamento';
          paymentStatus = 'pending';
        } else if (rand < 0.4) {
          status = 'aprovado';
          paymentStatus = 'half_paid';
        } else if (rand < 0.7) {
          status = 'producao';
          paymentStatus = 'half_paid';
        } else if (rand < 0.9) {
          status = 'pronto';
          paymentStatus = 'paid';
        } else {
          status = 'concluido';
          paymentStatus = 'paid';
        }
      }

      // Metadados de Pagamento
      let metadata: PaymentMetadata = {};
      if (paymentStatus === 'paid') {
        metadata = {
          paymentMethod: method,
          paidAt: orderDate.toISOString(),
          paymentNote: `Pagamento integral via ${method.toUpperCase()} recebido no prazo`
        };
      } else if (paymentStatus === 'half_paid') {
        metadata = {
          paymentMethod: method,
          depositAmount: totalAmount / 2,
          paymentNote: `Sinal de 50% pago via ${method.toUpperCase()}`
        };
      }

      const notesWithMeta = serializePaymentMetadata('Pedido simulado de 2 anos de histórico', metadata);

      ordersPayload.push({
        user_id: userId,
        client_id: randomClient.id,
        status: status,
        payment_status: paymentStatus,
        payment_method: paymentStatus === 'pending' ? null : method,
        total_amount: totalAmount,
        due_date: format(subDays(orderDate, -5), 'yyyy-MM-dd'),
        notes: notesWithMeta,
        created_at: orderDate.toISOString()
      });

      // Itens do Pedido
      orderItemsMap[i] = [
        {
          description: `Bordado: ${randomItemType.name} (${randomItemType.stitches.toLocaleString()} pts, ${randomItemType.colors} cores)`,
          quantity: randomQty,
          unit_price: randomItemType.unitPrice,
          total_price: totalAmount
        }
      ];
    }

    // Inserir os pedidos no Supabase
    const { data: insertedOrders, error: orderErr } = await supabase
      .from('orders')
      .insert(ordersPayload)
      .select();

    if (orderErr || !insertedOrders) {
      console.error("Erro ao inserir pedidos:", orderErr);
      toast.error('Erro ao salvar pedidos simulados.', { id: toastId });
      return false;
    }

    // Inserir itens dos pedidos
    const allOrderItemsPayload = [];
    for (let idx = 0; idx < insertedOrders.length; idx++) {
      const orderObj = insertedOrders[idx];
      const items = orderItemsMap[idx] || [];
      for (const item of items) {
        allOrderItemsPayload.push({
          order_id: orderObj.id,
          ...item
        });
      }
    }

    if (allOrderItemsPayload.length > 0) {
      await supabase.from('order_items').insert(allOrderItemsPayload);
    }

    toast.success('🎉 2 Anos de histórico simulados com sucesso! Recarregando sistema...', { id: toastId });
    setTimeout(() => {
      window.location.reload();
    }, 1500);

    return true;
  } catch (err) {
    console.error("Erro ao gerar simulação de 2 anos:", err);
    toast.error('Falha ao simular dados de 2 anos.', { id: toastId });
    return false;
  }
}
