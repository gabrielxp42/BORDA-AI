import React, { useState, useEffect, useRef } from 'react';
import { Cloud, CloudUpload, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { FinancialTransaction } from '@/types/stockTypes';

type SyncPhase = 'detecting' | 'uploading' | 'success' | 'error' | 'idle';

interface SyncStats {
  total: number;
  uploaded: number;
  skipped: number;
  errors: number;
}

/**
 * CloudSyncModal — Modal automático e bonito que detecta dados locais
 * (localStorage) e faz upload automático para o Supabase Cloud.
 * 
 * Aparece automaticamente ao logar quando há dados financeiros
 * ainda não sincronizados com a nuvem.
 */
export const CloudSyncModal: React.FC = () => {
  const [phase, setPhase] = React.useState<SyncPhase>('idle');
  const [stats, setStats] = React.useState<SyncStats>({ total: 0, uploaded: 0, skipped: 0, errors: 0 });
  const [progress, setProgress] = React.useState(0);
  const [visible, setVisible] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState('');
  const hasRun = React.useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const checkAndSync = async () => {
      try {
        // 1. Check if user is logged in
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id;
        if (!userId) return;

        // 2. Check if there are local financial transactions to migrate
        const localRaw = localStorage.getItem('borda_financial_transactions');
        const alreadyMigrated = localStorage.getItem('borda_fin_migrated_to_cloud');

        if (!localRaw || alreadyMigrated === 'true') return;

        let localTxs: FinancialTransaction[] = [];
        try {
          localTxs = JSON.parse(localRaw);
        } catch {
          return;
        }

        if (!Array.isArray(localTxs) || localTxs.length === 0) return;

        // 3. We have data to sync — show the modal!
        setPhase('detecting');
        setVisible(true);
        setStatusMessage(`Encontramos ${localTxs.length} lançamento(s) financeiro(s) neste dispositivo...`);
        setStats(prev => ({ ...prev, total: localTxs.length }));

        // Wait 2s for user to see the detection message
        await sleep(2000);

        // 4. Fetch existing cloud transactions to avoid duplicates
        setPhase('uploading');
        setStatusMessage('Conectando com o Supabase Cloud...');
        setProgress(5);

        const { data: cloudTxs } = await supabase
          .from('financial_transactions')
          .select('id')
          .eq('user_id', userId);

        const existingIds = new Set((cloudTxs || []).map((t: any) => t.id));
        const toMigrate = localTxs.filter(t => !existingIds.has(t.id));
        const skipped = localTxs.length - toMigrate.length;

        setStats(prev => ({ ...prev, skipped }));

        if (toMigrate.length === 0) {
          // All already synced
          localStorage.setItem('borda_fin_migrated_to_cloud', 'true');
          setProgress(100);
          setPhase('success');
          setStatusMessage('Todos os dados já estavam na nuvem! ✨');
          await sleep(3000);
          setVisible(false);
          return;
        }

        setStatusMessage(`Enviando ${toMigrate.length} lançamento(s) para a nuvem...`);
        setProgress(10);

        // 5. Upload in batches of 10 for visual progress
        const batchSize = 10;
        let uploaded = 0;
        let errors = 0;

        for (let i = 0; i < toMigrate.length; i += batchSize) {
          const batch = toMigrate.slice(i, i + batchSize);
          const rows = batch.map(t => ({
            id: t.id,
            user_id: userId,
            type: t.type,
            amount: t.amount,
            description: t.description,
            category: t.category,
            payment_method: t.payment_method || 'other',
            date: t.date || t.created_at,
            expense_type: t.expense_type || null,
            due_date: t.due_date || null,
            status: t.status || 'paid',
            order_id: t.order_id || null,
            notes: t.notes || null,
            created_at: t.created_at,
          }));

          // Upsert idempotente: se o lançamento já existe na nuvem (mesmo id),
          // ele é ignorado em vez de estourar 409 e re-tentar a migração para sempre.
          const { error } = await supabase
            .from('financial_transactions')
            .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });

          if (error) {
            console.error('[CloudSync] Falha ao migrar lote de lançamentos:', error);
            errors += batch.length;
          } else {
            uploaded += batch.length;
          }

          const pct = 10 + Math.round(((i + batch.length) / toMigrate.length) * 85);
          setProgress(pct);
          setStats({ total: localTxs.length, uploaded, skipped, errors });
          setStatusMessage(`Enviando... ${uploaded} de ${toMigrate.length}`);

          // Small delay for visual feedback
          await sleep(300);
        }

        // 6. Done!
        setProgress(100);
        if (errors === 0) {
          localStorage.setItem('borda_fin_migrated_to_cloud', 'true');
          setPhase('success');
          setStatusMessage(`${uploaded} lançamento(s) sincronizado(s) com sucesso! ☁️`);
        } else {
          setPhase('error');
          setStatusMessage(`${uploaded} sincronizados, ${errors} com erro. Tente novamente mais tarde.`);
        }

        // Auto-close after 4s on success
        if (errors === 0) {
          await sleep(4000);
          setVisible(false);
        }

      } catch (err) {
        console.error('CloudSyncModal error:', err);
        setPhase('error');
        setStatusMessage('Erro inesperado ao sincronizar. Tente recarregar a página.');
      }
    };

    checkAndSync();
  }, []);

  if (!visible) return null;

  return (
    // Sincronização é tarefa de fundo: aparece como cartão discreto no canto,
    // sem escurecer a tela nem bloquear o que o usuário está fazendo.
    <div className="fixed bottom-4 right-4 z-[200] w-[min(20rem,calc(100vw-2rem))] pointer-events-none animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="pointer-events-auto relative rounded-2xl border border-white/10 bg-[#0f0f1a]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
        
        {/* Animated background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div 
            className="absolute -top-20 -left-20 w-24 h-24 rounded-full opacity-20 blur-3xl"
            style={{
              background: phase === 'success' 
                ? 'radial-gradient(circle, #10b981, transparent)' 
                : phase === 'error'
                ? 'radial-gradient(circle, #ef4444, transparent)'
                : 'radial-gradient(circle, #8b5cf6, transparent)',
              animation: 'pulse 3s ease-in-out infinite',
            }}
          />
          <div 
            className="absolute -bottom-20 -right-20 w-24 h-24 rounded-full opacity-15 blur-3xl"
            style={{
              background: phase === 'success' 
                ? 'radial-gradient(circle, #06b6d4, transparent)' 
                : phase === 'error'
                ? 'radial-gradient(circle, #f59e0b, transparent)'
                : 'radial-gradient(circle, #3b82f6, transparent)',
              animation: 'pulse 3s ease-in-out infinite 1.5s',
            }}
          />
        </div>

        <div className="relative p-4 space-y-3">
          
          {/* Icon */}
          <div className="flex justify-center">
            <div className={`
              h-11 w-11 rounded-2xl flex items-center justify-center
              transition-all duration-700 ease-out
              ${phase === 'detecting' ? 'bg-purple-500/20 border-2 border-purple-500/30' : ''}
              ${phase === 'uploading' ? 'bg-blue-500/20 border-2 border-blue-500/30' : ''}
              ${phase === 'success' ? 'bg-emerald-500/20 border-2 border-emerald-500/30 scale-110' : ''}
              ${phase === 'error' ? 'bg-red-500/20 border-2 border-red-500/30' : ''}
            `}>
              {phase === 'detecting' && (
                <Cloud className="h-5 w-5 text-purple-400 animate-bounce" />
              )}
              {phase === 'uploading' && (
                <CloudUpload className="h-5 w-5 text-blue-400" style={{ animation: 'bounce 1s ease-in-out infinite' }} />
              )}
              {phase === 'success' && (
                <Check className="h-5 w-5 text-emerald-400" style={{ animation: 'ping 0.5s ease-out' }} />
              )}
              {phase === 'error' && (
                <AlertTriangle className="h-5 w-5 text-red-400" />
              )}
            </div>
          </div>

          {/* Title */}
          <div className="text-center space-y-2">
            <h3 className="text-xl font-black text-white">
              {phase === 'detecting' && '🔍 Dados Locais Detectados'}
              {phase === 'uploading' && '☁️ Enviando para a Nuvem'}
              {phase === 'success' && '✅ Sincronização Completa!'}
              {phase === 'error' && '⚠️ Erro na Sincronização'}
            </h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              {statusMessage}
            </p>
          </div>

          {/* Progress Bar */}
          {(phase === 'uploading' || phase === 'success') && (
            <div className="space-y-2">
              <div className="h-3 bg-white/5 rounded-full overflow-hidden border border-white/10">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    phase === 'success' 
                      ? 'bg-gradient-to-r from-emerald-500 to-cyan-400' 
                      : 'bg-gradient-to-r from-purple-500 via-blue-500 to-cyan-400'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                <span>{progress}%</span>
                <span>{stats.uploaded} / {stats.total - stats.skipped} enviados</span>
              </div>
            </div>
          )}

          {/* Stats */}
          {(phase === 'success' || phase === 'error') && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 text-center">
                <div className="text-lg font-black text-emerald-400">{stats.uploaded}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/60">Enviados</div>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 text-center">
                <div className="text-lg font-black text-blue-400">{stats.skipped}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-blue-300/60">Já existiam</div>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-center">
                <div className="text-lg font-black text-red-400">{stats.errors}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-red-300/60">Erros</div>
              </div>
            </div>
          )}

          {/* Spinner for detecting */}
          {phase === 'detecting' && (
            <div className="flex justify-center">
              <Loader2 className="h-6 w-6 text-purple-400 animate-spin" />
            </div>
          )}

          {/* Close button for error/success */}
          {(phase === 'success' || phase === 'error') && (
            <button
              onClick={() => setVisible(false)}
              className={`w-full py-3 rounded-2xl font-black text-sm text-white transition-all active:scale-[0.98] ${
                phase === 'success'
                  ? 'bg-gradient-to-r from-emerald-600 to-cyan-500 hover:brightness-110'
                  : 'bg-gradient-to-r from-red-600 to-amber-600 hover:brightness-110'
              }`}
            >
              {phase === 'success' ? '🚀 Pronto! Fechar' : '🔄 Fechar e Tentar Depois'}
            </button>
          )}

          {/* Auto-close notice */}
          {phase === 'uploading' && (
            <p className="text-center text-[10px] text-zinc-600 font-medium">
              Não feche esta página. A sincronização é automática.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
