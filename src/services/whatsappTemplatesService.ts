import { formatWhatsAppNumber, sendEvolutionText } from './whatsappService';
import { supabase } from '@/integrations/supabase/client';

export interface WhatsAppTemplate {
  id: string;
  title: string;
  category: 'cliente' | 'equipe' | 'cobranca';
  description: string;
  triggerEvent: 'status_pronto' | 'orcamento_criado' | 'em_producao' | 'pos_venda' | 'alerta_operador' | 'cobranca_pix' | 'manual';
  enabled: boolean;
  templateText: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'pdf';
  availableTags: string[];
}

export const EMBROIDERY_VARIABLES: { tag: string; label: string; example: string; category: string }[] = [
  // 🧵 Bordado & Ficha Técnica
  { tag: '{nome_matriz}', label: 'Nome da Matriz', example: 'Logo Shell Corp', category: 'Bordado' },
  { tag: '{pontos_matriz}', label: 'Pontos da Matriz', example: '18.500 pts', category: 'Bordado' },
  { tag: '{quantidade_pecas}', label: 'Qtd de Peças', example: '150 peças', category: 'Bordado' },
  { tag: '{tamanho_bordado}', label: 'Tamanho (mm)', example: '100mm x 85mm', category: 'Bordado' },
  { tag: '{quantidade_cores}', label: 'Nº de Cores', example: '4 cores', category: 'Bordado' },
  { tag: '{bastidor_tipo}', label: 'Bastidor Usado', example: 'Bastidor 15x15', category: 'Bordado' },
  { tag: '{tempo_estimado}', label: 'Tempo Máquina', example: '42 min', category: 'Bordado' },
  { tag: '{formato_arquivo}', label: 'Formato Matriz', example: '.DST', category: 'Bordado' },

  // 📦 Pedido & Logística
  { tag: '{numero_pedido}', label: 'Nº do Pedido', example: '#104', category: 'Pedido' },
  { tag: '{status_pedido}', label: 'Status Atual', example: 'Pronto para Retirada', category: 'Pedido' },
  { tag: '{previsao_entrega}', label: 'Prazo Entrega', example: '28/07 às 17h', category: 'Pedido' },
  { tag: '{link_aprovacao}', label: 'Link de Aprovação', example: 'https://borda.ai/aprovar/104', category: 'Pedido' },
  { tag: '{link_pdf_pedido}', label: 'Link Ficha PDF', example: 'https://borda.ai/pdf/104', category: 'Pedido' },

  // 💰 Financeiro
  { tag: '{valor_unitario}', label: 'Valor por Peça', example: 'R$ 4,50', category: 'Financeiro' },
  { tag: '{valor_total}', label: 'Valor Total', example: 'R$ 675,00', category: 'Financeiro' },
  { tag: '{valor_entrada}', label: 'Sinal 50%', example: 'R$ 337,50', category: 'Financeiro' },
  { tag: '{valor_saldo}', label: 'Saldo Pendente', example: 'R$ 337,50', category: 'Financeiro' },
  { tag: '{chave_pix}', label: 'Chave PIX', example: '19999999999', category: 'Financeiro' },

  // 👤 Cliente & Oficina
  { tag: '{nome_cliente}', label: 'Nome do Cliente', example: 'João Carlos', category: 'Cliente & Oficina' },
  { tag: '{empresa_cliente}', label: 'Empresa Cliente', example: 'Shell Corp', category: 'Cliente & Oficina' },
  { tag: '{nome_oficina}', label: 'Nome da Oficina', example: 'Guaçu Bordados', category: 'Cliente & Oficina' },
  { tag: '{endereco_oficina}', label: 'Endereço Oficina', example: 'Rua das Flores, 123', category: 'Cliente & Oficina' },
  { tag: '{nome_operador}', label: 'Nome do Bordador', example: 'Carlos Silva', category: 'Cliente & Oficina' },
  { tag: '{nome_maquina}', label: 'Nome da Máquina', example: 'Barudan #02', category: 'Cliente & Oficina' },
];

