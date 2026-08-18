import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
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
 * Resolve a instância do WhatsApp do USUÁRIO LOGADO — e só dele.
 *
 * Regra de ouro: cobranças, faturas e avisos saem sempre do WhatsApp de quem
 * está usando o sistema. Nunca da instância de outro usuário, mesmo que o
 * servidor Evolution e a API key sejam compartilhados pela empresa. Misturar
 * isso faz o cliente receber mensagem do número errado.
 */
export async function resolveUserInstance(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) {
    throw new Error('Sessão expirada. Entre novamente para enviar mensagens.');
  }

  const { data: prof } = await supabase
    .from('profiles')
    .select('whatsapp_instance_id')
    .eq('id', user.id)
    .maybeSingle();

  const instancia = prof?.whatsapp_instance_id
    || `borda_${user.id.replace(/-/g, '').substring(0, 10)}`;

  if (!instancia) {
    throw new Error('Seu WhatsApp não está conectado. Leia o QR Code em Configurações.');
  }

  console.log(`[WhatsApp] Instância do usuário logado: ${instancia}`);
  return instancia;
}

export interface WhatsAppCredentials {
  apiUrl: string;
  apiKey: string;
  instanceId: string;
}

/**
 * Recupera as credenciais da Evolution API, na ordem: perfil do usuário,
 * configurações da empresa, perfil admin e por fim o cache local.
 *
 * Sem isso o envio direto por REST nunca acontece e tudo depende da Edge
 * Function — que é justamente o caminho que não confirmava o envio do PDF.
 */
