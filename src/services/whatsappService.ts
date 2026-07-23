import { supabase } from '@/integrations/supabase/client';

export interface WhatsAppSendOptions {
  phone: string;
  message: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'document' | 'pdf';
  mediaName?: string;
}

export interface EvolutionProxyResponse {
  connected?: boolean;
  state?: 'open' | 'connecting' | 'close' | 'not_found' | 'unknown';
  qrcode?: {
    base64?: string;
    count?: number;
  } | string;
  instance?: {
    state?: string;
    status?: string;
  };
  status?: string;
  error?: boolean | string;
  message?: string;
}

/**
 * Sanitiza número de telefone para formato aceito pelo WhatsApp (DDI 55 + DDD + Número)
 */
export function formatWhatsAppNumber(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, '');
  if (!digitsOnly) return '';
  // Adiciona código do país BR (55) se não fornecido
  if (digitsOnly.length === 10 || digitsOnly.length === 11) {
    return `55${digitsOnly}`;
  }
  return digitsOnly;
}

/**
 * Gera link direto wa.me para abertura rápida no WhatsApp Web / Desktop
 */
export function getWhatsAppWebLink(phone: string, message: string): string {
  const formattedPhone = formatWhatsAppNumber(phone);
  const encodedText = encodeURIComponent(message);
  return `https://wa.me/${formattedPhone}?text=${encodedText}`;
}

/**
 * Cria/Recupera instância da Evolution API e devolve o QR Code
 */
export async function createEvolutionInstance(instanceName: string, force = false): Promise<EvolutionProxyResponse> {
  const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
    body: { action: 'create', instanceName, force }
  });

  if (error) throw new Error(error.message || 'Erro ao comunicar com o servidor WhatsApp');
  return data;
}

/**
 * Atualiza o status da conexão da instância com a Evolution API
 */
export async function checkEvolutionStatus(): Promise<EvolutionProxyResponse> {
  const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
    body: { action: 'update-status' }
  });

  if (error) throw new Error(error.message || 'Falha ao consultar status da conexão');
  return data;
}

/**
 * Remove/Desconecta a instância da Evolution API
 */
export async function deleteEvolutionInstance(): Promise<{ success: boolean }> {
  const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
    body: { action: 'delete' }
  });

  if (error) throw new Error(error.message || 'Falha ao desconectar estampa');
  return data || { success: true };
}

/**
 * Envia mensagem direta de texto via Evolution API
 */
export async function sendEvolutionText(phone: string, message: string): Promise<any> {
  const formattedPhone = formatWhatsAppNumber(phone);
  const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
    body: {
      action: 'send-text',
      phone: formattedPhone,
      message
    }
  });

  if (error) throw new Error(error.message || 'Erro ao enviar mensagem pelo WhatsApp');
  return data;
}

/**
 * Envia arquivo de mídia ou PDF via Evolution API
 */
export async function sendEvolutionMedia(options: WhatsAppSendOptions): Promise<any> {
  const formattedPhone = formatWhatsAppNumber(options.phone);
  const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
    body: {
      action: 'send-media',
      phone: formattedPhone,
      message: options.message,
      mediaUrl: options.mediaUrl,
      mediaType: options.mediaType || 'document',
      mediaName: options.mediaName || 'Orcamento.pdf'
    }
  });

  if (error) throw new Error(error.message || 'Erro ao enviar arquivo pelo WhatsApp');
  return data;
}