export const DEFAULT_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: 'tpl_pronto_retirada',
    title: '📦 Pedido Pronto para Retirada',
    category: 'cliente',
    description: 'Enviado automaticamente para o cliente quando o bordado está concluído e liberado para busca',
    triggerEvent: 'status_pronto',
    enabled: true,
    templateText: 'Olá *{nome_cliente}*! As suas *{quantidade_pecas}* do pedido *#{numero_pedido}* (*{nome_matriz}*) estão PRONTAS e bordadas com sucesso na *{nome_oficina}*! 🧵✨\n\n💰 Saldo pendente: *{valor_saldo}*\n🔑 Chave PIX: {chave_pix}\n📍 Endereço de retirada: {endereco_oficina}\n\nAguardamos você para a retirada!',
    availableTags: ['{nome_cliente}', '{quantidade_pecas}', '{numero_pedido}', '{nome_matriz}', '{nome_oficina}', '{valor_saldo}', '{chave_pix}', '{endereco_oficina}']
  },
  {
    id: 'tpl_orcamento_aprovacao',
    title: '📝 Orçamento & Amostra Virtual para Aprovação',
    category: 'cliente',
    description: 'Enviado para o cliente com os detalhes de pontos, valor, sinal de 50% e link de validação',
    triggerEvent: 'orcamento_criado',
    enabled: true,
    templateText: 'Olá *{nome_cliente}*! Segue a ficha de orçamento do seu bordado *#{numero_pedido}* (*{nome_matriz}*):\n\n👕 Quantidade: *{quantidade_pecas}*\n🧵 Pontos da Matriz: *{pontos_matriz}*\n📐 Tamanho: *{tamanho_bordado}*\n💵 Valor Total: *{valor_total}* (Sinal 50%: *{valor_entrada}*)\n\nAcesse o link abaixo para aprovar a amostra virtual e liberar o bordado nas máquinas:\n{link_aprovacao}',
    availableTags: ['{nome_cliente}', '{numero_pedido}', '{nome_matriz}', '{quantidade_pecas}', '{pontos_matriz}', '{tamanho_bordado}', '{valor_total}', '{valor_entrada}', '{link_aprovacao}']
  },
  {
    id: 'tpl_inicio_producao',
    title: '⚙️ Pedido Entrou em Produção',
    category: 'cliente',
    description: 'Informa ao cliente que suas peças entraram na linha de bordado nas máquinas',
    triggerEvent: 'em_producao',
    enabled: true,
    templateText: 'Olá *{nome_cliente}*! Ótimas notícias: o seu pedido *#{numero_pedido}* (*{quantidade_pecas}*) entrou na linha de bordado na máquina *{nome_maquina}*! 🚀\n\n🗓️ Previsão estimada de conclusão: *{previsao_entrega}*.\nTe avisaremos assim que estiver pronto para busca.',
    availableTags: ['{nome_cliente}', '{numero_pedido}', '{quantidade_pecas}', '{nome_maquina}', '{previsao_entrega}']
  },
  {
    id: 'tpl_pos_venda_nps',
    title: '⭐ Pós-Venda & Pedido de Depoimento (NPS)',
    category: 'cliente',
    description: 'Mensagem de pós-venda enviada para solicitar avaliação ou depoimento do cliente sobre o bordado',
    triggerEvent: 'pos_venda',
    enabled: true,
    templateText: 'Olá *{nome_cliente}*! Esperamos que tenha ficado incrível o resultado do bordado das suas *{quantidade_pecas}* no pedido *#{numero_pedido}*! 🧵✨\n\nPoderia nos enviar um breve comentário ou nota de 1 a 5 de como foi sua experiência com a *{nome_oficina}*?\nSua avaliação ajuda nossa oficina a crescer cada vez mais!',
    availableTags: ['{nome_cliente}', '{quantidade_pecas}', '{numero_pedido}', '{nome_oficina}']
  },
  {
    id: 'tpl_alerta_operador',
    title: '🚨 Alerta Interno de Máquina (Agulha / Peça)',
    category: 'equipe',
    description: 'Enviado para os operadores da equipe cadastrados quando há parada técnica ou peça danificada',
    triggerEvent: 'alerta_operador',
    enabled: true,
    templateText: '⚠️ *ALERTA OPERACIONAL DE BORDADO*\nO operador *{nome_operador}* reportou parada técnica no Pedido *#{numero_pedido}* (*{nome_matriz}*) na *{nome_maquina}*.\nMotivo: Verifique a máquina imediatamente no painel de bordados.',
    availableTags: ['{nome_operador}', '{numero_pedido}', '{nome_matriz}', '{nome_maquina}']
  },
  {
    id: 'tpl_cobranca_pix',
    title: '💳 Lembrete de Cobrança / Sinal PIX',
    category: 'cobranca',
    description: 'Lembrete de pagamento de entrada ou saldo restante enviado diretamente ao cliente',
    triggerEvent: 'cobranca_pix',
    enabled: true,
    templateText: 'Olá *{nome_cliente}*, para darmos andamento à programação e produção do pedido *#{numero_pedido}* (*{nome_matriz}*), lembramos do valor pendente de *{valor_entrada}*.\n\n🔑 Chave PIX: {chave_pix}\n🏦 Favorecido: {nome_oficina}\n\nApós o pagamento, por favor nos envie o comprovante por aqui. Obrigado!',
    availableTags: ['{nome_cliente}', '{numero_pedido}', '{nome_matriz}', '{valor_entrada}', '{chave_pix}', '{nome_oficina}']
  },
  {
    id: 'tpl_solicitar_imagem',
    title: '🖼️ Solicitação de Imagem / Arte do Bordado',
    category: 'cliente',
    description: 'Enviado ao cliente solicitando o envio da imagem/logo em alta resolução ou arquivo de bordado',
    triggerEvent: 'manual',
    enabled: true,
    templateText: 'Olá *{nome_cliente}*! 🖼️ Por favor, nos envie por aqui a imagem ou vetor da sua arte/logo em alta resolução (ou arquivo de bordado .DST/.PES se possuir) para iniciarmos a programação da matriz do pedido *#{numero_pedido}*. Obrigado!',
    availableTags: ['{nome_cliente}', '{numero_pedido}']
  },
  {
    id: 'tpl_confirmar_recebimento',
    title: '📦 Confirmação de Recebimento das Peças',
    category: 'cliente',
    description: 'Enviado ao cliente assim que as peças físicas dão entrada na oficina de bordados',
    triggerEvent: 'manual',
    enabled: true,
    templateText: 'Olá *{nome_cliente}*! 📦 Confirmamos que as suas *{quantidade_pecas}* do pedido *#{numero_pedido}* (*{nome_matriz}*) foram recebidas com sucesso na oficina da *{nome_oficina}* e deram entrada no sistema de produção.',
    availableTags: ['{nome_cliente}', '{quantidade_pecas}', '{numero_pedido}', '{nome_matriz}', '{nome_oficina}']
  }
];

