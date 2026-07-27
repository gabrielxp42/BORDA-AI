import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
 * Sanitiza número de telefone adicionando obrigatoriamente o DDI 55 do Brasil se necessário
 */
export function formatWhatsAppNumber(phone: string): string {
  let digitsOnly = (phone || '').replace(/\D/g, '');
  if (!digitsOnly) return '';

  if (digitsOnly.startsWith('0') && digitsOnly.length > 10) {
    digitsOnly = digitsOnly.slice(1);
  }

  // Se tiver 10 ou 11 dígitos (ex: 21995560196), adiciona o DDI 55 do Brasil
  if (digitsOnly.length === 10 || digitsOnly.length === 11) {
    return `55${digitsOnly}`;
  }

  return digitsOnly;
}

/**
 * Gera link direto wa.me para abertura rápida no WhatsApp Web / Desktop
 */
export function getWhatsAppWebLink(phone: string, message: string): string {
  const cleanPhone = formatWhatsAppNumber(phone);
  const encodedText = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
}

/**
 * Recupera as credenciais da Evolution API configuradas no perfil do usuário
 */
async function getEvolutionCredentials() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('whatsapp_api_url, whatsapp_api_key, whatsapp_instance_id')
    .eq('id', user.id)
    .single();

  if (profile?.whatsapp_api_url && profile?.whatsapp_api_key) {
    return {
      apiUrl: profile.whatsapp_api_url.replace(/\/$/, ''),
      apiKey: profile.whatsapp_api_key,
      instanceId: profile.whatsapp_instance_id || `borda_${user.id.substring(0, 6)}`
    };
  }

  // Fallback: busca em admin profiles
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('whatsapp_api_url, whatsapp_api_key')
    .not('whatsapp_api_url', 'is', null)
    .not('whatsapp_api_key', 'is', null)
    .limit(1)
    .maybeSingle();

  if (adminProfile?.whatsapp_api_url && adminProfile?.whatsapp_api_key) {
    return {
      apiUrl: adminProfile.whatsapp_api_url.replace(/\/$/, ''),
      apiKey: adminProfile.whatsapp_api_key,
      instanceId: profile?.whatsapp_instance_id || `borda_${user.id.substring(0, 6)}`
    };
  }

  return null;
}

/**
 * Cria/Recupera instância da Evolution API e devolve o QR Code (via Edge Function ou Direct REST)
 */
