import React, { useState, useEffect } from 'react';
import { Server, Key, Save, CheckCircle2, ShieldAlert, Globe, TestTube } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export const EvolutionServerConfigCard: React.FC = () => {
  const { profile } = useAuth();
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (profile) {
      setApiUrl(profile.whatsapp_api_url || '');
      setApiKey(profile.whatsapp_api_key || '');
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);
    setTestResult(null);

    try {
      if (profile?.id) {
        const { error } = await supabase.from('profiles').update({
          whatsapp_api_url: apiUrl.trim(),
          whatsapp_api_key: apiKey.trim(),
        }).eq('id', profile.id);

        if (error) throw error;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err: any) {
      setTestResult({ success: false, message: 'Erro ao salvar no banco: ' + (err.message || 'Erro desconhecido') });
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setLoading(true);
    setTestResult(null);
    try {
      const cleanUrl = apiUrl.replace(/\/$/, '');
      if (!cleanUrl || !apiKey) {
        setTestResult({ success: false, message: 'Preencha a URL e a API Key antes de testar.' });
        return;
      }

      const res = await fetch(`${cleanUrl}/instance/fetchInstances`, {
        headers: { apikey: apiKey }
      });

      if (res.ok) {
        setTestResult({ success: true, message: 'Servidor Evolution API respondeu com sucesso (HTTP 200 OK)!' });
      } else {
        setTestResult({ success: false, message: `Erro ao conectar no servidor. Código HTTP: ${res.status}` });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: 'Falha de rede ou CORS ao conectar no servidor Evolution API.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel p-6 md:p-8 rounded-3xl border border-white/10 space-y-6">
      <div className="flex items-center gap-4 border-b border-white/10 pb-6">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
          <Server className="h-7 w-7" />
        </div>
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            Painel Admin
          </span>
          <h3 className="text-xl font-black tracking-tight text-white mt-1">
            Configurações do Servidor Evolution API
          </h3>
          <p className="text-xs text-zinc-400">
            Cadastre a URL pública e a Master Key do seu servidor v2 da Evolution API.
          </p>
        </div>
      </div>

      {saved && (
        <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Configurações salvas no perfil com sucesso!
        </div>
      )}

      {testResult && (
        <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
          testResult.success 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' 
            : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
        }`}>
          {testResult.success ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" /> : <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />}
          <span>{testResult.message}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-300 flex items-center gap-2">
            <Globe className="h-4 w-4 text-indigo-400" /> Evolution API Server URL:
          </label>
          <input
            type="url"
            placeholder="https://evo.meudominio.com.br"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-medium text-white focus:outline-none focus:border-indigo-500 transition-all placeholder:text-zinc-600"
            required
          />
          <p className="text-[11px] text-zinc-500">
            Exemplo: <code>https://whatsapp.meuateliors.com.br</code>
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-300 flex items-center gap-2">
            <Key className="h-4 w-4 text-indigo-400" /> Global API Key (Master Token):
          </label>
          <input
            type="password"
            placeholder="Sua Global API Key da Evolution"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-medium text-white focus:outline-none focus:border-indigo-500 transition-all placeholder:text-zinc-600"
            required
          />
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-300 font-bold text-xs hover:bg-white/10 transition-all"
          >
            <TestTube className="h-4 w-4" /> Testar Conexão Direta
          </button>

          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-xs shadow-lg shadow-indigo-500/25 hover:brightness-110 transition-all"
          >
            <Save className="h-4 w-4" /> Salvar Configurações do Servidor
          </button>
        </div>
      </form>
    </div>
  );
};
