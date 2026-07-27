import React, { useState } from 'react';
import { useCompanySettings, TeamMember } from '../contexts/CompanySettingsContext';
import { useProfile } from '../contexts/ProfileContext';
import { 
  Palette, 
  Upload, 
  Building2, 
  Check, 
  User, 
  Save, 
  RefreshCw, 
  CreditCard, 
  QrCode, 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  FileText, 
  ShieldCheck,
  Sparkles,
  Gauge,
  Image as ImageIcon,
  Users,
  Plus,
  Trash2,
  Smartphone
} from 'lucide-react';
import { toast } from 'sonner';


const COLOR_PRESETS = [
  { name: 'Roxo Imperial', value: '#9333ea' },
  { name: 'Azul Elétrico', value: '#2563eb' },
  { name: 'Verde Esmeralda', value: '#10b981' },
  { name: 'Rosa Choque', value: '#ec4899' },
  { name: 'Laranja Flame', value: '#f97316' },
  { name: 'Vermelho Ruby', value: '#ef4444' },
  { name: 'Ciano Neon', value: '#06b6d4' },
];

export const PerfilConfig: React.FC = () => {
  const { settings, updateSettings } = useCompanySettings();
  const { role, isUnlocked, lockToProducao, customProfiles } = useProfile();

  const [systemName, setSystemName] = useState(settings.systemName);
  const [systemSubtitle, setSystemSubtitle] = useState(settings.systemSubtitle);
  const [primaryColor, setPrimaryColor] = useState(settings.primaryColor);
  const [pixKey, setPixKey] = useState(settings.pixKey || '');
  const [phone, setPhone] = useState(settings.phone || '');
  const [email, setEmail] = useState(settings.email || '');
  const [address, setAddress] = useState(settings.address || '');
  const [docNumber, setDocNumber] = useState(settings.document || '');
  const [workingHours, setWorkingHours] = useState(settings.workingHours || '');
  const [fiscalApiToken, setFiscalApiToken] = useState(settings.fiscalApiToken || '');
  const [fiscalEnvironment, setFiscalEnvironment] = useState<'homologacao' | 'producao'>(settings.fiscalEnvironment || 'homologacao');
  const [machineSpeedSpm, setMachineSpeedSpm] = useState<number>(settings.machineSpeedSpm || 800);
  const [colorChangeTimeSec, setColorChangeTimeSec] = useState<number>(settings.colorChangeTimeSec !== undefined ? settings.colorChangeTimeSec : 30);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(settings.logoUrl);

  // Gestão de Equipe & Operadores
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(settings.teamMembers || []);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberRole, setNewMemberRole] = useState(customProfiles[0]?.name || 'Operador');

  const [isSaving, setIsSaving] = useState(false);

  const handleAddMember = () => {
    if (!newMemberName.trim() || !newMemberPhone.trim()) {
      toast.error('Informe o nome e o WhatsApp do operador.');
      return;
    }
    const member: TeamMember = {
      id: String(Date.now()),
      name: newMemberName.trim(),
      phone: newMemberPhone.trim(),
      role: newMemberRole,
      receiveAlerts: true
    };
    setTeamMembers([...teamMembers, member]);
    setNewMemberName('');
    setNewMemberPhone('');
    toast.success(`Operador ${member.name} adicionado à equipe!`);
  };

  const handleRemoveMember = (id: string) => {
    setTeamMembers(teamMembers.filter(m => m.id !== id));
    toast.success('Operador removido.');
  };

  // Preview ao vivo da cor
  React.useEffect(() => {
    window.document.documentElement.style.setProperty('--brand-primary', primaryColor);
    
    // Ao sair da tela (desmontar), se não salvou, restaura a cor salva oficialmente no banco
    return () => {
      window.document.documentElement.style.setProperty('--brand-primary', settings.primaryColor);
    };
  }, [primaryColor, settings.primaryColor]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    toast.info('Atualizando configurações da empresa...', { id: 'settings-toast' });

    const success = await updateSettings(
      { 
        systemName, 
        systemSubtitle, 
        primaryColor, 
        pixKey, 
        phone, 
        email, 
        address, 
        document: docNumber, 
        workingHours,
        fiscalApiToken,
        fiscalEnvironment,
        machineSpeedSpm,
        colorChangeTimeSec,
        teamMembers
      },
      logoFile || undefined
    );

    if (success) {
      toast.success('Configurações salvas com sucesso!', { id: 'settings-toast' });
    } else {
      toast.error('Erro ao salvar configurações.', { id: 'settings-toast' });
    }
    setIsSaving(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      {/* Header com Design de Alto Nível */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-purple-900/20 via-zinc-900/60 to-black p-6 rounded-3xl border border-white/10 backdrop-blur-xl shadow-xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Sparkles className="h-3.5 w-3.5" /> Painel de Gestão da Empresa
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            Perfil & Configurações
          </h1>
          <p className="text-xs md:text-sm text-slate-600 dark:text-zinc-400">
            Estrutura organizada por temas para personalizar recebimentos, dados cadastrais, marca e permissões.
          </p>
        </div>

        {/* Botão de Salvar no Topo para Acesso Rápido */}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-3.5 rounded-2xl text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 hover:brightness-110 active:scale-95 shrink-0"
          style={{ backgroundColor: primaryColor }}
        >
          {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span>Salvar Alterações</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">

        {/* 💳 DIV / SEÇÃO 1: FORMAS DE PAGAMENTO & RECEBIMENTOS */}
        <div className="bg-white dark:bg-zinc-900/70 border border-amber-500/30 dark:border-amber-500/20 rounded-3xl p-6 md:p-8 shadow-xl backdrop-blur-xl space-y-6 relative overflow-hidden">
          {/* Efeito Glow Amber Background */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between border-b border-amber-500/20 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
                <CreditCard className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  Formas de Pagamento & PIX
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Configure os dados de cobrança direta para exibir no recebimento de pedidos.
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-flex px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold uppercase tracking-widest">
              Cobrança Instantânea
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Chave PIX */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <QrCode className="h-4 w-4" /> Chave PIX Principal da Empresa (CNPJ, E-mail, Celular ou Aleatória)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  className="w-full bg-amber-500/5 dark:bg-black/50 border border-amber-500/40 rounded-2xl pl-4 pr-12 py-3.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 font-bold tracking-wide transition-colors"
                  placeholder="Ex: 21995560196 ou contato@guacubordados.com.br"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase">
                  PIX
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-500">
                Esta chave será carregada automaticamente no Modal de Cobrança ao gerar o QR Code de pagamento dos clientes.
              </p>
            </div>
          </div>
        </div>

        {/* 🏢 DIV / SEÇÃO 2: DADOS CADASTRAIS DA EMPRESA */}
        <div className="bg-white dark:bg-zinc-900/70 border border-slate-200 dark:border-white/10 rounded-3xl p-6 md:p-8 shadow-xl backdrop-blur-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">
                  Dados da Empresa & Cadastro Comercial
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Informações exibidas nos comprovantes de venda, relatórios e cabeçalho do sistema.
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-flex px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 text-[10px] font-bold uppercase tracking-widest">
              Identificação Fiscal
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Nome da Empresa */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-purple-400" /> Nome da Empresa / Sistema
              </label>
              <input
                type="text"
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-2xl px-4 py-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 font-bold transition-colors"
                placeholder="Ex: BORDA AI"
                required
              />
            </div>

            {/* Subtítulo / Slogan */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-purple-400" /> Subtítulo / Slogan
              </label>
              <input
                type="text"
                value={systemSubtitle}
                onChange={(e) => setSystemSubtitle(e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-2xl px-4 py-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 transition-colors"
                placeholder="Ex: GESTÃO INTELIGENTE DE BORDADOS"
              />
            </div>

            {/* CNPJ / CPF */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-purple-400" /> CNPJ ou CPF do Emissor
              </label>
              <input
                type="text"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-2xl px-4 py-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 transition-colors"
                placeholder="Ex: 00.000.000/0001-00"
              />
            </div>

            {/* Telefone / WhatsApp */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-emerald-400" /> Telefone / WhatsApp Comercial
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-2xl px-4 py-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 transition-colors"
                placeholder="Ex: (21) 98624-3396"
              />
            </div>

            {/* E-mail da Empresa */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-blue-400" /> E-mail Comercial
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-2xl px-4 py-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 transition-colors"
                placeholder="Ex: contato@guacubordados.com.br"
              />
            </div>

            {/* Horário de Atendimento */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-400" /> Horário de Atendimento
              </label>
              <input
                type="text"
                value={workingHours}
                onChange={(e) => setWorkingHours(e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-2xl px-4 py-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 transition-colors"
                placeholder="Ex: Segunda à Sexta: 08h às 18h | Sábado: 08h às 12h"
              />
            </div>

            {/* Endereço Físico */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-red-400" /> Endereço Físico do Ateliê / Oficina
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-slate-50 dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-2xl px-4 py-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 transition-colors"
                placeholder="Ex: Av. Paulista, 1000 - Centro, São Paulo - SP"
              />
            </div>
          </div>
        </div>

        {/* 🖼️ DIV / SEÇÃO 3: LOGO & IDENTIDADE VISUAL */}
        <div className="bg-white dark:bg-zinc-900/70 border border-slate-200 dark:border-white/10 rounded-3xl p-6 md:p-8 shadow-xl backdrop-blur-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <ImageIcon className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">
                  Logomarca Oficial da Empresa
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Defina a imagem que será exibida no menu lateral e nos relatórios impressos.
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-flex px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-bold uppercase tracking-widest">
              Branding
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-2xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5">
            <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-300 dark:border-white/20 bg-white dark:bg-black/60 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo Preview" className="w-full h-full object-contain p-2" />
              ) : (
                <Building2 className="h-10 w-10 text-slate-400 dark:text-white/20" />
              )}
            </div>
            <div className="space-y-3 text-center sm:text-left">
              <div>
                <h3 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">Enviar Nova Imagem de Logomarca</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Formato recomendado: PNG transparente ou SVG em formato quadrado.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-xs font-bold text-white cursor-pointer transition-all shadow-md active:scale-95">
                <Upload className="h-4 w-4" /> Selecionar Arquivo
                <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
              </label>
            </div>
          </div>
        </div>

        {/* 🎨 DIV / SEÇÃO 4: COR PRINCIPAL E TEMA DO SISTEMA */}
        <div className="bg-white dark:bg-zinc-900/70 border border-slate-200 dark:border-white/10 rounded-3xl p-6 md:p-8 shadow-xl backdrop-blur-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-pink-500/10 border border-pink-500/30 flex items-center justify-center text-pink-400">
                <Palette className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">
                  Cor de Destaque & Tema do Sistema
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Escolha a cor primária global usada nos botões, seleções e destaques do ERP.
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-flex px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/30 text-pink-400 text-[10px] font-bold uppercase tracking-widest">
              Tema Global
            </span>
          </div>

          <div className="space-y-4">
            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
              Paletas de Cores Pré-Selecionadas:
            </label>
            <div className="flex flex-wrap items-center gap-3">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setPrimaryColor(color.value)}
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${
                    primaryColor === color.value ? 'ring-4 ring-purple-500/40 scale-110 shadow-lg' : 'hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                >
                  {primaryColor === color.value && <Check className="h-5 w-5 text-white stroke-[3]" />}
                </button>
              ))}

              {/* Seletor Customizado Hexadecimal */}
              <div className="flex items-center gap-3 ml-2 pl-4 border-l border-slate-300 dark:border-white/10">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-11 h-11 rounded-2xl bg-transparent cursor-pointer border-0 shadow-sm"
                />
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Código Hex</span>
                  <span className="text-xs font-mono font-bold text-slate-800 dark:text-white uppercase">{primaryColor}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 📄 DIV / SEÇÃO 5: EMISSÃO DE NOTAS FISCAIS (NFS-e / NF-e) */}
        <div className="bg-white dark:bg-zinc-900/70 border border-emerald-500/30 dark:border-emerald-500/20 rounded-3xl p-6 md:p-8 shadow-xl backdrop-blur-xl space-y-6 relative overflow-hidden">
          {/* Efeito Glow Emerald Background */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between border-b border-emerald-500/20 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  Emissão de Notas Fiscais (NFS-e / NF-e)
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Integre sua conta de emissão fiscal para gerar notas fiscais de serviço e venda direto nos pedidos.
                </p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest ${
              fiscalApiToken ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-zinc-500/10 border-zinc-500/30 text-zinc-400'
            }`}>
              {fiscalApiToken ? '🟢 Integração Ativa' : '⚪ Não Configurado'}
            </span>
          </div>

          <div className="space-y-6">
            {/* Passo 1: Instruções e Botão de Criar Conta no Emissor */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                  1. Abra ou Crie sua Conta na Plataforma Emissora
                </span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold">
                  Focus NFe / Asaas / Bling
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Para emitir notas fiscais sem custo para o BORDA AI, cadastre os dados da sua empresa e seu Certificado Digital A1 na plataforma parceira e copie sua <strong>Chave de API (Token)</strong>.
              </p>
              <a
                href="https://focusnfe.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md active:scale-95"
              >
                <span>Criar / Acessar Conta de Emissão (Focus NFe)</span>
                <FileText className="h-3.5 w-3.5" />
              </a>
            </div>

            {/* Passo 2: Token de API e Ambiente */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Token de API */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  🔑 Sua Chave de API Fiscal (Token de Produção ou Teste)
                </label>
                <input
                  type="password"
                  value={fiscalApiToken}
                  onChange={(e) => setFiscalApiToken(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-black/50 border border-emerald-500/30 rounded-2xl px-4 py-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono tracking-wider transition-colors"
                  placeholder="Cole sua Chave de API de Emissão aqui..."
                />
              </div>

              {/* Ambiente: Homologação vs Produção */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                  Ambiente de Emissão
                </label>
                <select
                  value={fiscalEnvironment}
                  onChange={(e: any) => setFiscalEnvironment(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-2xl px-4 py-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-bold transition-colors cursor-pointer"
                >
                  <option value="homologacao">🧪 Homologação (Testes)</option>
                  <option value="producao">🚀 Produção (Notas Reais)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ⚙️ DIV / SEÇÃO 6: CONFIGURAÇÃO DE MAQUINÁRIO & VELOCIDADE (SPM) */}
        <div className="bg-white dark:bg-zinc-900/70 border border-slate-200 dark:border-white/10 rounded-3xl p-6 md:p-8 shadow-xl backdrop-blur-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Gauge className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">
                  Configuração de Maquinário & Velocidade da Oficina
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Defina a velocidade média das suas bordadeiras para calcular o tempo estimado de produção exato nos orçamentos.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Presets Rápidos de Máquinas */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider block">
                ⚡ Perfis de Velocidade Rápidos (SPM - Pontos Por Minuto)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: '600 SPM', name: 'Doméstica / Entrada', spm: 600 },
                  { label: '800 SPM', name: 'Semi-Industrial', spm: 800 },
                  { label: '1000 SPM', name: 'Industrial Tajima/Barudan', spm: 1000 },
                  { label: '1200 SPM', name: 'Alta Performance', spm: 1200 },
                ].map(preset => (
                  <button
                    key={preset.spm}
                    type="button"
                    onClick={() => setMachineSpeedSpm(preset.spm)}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      machineSpeedSpm === preset.spm
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400 font-black shadow-md'
                        : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 text-slate-600 dark:text-zinc-400 hover:border-cyan-500/40'
                    }`}
                  >
                    <p className="text-xs font-black">{preset.label}</p>
                    <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">{preset.name}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Inputs Diretos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider block">
                  🪡 Velocidade Personalizada da Máquina (SPM)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={machineSpeedSpm}
                    onChange={(e) => setMachineSpeedSpm(Number(e.target.value) || 800)}
                    className="w-full bg-slate-50 dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-2xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 transition-colors"
                    placeholder="Ex: 850"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-cyan-500">
                    SPM (pts/min)
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider block">
                  ⏱️ Tempo Estimado por Troca de Cor (Segundos)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={colorChangeTimeSec}
                    onChange={(e) => setColorChangeTimeSec(Number(e.target.value) || 0)}
                    className="w-full bg-slate-50 dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-2xl px-4 py-3 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 transition-colors"
                    placeholder="Ex: 30"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-cyan-500">
                    Segundos
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 👥 SEÇÃO 8: EQUIPE & OPERADORES */}
        <div className="bg-white dark:bg-zinc-900/70 border border-slate-200 dark:border-white/10 rounded-3xl p-6 md:p-8 shadow-xl backdrop-blur-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">
                  Equipe & Operadores
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Cadastre os operadores da oficina para receber alertas via WhatsApp
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-flex px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-400 text-[10px] font-bold uppercase tracking-widest">
              Equipe
            </span>
          </div>

          {/* Add member form */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-4 space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nome</label>
              <input
                type="text"
                value={newMemberName}
                onChange={e => setNewMemberName(e.target.value)}
                placeholder="Ex: Carlos"
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 text-sm focus:ring-2 outline-none transition-all"
                style={{ focusRingColor: primaryColor } as any}
              />
            </div>
            <div className="sm:col-span-3 space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <Smartphone className="h-3 w-3" /> WhatsApp
              </label>
              <input
                type="tel"
                value={newMemberPhone}
                onChange={e => setNewMemberPhone(e.target.value)}
                placeholder="(19) 99999-9999"
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 text-sm focus:ring-2 outline-none transition-all"
              />
            </div>
            <div className="sm:col-span-3 space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Função</label>
              <select
                value={newMemberRole}
                onChange={e => setNewMemberRole(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-sm focus:ring-2 outline-none transition-all cursor-pointer"
              >
                {customProfiles.map(p => (
                  <option key={p.id} value={p.name}>
                    {p.icon} {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={handleAddMember}
                className="w-full px-4 py-3 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all"
                style={{ backgroundColor: primaryColor }}
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </button>
            </div>
          </div>

          {/* Team members list */}
          {teamMembers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-10 w-10 mx-auto mb-3 text-zinc-600" />
              <p className="text-slate-500 dark:text-zinc-500 text-sm">Nenhum membro cadastrado</p>
              <p className="text-slate-400 dark:text-zinc-600 text-xs mt-1">Adicione operadores para receber alertas da GABI via WhatsApp</p>
            </div>
          ) : (
            <div className="space-y-2">
              {teamMembers.map(member => {
                const matchedProfile = customProfiles.find(p => p.name === member.role);
                const badgeColor = matchedProfile?.color || primaryColor;
                const icon = matchedProfile?.icon || '👤';

                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10 transition-all group"
                  >
                    {/* Avatar */}
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-sm"
                      style={{ backgroundColor: `${badgeColor}33`, border: `1px solid ${badgeColor}66` }}
                    >
                      {icon}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{member.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Smartphone className="h-3 w-3 text-green-500" />
                        <span className="text-xs text-slate-500 dark:text-zinc-400">{member.phone}</span>
                      </div>
                    </div>

                    {/* Dynamic Role badge */}
                    <span
                      className="hidden sm:inline-flex px-3 py-1 rounded-lg border text-[10px] font-bold whitespace-nowrap"
                      style={{ backgroundColor: `${badgeColor}15`, borderColor: `${badgeColor}35`, color: badgeColor }}
                    >
                      {member.role}
                    </span>

                    {/* Alerts toggle */}
                    <button
                      type="button"
                      onClick={() => {
                        setTeamMembers(prev => prev.map(m =>
                          m.id === member.id ? { ...m, receiveAlerts: !m.receiveAlerts } : m
                        ));
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                        member.receiveAlerts
                          ? 'bg-green-500/10 border border-green-500/30 text-green-500'
                          : 'bg-zinc-500/10 border border-zinc-500/20 text-zinc-500'
                      }`}
                      title={member.receiveAlerts ? 'Recebendo alertas' : 'Alertas desativados'}
                    >
                      {member.receiveAlerts ? '🔔 ON' : '🔕 OFF'}
                    </button>

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.id)}
                      className="p-2 rounded-lg text-slate-400 dark:text-zinc-600 hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                      title="Remover membro"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Action Footer Flutuante / Fixo para Salvar */}
        <div className="pt-4 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto px-10 py-4 rounded-2xl text-white font-black text-sm uppercase tracking-wider transition-all shadow-xl flex items-center justify-center gap-3 disabled:opacity-50 hover:brightness-110 active:scale-95 cursor-pointer"
            style={{ backgroundColor: primaryColor }}
          >
            {isSaving ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            Salvar Todas as Configurações
          </button>
        </div>
      </form>
    </div>
  );
};