export async function createEvolutionInstance(instanceName: string, force = false): Promise<EvolutionProxyResponse> {
  // Tentativa via Supabase Edge Function
  try {
    const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
      body: { action: 'create', instanceName, force }
    });

    if (!error && data && !data.error) {
      return data;
    }
  } catch (err) {
    console.warn('[WhatsApp Service] Edge Function whatsapp-proxy indisponível, usando fallback direto...');
  }

  // Fallback: Chamada REST direta para a Evolution API
  const creds = await getEvolutionCredentials();
  if (!creds) {
    throw new Error('Evolution API não configurada. Preencha a URL e a API Key nas Configurações.');
  }

  const { apiUrl, apiKey } = creds;
  const cleanInstance = instanceName || creds.instanceId;

  if (force) {
    await fetch(`${apiUrl}/instance/logout/${cleanInstance}`, { method: 'DELETE', headers: { apikey: apiKey } }).catch(() => {});
    await fetch(`${apiUrl}/instance/delete/${cleanInstance}`, { method: 'DELETE', headers: { apikey: apiKey } }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
  }

  const createResp = await fetch(`${apiUrl}/instance/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({
      instanceName: cleanInstance,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS'
    })
  });

  const createData = await createResp.json().catch(() => ({}));

  let resData = createData;

  if (createResp.status === 403 || createResp.status === 409 || createData.error) {
    const connResp = await fetch(`${apiUrl}/instance/connect/${cleanInstance}`, { headers: { apikey: apiKey } });
    resData = await connResp.json().catch(() => ({}));
  }

  const qr = resData?.qrcode?.base64 || resData?.base64 || resData?.code;
  const formattedQr = qr ? (qr.startsWith('data:image') ? qr : `data:image/png;base64,${qr}`) : null;

  const isConn = resData?.status === 'connected' || resData?.instance?.state === 'open' || resData?.instance?.status === 'open';

  // Grava as informações da instância no perfil do usuário no Supabase
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('profiles').update({
      whatsapp_instance_id: cleanInstance,
      whatsapp_status: isConn ? 'connected' : 'connecting',
      whatsapp_qr_cache: formattedQr
    }).eq('id', user.id);
  }

  if (formattedQr && !resData.qrcode) {
    resData.qrcode = { base64: formattedQr };
  }

  return resData;
}

/**
 * Atualiza o status da conexão da instância com a Evolution API sem reiniciar o handshake Baileys
 */
export async function checkEvolutionStatus(): Promise<EvolutionProxyResponse> {
  try {
    const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
      body: { action: 'update-status' }
    });

    if (!error && data) {
      return data;
    }
  } catch (err) {
    console.warn('[WhatsApp Service] Fallback direto para status da Evolution API...');
  }

  const creds = await getEvolutionCredentials();
  if (!creds) {
    return { connected: false, state: 'not_found' };
  }

  const { apiUrl, apiKey, instanceId } = creds;
  try {
    const resp = await fetch(`${apiUrl}/instance/connectionState/${instanceId}`, {
      headers: { apikey: apiKey }
    });

    if (!resp.ok) return { connected: false, state: 'not_found' };
    const data = await resp.json();
    const state = data?.instance?.state || data?.instance?.status;

    if (state === 'open' || state === 'CONNECTED') {
      // Atualiza o perfil no Supabase como conectado
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({
          whatsapp_status: 'connected',
          whatsapp_qr_cache: null
        }).eq('id', user.id);
      }

      return { connected: true, state: 'open' };
    }

    if (state === 'connecting' || state === 'CONNECTING') {
      // IMPORTANTE: Mantém o handshake! Não rechama /connect durante o polling para não derrubar o QR Code
      return { connected: false, state: 'connecting' };
    }

    // Apenas se o estado for fechado ('close' / 'CLOSED'), tenta solicitar um novo QR Code
    if (state === 'close' || state === 'CLOSED') {
      const connResp = await fetch(`${apiUrl}/instance/connect/${instanceId}`, { headers: { apikey: apiKey } });
      const connData = await connResp.json().catch(() => ({}));
      const b64 = connData?.qrcode?.base64 || connData?.base64 || connData?.code;

      const formattedQr = b64 ? (b64.startsWith('data:image') ? b64 : `data:image/png;base64,${b64}`) : undefined;

      if (formattedQr) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('profiles').update({
            whatsapp_status: 'connecting',
            whatsapp_qr_cache: formattedQr
          }).eq('id', user.id);
        }
      }

      return {
        connected: false,
        state: 'connecting',
        qrcode: formattedQr
      };
    }

    return { connected: false, state: (state as any) || 'unknown' };
  } catch (err) {
    return { connected: false, state: 'unknown' };
  }
}

/**
 * Remove/Desconecta a instância da Evolution API
 */
export async function deleteEvolutionInstance(): Promise<{ success: boolean }> {
  try {
    const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
      body: { action: 'delete' }
    });
    if (!error) return data || { success: true };
  } catch { /* fallback */ }

  const creds = await getEvolutionCredentials();
  if (creds) {
    await fetch(`${creds.apiUrl}/instance/logout/${creds.instanceId}`, { method: 'DELETE', headers: { apikey: creds.apiKey } }).catch(() => {});
    await fetch(`${creds.apiUrl}/instance/delete/${creds.instanceId}`, { method: 'DELETE', headers: { apikey: creds.apiKey } }).catch(() => {});
  }
  return { success: true };
}

function extractEvolutionError(data: any): string | null {
  if (!data) return 'Sem resposta do servidor WhatsApp.';
  if (data.error === true || typeof data.error === 'string') {
    return typeof data.error === 'string' ? data.error : (data.message || 'Erro reportado pela Evolution API');
  }
  if (data.status === 'ERROR' || data.status === 'close' || data.state === 'close') {
    return data.message || 'Instância do WhatsApp fechada ou desconectada.';
  }
  if (data.status === 401 || data.status === 403) {
    return 'Chave de API (API Key) não autorizada. Verifique a chave nas Configurações.';
  }
  if (data.status === 400 || data.status === 500) {
    return typeof data.message === 'string' ? data.message : (data.response?.message ? (Array.isArray(data.response.message) ? data.response.message.join(', ') : String(data.response.message)) : 'Erro no envio da mensagem.');
  }
  if (data.response && (data.response.message || data.response.error)) {
    const msg = data.response.message || data.response.error;
    return Array.isArray(msg) ? msg.join(', ') : String(msg);
  }
  return null;
}



/**
 * Envia mensagem direta de texto via Edge Function whatsapp-proxy (idêntico ao DIRECT-AI-GB)
 */
export async function sendEvolutionText(phone: string, message: string): Promise<any> {
  const cleanPhone = formatWhatsAppNumber(phone);

  let userInstanceId: string | undefined = undefined;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('whatsapp_instance_id')
        .eq('id', user.id)
        .maybeSingle();
      if (prof?.whatsapp_instance_id) {
        userInstanceId = prof.whatsapp_instance_id;
      }
    }
  } catch (e) {
    console.warn('[WhatsApp] Falha ao obter whatsapp_instance_id do perfil:', e);
  }

  const targetInstance = userInstanceId || 'borda_gabriel_0431';

  // 1. Tenta envio REST direto se houver credenciais salvas no perfil
  const creds = await getEvolutionCredentials();
  if (creds && creds.apiUrl && creds.apiKey) {
    const inst = creds.instanceId || targetInstance;
    console.log(`📲 [WhatsApp REST Direto] Enviando para ${cleanPhone} via instância [${inst}]...`);
    try {
      const resp = await fetch(`${creds.apiUrl}/message/sendText/${inst}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': creds.apiKey
        },
        body: JSON.stringify({
          number: cleanPhone,
          text: message
        })
      });

      const resData = await resp.json().catch(() => ({}));
      console.log('📲 [WhatsApp REST Direto Response]:', { status: resp.status, resData });

      if (resp.ok && (resData.key || resData.status === 'PENDING' || resData.status === 'SUCCESS' || resData.status === 'SERVER_ACK')) {
        return resData;
      }
    } catch (restErr) {
      console.warn('⚠️ [WhatsApp REST Direto Falhou]:', restErr);
    }
  }

  // 2. Fallback via Edge Function whatsapp-proxy
  console.log(`[WhatsApp Proxy] Enviando para ${cleanPhone} (Instância: ${targetInstance}):`, message);

  const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
    body: { 
      action: 'send-text', 
      phone: cleanPhone, 
      message: message,
      instanceId: targetInstance
    }
  });

  if (error) {
    console.error('[WhatsApp] Erro de comunicação com a Edge Function:', error);
    throw new Error(error.message || 'Erro de rede na Edge Function');
  }

  // Erros explícitos da Evolution API
  if (data && (data.error || data.status === 'ERROR' || data.status === 'close' || data.state === 'close')) {
    console.error('[WhatsApp] Erro retornado pela Evolution API:', data);
    const errMsg = typeof data.message === 'string'
      ? data.message
      : (Array.isArray(data.message) ? data.message.join(', ') : (data.message?.message || data.error || 'Erro ao enviar no WhatsApp.'));
    throw new Error(errMsg);
  }

  if (data && (data.key?.id || data.key || data.status === 'PENDING' || data.status === 'SERVER_ACK' || data.status === 'SUCCESS' || data.id)) {
    console.log('✅ [WhatsApp] Mensagem entregue ao socket da Evolution API com sucesso!', data);
    return data;
  }

  return data || { success: true };
}

