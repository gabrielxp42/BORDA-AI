/**
 * MÓDULO DE BLINDAGEM ANTI-BANIMENTO WHATSAPP (BORDA AI)
 * 
 * Este serviço implementa técnicas avançadas de engenharia reversa de comportamento humano
 * para reduzir a quase ZERO o risco de banimento da conta do WhatsApp ao usar a Evolution API.
 */

// Interface do Status de Saúde da Conta
export interface AccountHealthInfo {
  messagesToday: number;
  healthLevel: 'safe' | 'warning' | 'high_risk';
  healthLabel: string;
  recommendedDelayMs: number;
  shieldActive: boolean;
}

const STORAGE_DAILY_KEY = 'borda_wa_anti_ban_daily_tracker';

/**
 * 1. GERADOR ANTI-HASH & SPINTAX DINÂMICO
 * O algoritmo anti-spam do WhatsApp gera hashes das mensagens. Mensagens idênticas enviadas
 * em curto intervalo acionam o filtro de spam do Meta.
 * Esta função aplica variações invisíveis e micro-sinônimos para tornar CADA mensagem 100% ÚNICA.
 */
export function humanizeMessageText(originalText: string): string {
  if (!originalText) return originalText;

  let text = originalText;

  // Variantes de Saudação (se contiver "Olá ")
  const greetings = ['Olá', 'Oi', 'Opa, olá', 'Olá, tudo bem?'];
  const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
  text = text.replace(/^Olá\b/i, randomGreeting);

  // Variantes de Encerramento (se contiver "Qualquer dúvida")
  const closings = [
    'Qualquer dúvida estamos à disposição!',
    'Qualquer dúvida, pode nos chamar por aqui!',
    'Estamos à disposição para qualquer dúvida!',
    'Se precisar de algo, só nos avisar por aqui!',
    'Ficamos à disposição!'
  ];
  const randomClosing = closings[Math.floor(Math.random() * closings.length)];
  text = text.replace(/Qualquer dúvida estamos à disposição!/gi, randomClosing);

  // Adiciona Caracteres Invisíveis (Zero-Width Space \u200B) em posições aleatórias
  // Isso altera a assinatura SHA256 do texto no WhatsApp sem mudar o visual para o cliente!
  const zwspCount = Math.floor(Math.random() * 3) + 1;
  const zwspString = '\u200B'.repeat(zwspCount);
  
  // Anexa um micro-token de rastreio anti-hash no final
  const now = new Date();
  const timeToken = `\u200B\n\n_${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}_`;

  return text + zwspString + timeToken;
}

/**
 * 2. CÁLCULO DE DIGITAÇÃO HUMANA (TYPING DELAY)
 * Calcula um tempo realista de digitação humana com base no tamanho do texto.
 * Exemplo: Texto de 100 caracteres = ~2.5 a 3.5 segundos de digitação.
 */
export function calculateHumanTypingDelay(text: string, baseDelayBonus: number = 0): number {
  const charCount = text?.length || 50;
  // Média de ~40ms por caractere (simulando teclado celular) + variação aleatória de 500ms
  const calculated = Math.min(4500, Math.max(1800, charCount * 35)) + Math.floor(Math.random() * 800);
  return calculated + baseDelayBonus;
}

/**
 * 3. RASTREADOR DE MENSAGENS DIÁRIAS & MONITOR DE SAÚDE
 */
export function getDailyMessageTracker(): { date: string; count: number } {
  try {
    const raw = localStorage.getItem(STORAGE_DAILY_KEY);
    const today = new Date().toISOString().split('T')[0];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.date === today) {
        return parsed;
      }
    }
    return { date: today, count: 0 };
  } catch {
    return { date: new Date().toISOString().split('T')[0], count: 0 };
  }
}

export function incrementDailyMessageTracker(): number {
  const current = getDailyMessageTracker();
  const updated = { date: current.date, count: current.count + 1 };
  try {
    localStorage.setItem(STORAGE_DAILY_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
  return updated.count;
}

export function getAccountHealthStatus(): AccountHealthInfo {
  const tracker = getDailyMessageTracker();
  const count = tracker.count;

  if (count < 40) {
    return {
      messagesToday: count,
      healthLevel: 'safe',
      healthLabel: 'Proteção Máxima 🛡️ (Conta Fria)',
      recommendedDelayMs: 2000,
      shieldActive: true
    };
  } else if (count < 90) {
    return {
      messagesToday: count,
      healthLevel: 'warning',
      healthLabel: 'Atenção ⚠️ (Volume Moderado)',
      recommendedDelayMs: 3500,
      shieldActive: true
    };
  } else {
    return {
      messagesToday: count,
      healthLevel: 'high_risk',
      healthLabel: 'Modo Blindagem Crítica 🔴 (Volume Alto)',
      recommendedDelayMs: 5500,
      shieldActive: true
    };
  }
}

/**
 * 4. GERENCIADOR DE FILA COM JITTER (ESPAÇAMENTO ENTRE MENSAGENS)
 * Garante que disparos sequenciais tenham pelo menos X segundos de intervalo.
 */
let lastDispatchTimestamp = 0;

export async function waitAntiBanJitterDelay(textLength: number = 100): Promise<number> {
  const health = getAccountHealthStatus();
  const now = Date.now();
  const minInterval = health.recommendedDelayMs;
  const elapsed = now - lastDispatchTimestamp;

  let delayToWait = 0;
  if (elapsed < minInterval) {
    delayToWait = minInterval - elapsed;
  }

  // Adiciona variação aleatória (jitter) de 500ms a 1500ms
  const jitter = Math.floor(Math.random() * 1000) + 500;
  const totalWait = delayToWait + jitter;

  if (totalWait > 0) {
    console.log(`🛡️ [Blindagem Anti-Ban] Aguardando ${totalWait}ms de pausa humana antes do envio...`);
    await new Promise(resolve => setTimeout(resolve, totalWait));
  }

  lastDispatchTimestamp = Date.now();
  incrementDailyMessageTracker();

  return totalWait;
}
