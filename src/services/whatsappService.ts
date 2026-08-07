import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  humanizeMessageText, 
  waitAntiBanJitterDelay, 
  calculateHumanTypingDelay 
} from './whatsappAntiBan';

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
export async function getEvolutionCredentials(): Promise<WhatsAppCredentials | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    // 1. Busca perfil do usuário atual
    let userProfile: any = null;
    if (user?.id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('whatsapp_api_url, whatsapp_api_key, whatsapp_instance_id')
        .eq('id', user.id)
        .maybeSingle();
      userProfile = prof;
    }

    // 2. Busca perfil master/admin que possui as credenciais e instância conectada
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('whatsapp_api_url, whatsapp_api_key, whatsapp_instance_id')
      .not('whatsapp_api_url', 'is', null)
      .not('whatsapp_api_key', 'is', null)
      .limit(1)
      .maybeSingle();

    if (localUrl && localKey) {
      return {
        apiUrl: localUrl.replace(/\/$/, ''),
        apiKey: localKey,
        instanceId: profile?.whatsapp_instance_id || defaultInstanceId
      };
    }
  } catch (e) {}

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
      const qr = data?.qrcode?.base64 || data?.base64 || data?.code;
      const formattedQr = qr ? (qr.startsWith('data:image') ? qr : `data:image/png;base64,${qr}`) : null;
      const isConn = data?.status === 'connected' || data?.instance?.state === 'open' || data?.instance?.status === 'open';
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({
          whatsapp_instance_id: instanceName,
          whatsapp_status: isConn ? 'connected' : 'connecting',
          whatsapp_qr_cache: formattedQr
        }).eq('id', user.id);
      }
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
  // 1. Tenta via Edge Function whatsapp-proxy
  try {
    const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
      body: { action: 'update-status' }
    });

    if (!error && data && (data.connected || data.state === 'open')) {
      return data;
    }
  } catch (err) {
    console.warn('[WhatsApp Service] Edge Function whatsapp-proxy não respondeu, tentando checagem direta...');
  }

  // 2. Dupla-checagem via REST direto na Evolution API com inspetor ultra-robusto
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
    
    // Inspeciona TODAS as variações possíveis de payload da Evolution API v2 (raiz, instance, status, state, connectionStatus)
    const rawState = String(
      data?.instance?.state || 
      data?.instance?.status || 
      data?.state || 
      data?.status || 
      data?.connectionStatus ||
      ''
    ).toLowerCase();

    const isConn = rawState === 'open' || rawState === 'connected';

    if (isConn) {
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

    if (rawState === 'connecting') {
      return { connected: false, state: 'connecting' };
    }

    // Apenas se o estado for fechado ('close' / 'CLOSED'), tenta solicitar um novo QR Code
    if (rawState === 'close' || rawState === 'closed') {
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
    if (!error && data) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({
          whatsapp_status: 'disconnected',
          whatsapp_qr_cache: null
        }).eq('id', user.id);
      }
      return data;
    }
  } catch { /* fallback */ }

  const creds = await getEvolutionCredentials();
  if (creds) {
    await fetch(`${creds.apiUrl}/instance/logout/${creds.instanceId}`, { method: 'DELETE', headers: { apikey: creds.apiKey } }).catch(() => {});
    await fetch(`${creds.apiUrl}/instance/delete/${creds.instanceId}`, { method: 'DELETE', headers: { apikey: creds.apiKey } }).catch(() => {});
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('profiles').update({
      whatsapp_status: 'disconnected',
      whatsapp_qr_cache: null
    }).eq('id', user.id);
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

  // 🛡️ BLINDAGEM ANTI-BANIMENTO (Simulação Humana & Anti-Hash)
  const safeMessage = humanizeMessageText(message);
  const typingDelayMs = calculateHumanTypingDelay(safeMessage);
  await waitAntiBanJitterDelay(safeMessage.length);

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

  const creds = await getEvolutionCredentials();
  const targetInstance = userInstanceId || creds?.instanceId;
  if (!targetInstance) {
    throw new Error('Instância do WhatsApp não encontrada para este usuário. Por favor, conecte seu WhatsApp nas configurações.');
  }

  // 1. Tenta envio REST direto com parâmetro de presença "composing" (digitando...)
  if (creds && creds.apiUrl && creds.apiKey) {
    const inst = targetInstance;
    console.log(`📲 [WhatsApp REST Direto Anti-Ban] Enviando para ${cleanPhone} via [${inst}] (Digitação: ${typingDelayMs}ms)...`);
    try {
      const resp = await fetch(`${creds.apiUrl}/message/sendText/${inst}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': creds.apiKey
        },
        body: JSON.stringify({
          number: cleanPhone,
          text: safeMessage,
          delay: typingDelayMs,
          options: {
            delay: typingDelayMs,
            presence: 'composing'
          }
        })
      });

      const resData = await resp.json().catch(() => ({}));
      console.log('📲 [WhatsApp REST Direto Response]:', { status: resp.status, resData });

      if (resp.ok && (resData.key || resData.id || resData.messageId || resData.status === 'PENDING' || resData.status === 'SUCCESS' || resData.status === 'SERVER_ACK')) {
        return resData;
      }

      if (resData.error || resData.message || resData.status === 'ERROR' || resData.status === 'close' || resData.state === 'close') {
        const errMsg = typeof resData.message === 'string'
          ? resData.message
          : (Array.isArray(resData.message) ? resData.message.join(', ') : (resData.message?.message || resData.error || `Erro Evolution API (${resp.status})`));
        throw new Error(errMsg);
      }
    } catch (restErr) {
      if (restErr instanceof Error && !restErr.message.includes('fetch')) {
        throw restErr; // Re-throw erros lógicos de conexão/rejeição da Evolution
      }
      console.warn('⚠️ [WhatsApp REST Direto Falhou]:', restErr);
    }
  }

  // 2. Fallback via Edge Function whatsapp-proxy com presença
  console.log(`[WhatsApp Proxy Anti-Ban] Enviando para ${cleanPhone} (Instância: ${targetInstance}, Digitação: ${typingDelayMs}ms):`, safeMessage);

  const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
    body: { 
      action: 'send-text', 
      phone: cleanPhone, 
      message: safeMessage,
      instanceId: targetInstance,
      options: {
        delay: typingDelayMs,
        presence: 'composing'
      }
    }
  });

  if (error) {
    console.error('[WhatsApp] Erro de comunicação com a Edge Function:', error);
    throw new Error(error.message || 'Falha na conexão com o servidor de mensagens WhatsApp.');
  }

  // Erros explícitos da Evolution API
  if (data && (data.error || data.status === 'ERROR' || data.status === 'close' || data.state === 'close' || data.status === 'DISCONNECTED')) {
    console.error('[WhatsApp] Erro retornado pela Evolution API:', data);
    const errMsg = typeof data.message === 'string'
      ? data.message
      : (Array.isArray(data.message) ? data.message.join(', ') : (data.message?.message || data.error || 'WhatsApp Desconectado ou Erro no Servidor.'));
    throw new Error(errMsg);
  }

  if (data && (data.key?.id || data.key || data.id || data.messageId || data.status === 'PENDING' || data.status === 'SERVER_ACK' || data.status === 'SUCCESS')) {
    console.log('✅ [WhatsApp] Mensagem entregue ao socket da Evolution API com sucesso!', data);
    return data;
  }

  throw new Error(data?.message || 'Servidor WhatsApp não confirmou a entrega da mensagem. Verifique a conexão com a Evolution API.');
}

/**
 * Converte Base64 para Uint8Array e faz upload temporário para o Supabase Storage
 * obtendo uma URL assinada (Signed URL) idêntica à estratégia do DIRECT-AI-GB.
 * Retorna a URL e o caminho temporário para a faxina/exclusão do arquivo.
 */
export async function uploadPdfToStorageAndGetUrl(base64Data: string, fileName: string): Promise<{ url: string; tempPath: string } | null> {
  try {
    const rawBase64 = base64Data.replace(/^data:application\/pdf;base64,/, '');
    const binaryString = window.atob(rawBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const tempPath = `temp_${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('order-pdfs')
      .upload(tempPath, bytes, { contentType: 'application/pdf', upsert: true });

    if (uploadError) {
      console.warn('[WhatsApp Storage Upload Warning]:', uploadError);
      return null;
    }

    const { data: signedData } = await supabase.storage
      .from('order-pdfs')
      .createSignedUrl(tempPath, 3600);

    let finalUrl = signedData?.signedUrl;

    if (!finalUrl) {
      const { data: publicData } = supabase.storage
        .from('order-pdfs')
        .getPublicUrl(tempPath);
      finalUrl = publicData?.publicUrl;
    }

    return finalUrl ? { url: finalUrl, tempPath } : null;
  } catch (err) {
    console.warn('[WhatsApp Storage Error]:', err);
    return null;
  }
}

/**
 * Envia arquivo de mídia ou PDF via Evolution API
 */
export async function sendEvolutionMedia(options: WhatsAppSendOptions): Promise<any> {
  const formattedPhone = formatWhatsAppNumber(options.phone);

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

  const creds = await getEvolutionCredentials();
  const targetInstance = userInstanceId || creds?.instanceId;
  if (!targetInstance) {
    throw new Error('Instância do WhatsApp não encontrada. Conecte seu WhatsApp nas configurações.');
  }

  // Tenta gerar Signed URL via Supabase Storage (igual ao DIRECT-AI-GB) se for base64
  let finalMediaUrl = options.mediaUrl;
  let tempPathToClean: string | null = null;

  if (options.mediaUrl.startsWith('data:') || options.mediaUrl.length > 500) {
    const uploadResult = await uploadPdfToStorageAndGetUrl(options.mediaUrl, options.mediaName || 'Ficha_Pedido.pdf');
    if (uploadResult) {
      finalMediaUrl = uploadResult.url;
      tempPathToClean = uploadResult.tempPath;
      console.log('📄 [WhatsApp PDF] Signed URL gerada com sucesso:', finalMediaUrl);
    }
  }

  const scheduleCleanup = () => {
    if (tempPathToClean) {
      const pathToRemove = tempPathToClean;
      tempPathToClean = null;
      setTimeout(() => {
        supabase.storage
          .from('order-pdfs')
          .remove([pathToRemove])
          .then(() => console.log(`🧹 [WhatsApp Storage] PDF temporário limpo com sucesso: ${pathToRemove}`))
          .catch(() => {});
      }, 10000); // 10 segundos para dar tempo do servidor baixar o arquivo
    }
  };

  try {
    // 1. Tenta envio via REST direto se houver credenciais
    if (creds && creds.apiUrl && creds.apiKey) {
      const inst = targetInstance;
      try {
        const payload = {
          number: formattedPhone,
          media: finalMediaUrl,
          mediatype: options.mediaType === 'image' ? 'image' : 'document',
          fileName: options.mediaName || 'Orcamento.pdf',
          caption: options.message,
          mediaMessage: {
            mediatype: options.mediaType === 'image' ? 'image' : 'document',
            fileName: options.mediaName || 'Orcamento.pdf',
            caption: options.message,
            media: finalMediaUrl
          }
        };

        console.log('📲 [WhatsApp Media REST Direct Payload]:', { url: `${creds.apiUrl}/message/sendMedia/${inst}`, payload });

        const resp = await fetch(`${creds.apiUrl}/message/sendMedia/${inst}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: creds.apiKey },
          body: JSON.stringify(payload)
        });

        const resData = await resp.json().catch(() => ({}));
        console.log('📲 [WhatsApp Media REST Direct Response]:', { status: resp.status, resData });

        if (resp.ok && (resData.key || resData.id || resData.messageId || resData.status === 'PENDING' || resData.status === 'SUCCESS' || resData.status === 'SERVER_ACK')) {
          scheduleCleanup();
          return resData;
        }

        if (!resp.ok || resData.error || resData.status === 'ERROR' || resData.status === 'close' || resData.state === 'close') {
          const errMsg = typeof resData.message === 'string'
            ? resData.message
            : (Array.isArray(resData.message) ? resData.message.join(', ') : (resData.message?.message || resData.error || `Erro ao enviar PDF via REST: ${resp.status} ${resp.statusText}`));
          throw new Error(errMsg);
        }
      } catch (err) {
        if (err instanceof Error && !err.message.includes('fetch')) {
          scheduleCleanup();
          throw err;
        }
        console.warn('[WhatsApp] Envio REST direto de mídia falhou, tentando proxy...', err);
      }
    }

    // 2. Fallback via Edge Function
    const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
      body: {
        action: 'send-media',
        phone: formattedPhone,
        message: options.message,
        mediaUrl: finalMediaUrl,
        mediaBase64: options.mediaUrl,
        mediaType: options.mediaType || 'document',
        mediaName: options.mediaName || 'Orcamento.pdf',
        instanceId: targetInstance
      }
    });

    if (error) {
      throw new Error(error.message || 'Falha de comunicação com o proxy WhatsApp.');
    }

    if (data) {
      if (data.error || data.status === 'ERROR' || data.status === 'close' || data.state === 'close') {
        const errMsg = typeof data.message === 'string'
          ? data.message
          : (Array.isArray(data.message) ? data.message.join(', ') : (data.message?.message || data.error || 'Erro ao enviar mídia via WhatsApp.'));
        throw new Error(errMsg);
      }

      if (data.key || data.id || data.messageId || data.status === 'PENDING' || data.status === 'SUCCESS' || data.status === 'SERVER_ACK') {
        scheduleCleanup();
        return data;
      }
    }

    throw new Error('Servidor WhatsApp não confirmou o envio do PDF. Verifique se o seu celular está conectado ao WhatsApp nas configurações.');
  } finally {
    scheduleCleanup();
  }
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
    toast.error('⚠️ Mensagem não enviada! WhatsApp Desconectado.', {
      id: toastId,
      duration: 10000,
      description: 'Não foi possível enviar a mensagem diretamente porque seu WhatsApp não está pareado com o sistema. Para fazer os envios automáticos, você precisa ler o QR Code de conexão.',
      action: {
        label: '⚡ Conectar / Ler QR Code',
        onClick: () => { window.location.href = '/configuracoes'; }
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

