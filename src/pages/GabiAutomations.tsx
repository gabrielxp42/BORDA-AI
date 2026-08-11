import React, { useState } from 'react';
import {
  Sparkles, MessageSquare, Zap, Smartphone, Save, RotateCcw,
  Check, Play, Copy, RefreshCw, Send, Tag, Layers, HelpCircle,
  FileText, ShieldCheck, CheckCircle2, ChevronRight, Lock
} from 'lucide-react';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import {
  WhatsAppTemplate, EMBROIDERY_VARIABLES, getStoredTemplates, fetchCloudTemplates,
  saveStoredTemplates, resetStoredTemplates, formatEmbroideryTemplate
} from '@/services/whatsappTemplatesService';
import { sendEvolutionText, formatWhatsAppNumber } from '@/services/whatsappService';
import { getAccountHealthStatus } from '@/services/whatsappAntiBan';
import { toast } from 'sonner';

export const GabiAutomations: React.FC = () => {
  const { settings } = useCompanySettings();
  const pc = settings.primaryColor || '#ef4444';

  const [activeTab, setActiveTab] = useState<'templates' | 'triggers' | 'connection'>('templates');
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>(getStoredTemplates);

  React.useEffect(() => {
    fetchCloudTemplates().then(cloudTpls => {
      setTemplates(cloudTpls);
    });
  }, []);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(templates[0]?.id || '');
  const [categoryFilter, setCategoryFilter] = useState<'todos' | 'cliente' | 'equipe' | 'cobranca'>('todos');

  // Test state
  const [testPhone, setTestPhone] = useState<string>(settings.phone || '');
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0];

  const handleUpdateTemplateText = (newText: string) => {
    const updated = templates.map(t => {
      if (t.id === selectedTemplateId) {
        return { ...t, templateText: newText };
      }
      return t;
    });
    setTemplates(updated);
  };

  const handleToggleTemplate = (id: string) => {
    const updated = templates.map(t => {
      if (t.id === id) {
        return { ...t, enabled: !t.enabled };
      }
      return t;
    });
    setTemplates(updated);
    saveStoredTemplates(updated);
    toast.success('Regra de disparo atualizada!');
  };

  const handleSaveAllTemplates = () => {
    saveStoredTemplates(templates);
    toast.success('Todos os modelos de mensagens salvos com sucesso!');
  };

  const handleResetDefaults = async () => {
    if (window.confirm('Deseja restaurar os modelos de mensagens padrão da oficina?')) {
      const reseted = await resetStoredTemplates();
      setTemplates(reseted);
      toast.info('Modelos restaurados para o padrão.');
    }
  };

  const handleInsertTag = (tag: string) => {
    if (!selectedTemplate) return;
    const current = selectedTemplate.templateText;
    handleUpdateTemplateText(current + ' ' + tag);
  };

  const handleSendTestMessage = async () => {
    if (!testPhone.trim()) {
      toast.error('Informe um número de WhatsApp para teste.');
      return;
    }

    const cleanPhone = formatWhatsAppNumber(testPhone);
    const sampleContext = {
      nome_cliente: 'Gabriel Lima',
      empresa_cliente: 'Oficina Bordados',
      numero_pedido: '#104',
      nome_matriz: 'Logo Shell Corp',
      pontos_matriz: '18.500 pts',
      quantidade_pecas: '150 peças',
      tamanho_bordado: '100mm x 85mm',
      quantidade_cores: '4 cores',
      bastidor_tipo: 'Bastidor 15x15',
      tempo_estimado: '42 min',
      formato_arquivo: '.DST',
      status_pedido: 'Pronto para Retirada',
      previsao_entrega: 'Hoje às 17h',
      link_aprovacao: 'https://borda.ai/aprovar/104',
      link_pdf_pedido: 'https://borda.ai/pdf/104',
      valor_unitario: 'R$ 4,50',
      valor_total: 'R$ 675,00',
      valor_entrada: 'R$ 337,50',
      valor_saldo: 'R$ 337,50',
      chave_pix: settings.pixKey || '19999999999',
      status_pagamento: 'Sinal Pago 50%',
      nome_oficina: settings.systemName,
      endereco_oficina: settings.address || 'Rua Principal, 100',
      nome_operador: 'Carlos Bordador',
      nome_maquina: 'Barudan #02',
    };

    const formattedMessage = formatEmbroideryTemplate(selectedTemplate.templateText, sampleContext);

    setIsSendingTest(true);
    try {
      await sendEvolutionText(cleanPhone, formattedMessage);
      toast.success(`Mensagem de teste disparada para ${cleanPhone}!`);
    } catch (err: any) {
      toast.error(`Falha no envio de teste: ${err.message || 'Verifique a Evolution API'}`);
    } finally {
      setIsSendingTest(false);
    }
  };

  const filteredTemplates = templates.filter(t => categoryFilter === 'todos' || t.category === categoryFilter);

  // Sample context for live WhatsApp preview bubble
  const sampleContext = {
    nome_cliente: 'Gabriel Lima',
    empresa_cliente: 'Oficina Bordados',
    numero_pedido: '#104',
    nome_matriz: 'Logo Shell Corp',
    pontos_matriz: '18.500 pts',
    quantidade_pecas: '150 peças',
    tamanho_bordado: '100mm x 85mm',
    quantidade_cores: '4 cores',
    bastidor_tipo: 'Bastidor 15x15',
    tempo_estimado: '42 min',
    formato_arquivo: '.DST',
    status_pedido: 'Pronto para Retirada',
    previsao_entrega: 'Hoje às 17h',
    link_aprovacao: 'https://borda.ai/aprovar/104',
    link_pdf_pedido: 'https://borda.ai/pdf/104',
    valor_unitario: 'R$ 4,50',
    valor_total: 'R$ 675,00',
    valor_entrada: 'R$ 337,50',
    valor_saldo: 'R$ 337,50',
    chave_pix: settings.pixKey || '19999999999',
    status_pagamento: 'Sinal Pago 50%',
    nome_oficina: settings.systemName,
    endereco_oficina: settings.address || 'Rua Principal, 100',
    nome_operador: 'Carlos Bordador',
    nome_maquina: 'Barudan #02',
  };

  const previewText = selectedTemplate
    ? formatEmbroideryTemplate(selectedTemplate.templateText, sampleContext)
    : '';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-300">
      {/* ─── HEADER PRINCIPAL ─── */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-purple-500/20"
            style={{ background: `linear-gradient(135deg, ${pc} 0%, #8b5cf6 100%)` }}
          >
            <Sparkles className="h-7 w-7 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                GABI IA — Central de Automações & WhatsApp
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 text-[10px] font-black uppercase tracking-wider">
                Evolution API
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl">
              Gerencie modelos de mensagens inteligentes com 22 tags dinâmicas de bordados e gatilhos automáticos de disparo.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-300 text-xs font-bold transition-all flex items-center gap-2 border border-slate-200 dark:border-white/10"
          >
            <RotateCcw className="h-4 w-4" /> Restaurar Padrões
          </button>
          <button
            type="button"
            onClick={handleSaveAllTemplates}
            className="px-6 py-2.5 rounded-xl text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-lg cursor-pointer"
            style={{ backgroundColor: pc }}
          >
            <Save className="h-4 w-4" /> Salvar Tudo
          </button>
        </div>
      </div>

      {/* ─── ESCUDO ANTI-BANIMENTO (HEALTH SHIELD CARD) ─── */}
      {(() => {
        const health = getAccountHealthStatus();
        return (
          <div className="p-5 rounded-3xl bg-gradient-to-r from-emerald-900/30 via-teal-900/20 to-purple-900/30 border border-emerald-500/30 shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-white">Escudo Anti-Banimento WhatsApp</h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase tracking-wider border border-emerald-500/30">
                    {health.healthLabel}
                  </span>
                </div>
                <p className="text-xs text-zinc-300 mt-0.5">
                  Digitação humana simulada ({health.recommendedDelayMs}ms) • Anti-Hash Spintax • Jitter Queue • <strong>{health.messagesToday} envios hoje</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-2xl border border-white/10 text-xs">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-emerald-300 font-bold">100% Protegido</span>
            </div>
          </div>
        );
      })()}

      {/* ─── ABAS DE NAVEGAÇÃO ─── */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/10 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all ${
            activeTab === 'templates'
              ? 'bg-purple-500/15 border border-purple-500/40 text-purple-400 shadow-md'
              : 'text-slate-500 dark:text-zinc-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <MessageSquare className="h-4 w-4" /> 🤖 Modelos & Templates ({templates.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('triggers')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all ${
            activeTab === 'triggers'
              ? 'bg-purple-500/15 border border-purple-500/40 text-purple-400 shadow-md'
              : 'text-slate-500 dark:text-zinc-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Zap className="h-4 w-4 text-amber-400" /> ⚡ Regras de Automação ({templates.filter(t => t.enabled).length} ativas)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('connection')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all ${
            activeTab === 'connection'
              ? 'bg-purple-500/15 border border-purple-500/40 text-purple-400 shadow-md'
              : 'text-slate-500 dark:text-zinc-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Smartphone className="h-4 w-4 text-green-400" /> 📲 Testador ao Vivo
        </button>
      </div>

      {/* ─── ABA 1: MODELOS & TEMPLATES ─── */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Coluna Esquerda: Lista de Templates */}
          <div className="lg:col-span-5 space-y-4">
            {/* Filtros de Categoria */}
            <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-100 dark:bg-zinc-900/80 border border-slate-200 dark:border-white/10 text-xs font-bold">
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'cliente', label: 'Clientes' },
                { id: 'equipe', label: 'Equipe' },
                { id: 'cobranca', label: 'Cobrança' },
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setCategoryFilter(f.id as any)}
                  className={`flex-1 py-1.5 px-3 rounded-xl transition-all ${
                    categoryFilter === f.id
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Lista Cards */}
            <div className="space-y-3">
              {filteredTemplates.map(t => {
                const isSelected = t.id === selectedTemplateId;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTemplateId(t.id)}
                    className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-2 ${
                      isSelected
                        ? 'bg-purple-500/10 border-purple-500/50 shadow-lg ring-1 ring-purple-500/30'
                        : 'bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-white/10 hover:border-purple-500/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t.title}</h3>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleToggleTemplate(t.id);
                        }}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          t.enabled
                            ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                            : 'bg-zinc-500/10 text-zinc-500 border border-zinc-500/20'
                        }`}
                      >
                        {t.enabled ? 'Ativo' : 'Inativo'}
                      </button>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-2">{t.description}</p>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-lg border border-purple-500/20">
                        {t.category.toUpperCase()}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500 flex items-center gap-1">
                        <Tag className="h-3 w-3" /> {t.availableTags.length} tags
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Coluna Direita: Editor & Preview WhatsApp ao Vivo */}
          <div className="lg:col-span-7 space-y-6">
            {selectedTemplate && (
              <div className="bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xl backdrop-blur-xl space-y-6">
                
                {/* Header do Editor */}
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                      {selectedTemplate.title}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      {selectedTemplate.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleSendTestMessage}
                    disabled={isSendingTest}
                    className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
                  >
                    {isSendingTest ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Testar Envio
                  </button>
                </div>

                {/* 🏷️ CHIP BAR: 22 Variáveis Dinâmicas de Bordado */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-widest flex items-center justify-between">
                    <span>Clique para Inserir Tag Dinâmica de Bordado ({EMBROIDERY_VARIABLES.length} disponíveis)</span>
                    <span className="text-purple-400">Variáveis Reais BORDA AI</span>
                  </label>

                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 rounded-2xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5">
                    {EMBROIDERY_VARIABLES.map(v => (
                      <button
                        key={v.tag}
                        type="button"
                        onClick={() => handleInsertTag(v.tag)}
                        className="px-2.5 py-1 rounded-xl bg-white dark:bg-white/10 hover:bg-purple-500/20 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-purple-300 hover:text-purple-300 text-[11px] font-semibold transition-all flex items-center gap-1 active:scale-95 shadow-sm"
                        title={`${v.label} (Exemplo: ${v.example})`}
                      >
                        <Tag className="h-3 w-3 text-purple-400" />
                        <span>{v.tag}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 📝 Textarea de Edição do Modelo */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-widest">
                    Texto do Modelo (Suporta *negrito*, _itálico_ e emojis)
                  </label>
                  <textarea
                    rows={6}
                    value={selectedTemplate.templateText}
                    onChange={e => handleUpdateTemplateText(e.target.value)}
                    className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 text-sm font-mono focus:ring-2 focus:ring-purple-500 outline-none leading-relaxed"
                  />
                </div>

                {/* 📱 SIMULADOR DE BALÃO WHATSAPP AO VIVO */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                    <Smartphone className="h-3.5 w-3.5 text-green-500" /> Preview ao Vivo no Balão do WhatsApp
                  </label>

                  <div className="p-5 rounded-3xl bg-[#0b141a] border border-white/10 shadow-2xl relative overflow-hidden">
                    {/* Background Pattern de WhatsApp Chat */}
                    <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#22c55e_1px,transparent_1px)] [background-size:16px_16px]" />

                    {/* Balão do Chat (Estilo Balão Verde de Envio do WhatsApp) */}
                    <div className="max-w-[85%] ml-auto bg-[#005c4b] text-white p-3.5 rounded-2xl rounded-tr-none shadow-md text-xs sm:text-sm font-sans whitespace-pre-wrap leading-relaxed relative border border-emerald-600/30">
                      {previewText}

                      <div className="flex items-center justify-end gap-1 text-[9px] text-emerald-200/70 pt-2 font-medium">
                        <span>14:30</span>
                        <CheckCircle2 className="h-3 w-3 text-cyan-400" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Salvar */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveAllTemplates}
                    className="px-6 py-2.5 rounded-xl text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-md cursor-pointer"
                    style={{ backgroundColor: pc }}
                  >
                    <Save className="h-4 w-4" /> Salvar Modelo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── ABA 2: REGRAS DE AUTOMAÇÃO (GATILHOS) ─── */}
      {activeTab === 'triggers' && (
        <div className="bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-white/10 rounded-3xl p-6 md:p-8 shadow-xl backdrop-blur-xl space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-400" /> Regras de Disparo Automático
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Escolha quais eventos do BORDA AI disparam mensagens automáticas para o cliente ou para a equipe no WhatsApp.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map(t => (
              <div
                key={t.id}
                className="p-5 rounded-2xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 flex items-start justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t.title}</h3>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      {t.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">{t.description}</p>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleTemplate(t.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    t.enabled
                      ? 'bg-green-500/20 border border-green-500/40 text-green-400'
                      : 'bg-zinc-500/10 border border-zinc-500/20 text-zinc-500'
                  }`}
                >
                  {t.enabled ? '⚡ Ativo' : '🔒 Desativado'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── ABA 3: CONEXÃO & TESTADOR AO VIVO ─── */}
      {activeTab === 'connection' && (
        <div className="bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-white/10 rounded-3xl p-6 md:p-8 shadow-xl backdrop-blur-xl space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-green-400" /> Disparador de Teste & Conexão Evolution API
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Simule um envio de mensagem no seu próprio WhatsApp para validar a substituição das tags de bordado.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-widest">
                Número do WhatsApp para Teste
              </label>
              <input
                type="tel"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                placeholder="(19) 99999-9999"
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleSendTestMessage}
              disabled={isSendingTest}
              className="w-full px-8 py-3.5 rounded-2xl text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-xl cursor-pointer"
              style={{ backgroundColor: pc }}
            >
              {isSendingTest ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Disparar Mensagem de Teste no WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