export async function getEvolutionCredentials(): Promise<WhatsAppCredentials | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    // 1. Perfil do usuário atual
    let userProfile: any = null;
    if (user?.id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('whatsapp_api_url, whatsapp_api_key, whatsapp_instance_id')
        .eq('id', user.id)
        .maybeSingle();
      userProfile = prof;
    }

    const defaultInstanceId = user?.id
      ? `borda_${user.id.replace(/-/g, '').substring(0, 10)}`
      : '';
    const instanceId = userProfile?.whatsapp_instance_id || defaultInstanceId;

    if (userProfile?.whatsapp_api_url && userProfile?.whatsapp_api_key) {
      return {
        apiUrl: String(userProfile.whatsapp_api_url).replace(/\/$/, ''),
        apiKey: userProfile.whatsapp_api_key,
        instanceId,
      };
    }

    // 2. Configurações da empresa (tabela global)
    try {
      const { data: comp } = await supabase
        .from('company_settings')
        .select('whatsapp_api_url, whatsapp_api_key')
        .maybeSingle();

      if ((comp as any)?.whatsapp_api_url && (comp as any)?.whatsapp_api_key) {
        return {
          apiUrl: String((comp as any).whatsapp_api_url).replace(/\/$/, ''),
          apiKey: (comp as any).whatsapp_api_key,
          instanceId,
        };
      }
    } catch (e) {
      console.warn('[WhatsApp Credentials] company_settings indisponível:', e);
    }

    // 3. Perfil admin que já tenha as credenciais preenchidas
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('whatsapp_api_url, whatsapp_api_key, whatsapp_instance_id')
      .not('whatsapp_api_url', 'is', null)
      .not('whatsapp_api_key', 'is', null)
      .limit(1)
      .maybeSingle();

    if (adminProfile?.whatsapp_api_url && adminProfile?.whatsapp_api_key) {
      return {
        apiUrl: String(adminProfile.whatsapp_api_url).replace(/\/$/, ''),
        apiKey: adminProfile.whatsapp_api_key,
        instanceId,
      };
    }

    // 4. Cache local
    const localUrl = localStorage.getItem('borda_whatsapp_api_url');
    const localKey = localStorage.getItem('borda_whatsapp_api_key');
    if (localUrl && localKey) {
      return {
        apiUrl: localUrl.replace(/\/$/, ''),
        apiKey: localKey,
        instanceId,
      };
    }
  } catch (e) {
    console.warn('[WhatsApp Credentials] Falha ao recuperar credenciais:', e);
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

    return { connected: false, state: (rawState as any) || 'unknown' };
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

  // A instância vem SEMPRE do usuário logado — nunca de outro perfil.
  const targetInstance = await resolveUserInstance();
  const creds = await getEvolutionCredentials();

  // 1. Tenta envio REST direto com parâmetro de presença/delay oficial da Evolution API v2
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
          delay: typingDelayMs
        })
      });

      const resData = await resp.json().catch(() => ({}));
      console.log('📲 [WhatsApp REST Direto Response]:', { status: resp.status, resData });

      if (resp.ok && (resData.key || resData.id || resData.messageId || resData.status === 'PENDING' || resData.status === 'SUCCESS' || resData.status === 'SERVER_ACK')) {
        return resData;
      }

      // Trata erros de status HTTP (!resp.ok) ou erro retornado pela API
      if (!resp.ok || resData.error || resData.message || resData.status === 'ERROR' || resData.status === 'close') {
        let errMsg = '';
        if (resData?.response?.message) {
          errMsg = Array.isArray(resData.response.message) ? resData.response.message.join(', ') : String(resData.response.message);
        } else if (resData?.message) {
          errMsg = Array.isArray(resData.message) ? resData.message.join(', ') : (typeof resData.message === 'object' ? JSON.stringify(resData.message) : String(resData.message));
        } else if (resData?.error) {
          errMsg = typeof resData.error === 'string' ? resData.error : JSON.stringify(resData.error);
        } else {
          errMsg = `Conexão rejeitada pela Evolution API (Status ${resp.status})`;
        }

        // Mapeamento de mensagens técnicas em português claro para o usuário
        if (errMsg.includes('number must be') || errMsg.includes('invalid') || errMsg.includes('exists')) {
          errMsg = `Número de WhatsApp inválido ou sem conta ativa (${cleanPhone}).`;
        } else if (errMsg.includes('Session closed') || errMsg.includes('close') || errMsg.includes('not connected')) {
          errMsg = `Sessão do WhatsApp desconectada. Abra a página de Configurações para ler o QR Code novamente.`;
        }

        throw new Error(errMsg);
      }
    } catch (restErr) {
      if (restErr instanceof Error && !restErr.message.includes('fetch')) {
        throw restErr; // Re-throw erro amigável já formatado
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
 * Envia arquivo de mídia ou PDF via Evolution API (Suporta tanto objeto quanto argumentos posicionais)
 */
export async function sendEvolutionMedia(
  optionsOrPhone: WhatsAppSendOptions | string,
  mediaUrlParam?: string,
  fileNameParam?: string,
  captionParam?: string,
  mediaTypeParam?: 'image' | 'document' | 'pdf'
): Promise<any> {
  let options: WhatsAppSendOptions;
  if (typeof optionsOrPhone === 'string') {
    options = {
      phone: optionsOrPhone,
      mediaUrl: mediaUrlParam,
      mediaName: fileNameParam,
      message: captionParam || '',
      mediaType: mediaTypeParam || 'document'
    };
  } else {
    options = optionsOrPhone;
  }

  const formattedPhone = formatWhatsAppNumber(options.phone);

  // A instância vem SEMPRE do usuário logado — nunca de outro perfil.
  const targetInstance = await resolveUserInstance();
  const creds = await getEvolutionCredentials();

  const isImage = options.mediaType === 'image';
  const fileName = options.mediaName || (isImage ? 'imagem.jpg' : 'Orcamento.pdf');
  const mimetype = isImage ? 'image/jpeg' : 'application/pdf';

  // Tenta gerar Signed URL via Supabase Storage se for base64.
  let finalMediaUrl = options.mediaUrl || '';
  let tempPathToClean: string | null = null;

  if (finalMediaUrl.startsWith('data:') || finalMediaUrl.length > 500) {
    const uploadResult = await uploadPdfToStorageAndGetUrl(finalMediaUrl, fileName);
    if (uploadResult) {
      finalMediaUrl = uploadResult.url;
      tempPathToClean = uploadResult.tempPath;
      console.log('📄 [WhatsApp PDF] Signed URL gerada com sucesso:', finalMediaUrl);
    } else {
      // Sem Storage (ou falha na permissão do Bucket), cai para base64 puro
      if (finalMediaUrl.startsWith('data:')) {
        finalMediaUrl = finalMediaUrl.split(',')[1] || '';
      }
    }
  }

  if (!finalMediaUrl) {
    throw new Error('Arquivo PDF não foi gerado corretamente. Tente novamente.');
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
      }, 60000); // 60s: o servidor da Evolution precisa baixar o arquivo antes de sumir
    }
  };

  let lastApiMessage = '';

  try {
    // 1. Tenta envio via REST direto se houver credenciais
    if (creds && creds.apiUrl && creds.apiKey) {
      const inst = targetInstance;
      try {
        // Payload no formato plano da Evolution API v2 — o mesmo que o envio de
        // texto usa e que funciona. Antes ia junto um bloco `mediaMessage`
        // aninhado (formato v1); com os dois no mesmo corpo a v2 rejeita.
        const payload = {
          number: formattedPhone,
          media: finalMediaUrl,
          mediatype: isImage ? 'image' : 'document',
          mimetype,
          fileName,
          caption: options.message
        };

        console.log('📲 [WhatsApp Media REST Direct Payload]:', { url: `${creds.apiUrl}/message/sendMedia/${inst}`, payload });

        const resp = await fetch(`${creds.apiUrl}/message/sendMedia/${inst}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: creds.apiKey },
          body: JSON.stringify(payload)
        });

        const resData = await resp.json().catch(() => ({}));
        console.log('📲 [WhatsApp Media REST Direct Response]:', { status: resp.status, resData });

        // Aceita qualquer 2xx sem erro explícito. Exigir key/id/messageId era o
        // que fazia um envio bem-sucedido cair no "não confirmou o envio".
        if (resp.ok && !resData?.error && resData?.status !== 'ERROR') {
          scheduleCleanup();
          return resData;
        }

        lastApiMessage = extractEvolutionError(resData)
          || `Evolution API respondeu ${resp.status} ${resp.statusText}.`;
      } catch (err: any) {
        console.warn('[WhatsApp] Envio REST direto de mídia falhou, tentando proxy...', err);
        lastApiMessage = err?.message || lastApiMessage;
      }
    }

    // 2. Fallback via Edge Function
    const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
      body: {
        action: 'send-media',
        phone: formattedPhone,
        message: options.message,
        mediaUrl: finalMediaUrl,
        media: finalMediaUrl,
        mediaBase64: options.mediaUrl,
        mimetype,
        mediaType: isImage ? 'image' : 'document',
        mediaName: fileName,
        instanceId: targetInstance
      }
    });

    if (error) {
      lastApiMessage = error.message || lastApiMessage;
    } else if (data && !data.error && data.status !== 'ERROR' && data.state !== 'close') {
      scheduleCleanup();
      return data;
    } else if (data) {
      lastApiMessage = extractEvolutionError(data) || lastApiMessage;
    }

    // Chegou aqui: nem o REST direto nem o proxy confirmaram. Mostra o erro real
    // da API em vez do genérico "verifique se o celular está conectado", que
    // acusava desconexão mesmo com o WhatsApp pareado.
    throw new Error(
      lastApiMessage
        ? `Falha ao enviar o PDF: ${lastApiMessage}`
        : 'Não foi possível enviar o PDF pelo servidor WhatsApp. Tente novamente em instantes.'
    );
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

/**
 * Motor de Disparo Automático da Gabi Secretária AI para Lembretes de Vencimento de Parcelas.
 * Verifica parcelas pendentes no Supabase e dispara WhatsApp para clientes e para a diretoria.
 */
export async function processGabiInstallmentReminders(): Promise<{ sentCount: number }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { sentCount: 0 };

    // 1. Busca todas as transações de parcelas pendentes no Supabase
    const { data: txs, error } = await supabase
      .from('financial_transactions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .not('due_date', 'is', null);

    if (error || !txs || txs.length === 0) return { sentCount: 0 };

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayObj = parseISO(todayStr);
    let sentCount = 0;

    // Busca credenciais/configurações globais
    const { data: settings } = await supabase
      .from('company_settings')
      .select('system_name, pix_key, owner_phone')
      .maybeSingle();

    const systemName = settings?.system_name || 'GUAÇU BORDADOS';
    const pixKey = settings?.pix_key || '';
    const ownerPhone = settings?.owner_phone || '';

    for (const tx of txs) {
      if (!tx.notes || !tx.due_date) continue;

      let meta: any = {};
      try {
        meta = typeof tx.notes === 'string' ? JSON.parse(tx.notes) : tx.notes;
      } catch (e) {
        continue;
      }

      // Se a automação não estiver ativada nesta parcela, ignora
      if (!meta.autoRemindDue || !meta.clientPhone) continue;

      const dueDateObj = parseISO(tx.due_date);
      const daysDiff = differenceInCalendarDays(dueDateObj, todayObj);

      const timing = meta.reminderTiming || '3_days_before';
      const remindedDates: string[] = Array.isArray(meta.reminded_dates) ? meta.reminded_dates : [];

      // Verifica se o disparo deve acontecer hoje
      let shouldSendToday = false;

      if (timing === '3_days_before' && daysDiff === 3) {
        shouldSendToday = true;
      } else if (timing === '1_day_before' && daysDiff === 1) {
        shouldSendToday = true;
      } else if (timing === 'on_due_date' && daysDiff === 0) {
        shouldSendToday = true;
      } else if (timing === 'both_before_and_on_due' && (daysDiff === 3 || daysDiff === 0)) {
        shouldSendToday = true;
      }

      // Já foi disparado hoje? Evita spam duplo!
      if (shouldSendToday && !remindedDates.includes(todayStr)) {
        const clientName = meta.clientName || 'Cliente';
        const instIdx = meta.installmentIndex || 1;
        const totalInst = meta.totalInstallments || 1;
        const formattedDueDate = format(dueDateObj, 'dd/MM/yyyy');
        const formattedAmount = Number(tx.amount).toFixed(2);

        const dueLabel = daysDiff === 0 ? 'VENCE HOJE!' : `vence em ${daysDiff} dia(s) (${formattedDueDate})`;

        // 1. WhatsApp para o Cliente
        if (meta.notifyClientOnDue !== false) {
          const clientMsg = `⏰ *LEMBRETE DE PARCELA — ${systemName}*\n\n` +
            `Olá *${clientName}*! Tudo bem? Aqui é a *Gabi*, secretária da oficina.\n\n` +
            `Passando para lembrar da sua parcela *${instIdx}/${totalInst}* do acordo que *${dueLabel}*.\n\n` +
            `💰 *Valor:* R$ ${formattedAmount}\n` +
            `📅 *Vencimento:* ${formattedDueDate}\n` +
            `${pixKey ? `🔑 *Chave PIX para pagamento:* ${pixKey}\n` : ''}\n` +
            `Qualquer dúvida estamos à disposição!`;

          await sendEvolutionText(meta.clientPhone, clientMsg).catch(err => {
            console.warn('[Gabi Reminders] Falha ao enviar lembrete pro cliente:', err);
          });
        }

        // 2. WhatsApp para o Chefe
        if (meta.notifyOwnerOnDue !== false && ownerPhone) {
          const ownerMsg = `👑 *LEMBRETE DE PARCELA (GABI AI)*\n\n` +
            `A Parcela *${instIdx}/${totalInst}* do cliente *${clientName}* (R$ ${formattedAmount}) *${dueLabel}*.\n\n` +
            `A Gabi já disparou o lembrete para o cliente no WhatsApp.`;

          await sendEvolutionText(ownerPhone, ownerMsg).catch(err => {
            console.warn('[Gabi Reminders] Falha ao enviar cópia pro chefe:', err);
          });
        }

        // 3. Atualiza o registro no Supabase com a data de disparo para não repeti-la
        remindedDates.push(todayStr);
        const updatedMeta = { ...meta, reminded_dates: remindedDates };

        await supabase
          .from('financial_transactions')
          .update({ notes: JSON.stringify(updatedMeta) })
          .eq('id', tx.id);

        sentCount++;
      }
    }

    return { sentCount };
  } catch (err) {
    console.error('[Gabi Reminders Engine Error]:', err);
    return { sentCount: 0 };
  }
}