/**
 * Envia arquivo de mídia ou PDF via Evolution API
 */
export async function sendEvolutionMedia(options: WhatsAppSendOptions): Promise<any> {
  const formattedPhone = formatWhatsAppNumber(options.phone);

  try {
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

    if (!error && data) return data;
  } catch { /* fallback */ }

  const creds = await getEvolutionCredentials();
  if (!creds) {
    throw new Error('Servidor WhatsApp não configurado.');
  }

  const resp = await fetch(`${creds.apiUrl}/message/sendMedia/${creds.instanceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: creds.apiKey },
    body: JSON.stringify({
      number: formattedPhone,
      mediaMessage: {
        mediatype: options.mediaType === 'image' ? 'image' : 'document',
        fileName: options.mediaName || 'Orcamento.pdf',
        caption: options.message,
        media: options.mediaUrl
      }
    })
  });

  return await resp.json();
}

/**
 * Trata falhas no disparo do WhatsApp exibindo alertas visuais claros com botão para parear QR Code na Central GABI ou abrir Web WhatsApp manualmente.
 */
export function handleWhatsAppDispatchError(
  err: any,
  phone: string,
  message: string,
  toastId?: string | number,
  options?: { autoOpenWeb?: boolean }
) {
  const errMsg = err?.message || String(err);
  const isDisconnected = /desconectado|disconnected|qr|offline|close|400|401/i.test(errMsg);
  const webLink = getWhatsAppWebLink(phone, message);

  if (isDisconnected) {
    toast.error('⚠️ WhatsApp (GABI) Desconectado!', {
      id: toastId,
      duration: 10000,
      description: 'Seu WhatsApp não está pareado via QR Code na Evolution API. Clique abaixo para parear e ativar disparos diretos sem abrir abas.',
      action: {
        label: '⚡ Parear WhatsApp Agora',
        onClick: () => { window.location.href = '/gabi'; }
      }
    });

    if (options?.autoOpenWeb) {
      window.open(webLink, '_blank');
    }
  } else {
    toast.error(`Falha no envio via WhatsApp: ${errMsg}`, {
      id: toastId,
      duration: 8000,
      action: {
        label: 'Abrir Web WhatsApp',
        onClick: () => { window.open(webLink, '_blank'); }
      }
    });
  }
}