const STORAGE_TEMPLATES_KEY = 'borda_gabi_whatsapp_templates_v1';

export function getStoredTemplates(): WhatsAppTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_TEMPLATES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* fallback */ }
  return DEFAULT_TEMPLATES;
}

export async function fetchCloudTemplates(): Promise<WhatsAppTemplate[]> {
  try {
    const { data } = await supabase
      .from('company_settings')
      .select('whatsapp_templates')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.whatsapp_templates && Array.isArray(data.whatsapp_templates) && data.whatsapp_templates.length > 0) {
      localStorage.setItem(STORAGE_TEMPLATES_KEY, JSON.stringify(data.whatsapp_templates));
      return data.whatsapp_templates as WhatsAppTemplate[];
    }
  } catch (err) {
    console.warn('[WhatsApp Templates] Erro ao buscar templates da nuvem:', err);
  }
  return getStoredTemplates();
}

export async function saveStoredTemplates(templates: WhatsAppTemplate[]): Promise<void> {
  localStorage.setItem(STORAGE_TEMPLATES_KEY, JSON.stringify(templates));

  try {
    const { data } = await supabase
      .from('company_settings')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.id) {
      await supabase
        .from('company_settings')
        .update({
          whatsapp_templates: templates,
          updated_at: new Date().toISOString()
        })
        .eq('id', data.id);
    }
  } catch (err) {
    console.warn('[WhatsApp Templates] Erro ao salvar templates na nuvem:', err);
  }
}

export async function resetStoredTemplates(): Promise<WhatsAppTemplate[]> {
  localStorage.setItem(STORAGE_TEMPLATES_KEY, JSON.stringify(DEFAULT_TEMPLATES));
  await saveStoredTemplates(DEFAULT_TEMPLATES);
  return DEFAULT_TEMPLATES;
}

/**
 * Interpola as 22 variáveis dinâmicas de bordado no modelo de texto
 */
export function formatEmbroideryTemplate(templateText: string, context: Record<string, any>): string {
  let result = templateText;

  // Substitui cada variável se presente no contexto
  EMBROIDERY_VARIABLES.forEach(item => {
    const tagKey = item.tag.replace(/[{}]/g, '');
    const val = context[tagKey] ?? context[item.tag] ?? item.example;
    result = result.replace(new RegExp(item.tag.replace(/[-[\]{}()*+?.:\\^$|#\s]/g, '\\$&'), 'g'), String(val));
  });

  return result;
}
