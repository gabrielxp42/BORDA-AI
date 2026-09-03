import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = "https://lyjxrfkslzrmtlefswag.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5anhyZmtzbHpybXRsZWZzd2FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3Mjc2MTIsImV4cCI6MjEwMDMwMzYxMn0.VW1MBHzW7bdkBV7GYT4yo_vDMxXgvIyMvZ4mzvtsuCY";

/**
 * O client vinha sem opções de auth, então valia o padrão da lib. Na prática o
 * usuário relatava "fica caindo, saindo, daí tem que logar de novo" — sessão
 * perdida no meio do expediente, principalmente no celular.
 *
 * As opções abaixo tornam a sessão explícita e resistente:
 *  - persistSession: guarda o token no storage do navegador
 *  - autoRefreshToken: renova antes de expirar, sem derrubar quem está usando
 *  - detectSessionInUrl: conclui o login por link/redirect
 *  - storageKey fixo: evita que uma troca de versão invalide a sessão salva
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'borda-ai-auth',
    flowType: 'pkce',
  },
  realtime: {
    // Reconexão mais tolerante: em rede móvel instável o socket cai com
    // frequência, e o padrão desistia rápido demais.
    params: { eventsPerSecond: 5 },
  },
});
