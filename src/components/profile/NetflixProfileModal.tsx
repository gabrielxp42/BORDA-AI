import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Crown, Scissors, KeyRound, Lock, Unlock, X, Check, ShieldCheck,
  Sparkles, Delete, RotateCcw, Settings, Plus, Trash2, Edit3, Shield,
  Eye, LayoutDashboard, ShoppingBag, Calculator, Layers, Boxes, FileSpreadsheet,
  Users, Cpu, MessageCircle, ChevronRight, Save, ToggleLeft, ToggleRight, DollarSign
} from 'lucide-react';
import { useProfile, CustomProfile, ProfilePermissions, CHEFE_PERMISSIONS, PRODUCAO_PERMISSIONS } from '@/contexts/ProfileContext';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { toast } from 'sonner';

type ModalStep = 'select' | 'pin_input' | 'create_profile' | 'edit_permissions';

const EMOJI_OPTIONS = ['🧵', '✂️', '📦', '🔧', '💼', '👷', '🎨', '📋', '👕', '⚡', '🎯', '🚀', '⭐', '🛡️'];

const COLOR_PRESETS = [
  { name: 'Red', hex: '#ef4444', gradient: 'from-red-600 to-pink-600' },
  { name: 'Cyan', hex: '#06b6d4', gradient: 'from-cyan-500 to-teal-400' },
  { name: 'Purple', hex: '#8b5cf6', gradient: 'from-purple-600 to-indigo-600' },
  { name: 'Emerald', hex: '#10b981', gradient: 'from-emerald-500 to-green-400' },
  { name: 'Amber', hex: '#f59e0b', gradient: 'from-amber-500 to-orange-400' },
  { name: 'Rose', hex: '#f43f5e', gradient: 'from-rose-500 to-pink-500' },
];

const ROUTE_LABELS: { key: keyof ProfilePermissions['routes']; label: string; icon: React.ReactNode }[] = [
  { key: 'dashboard', label: 'Painel Geral', icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: 'pedidos', label: 'Pedidos & Produção', icon: <ShoppingBag className="h-4 w-4" /> },
  { key: 'calculadora', label: 'Fazer Orçamento', icon: <Calculator className="h-4 w-4" /> },
  { key: 'matrizes', label: 'Biblioteca Matrizes', icon: <Layers className="h-4 w-4" /> },
  { key: 'estoque', label: 'Estoque Insumos', icon: <Boxes className="h-4 w-4" /> },
  { key: 'faturamento', label: 'Faturamento', icon: <FileSpreadsheet className="h-4 w-4" /> },
  { key: 'clientes', label: 'Clientes & Empresas', icon: <Users className="h-4 w-4" /> },
  { key: 'maquinas', label: 'Bordadeiras & Máquinas', icon: <Cpu className="h-4 w-4" /> },
  { key: 'configuracoes', label: 'Tabela de Preços', icon: <Settings className="h-4 w-4" /> },
  { key: 'perfil', label: 'Perfil & Ajustes', icon: <ShieldCheck className="h-4 w-4" /> },
];

const FEATURE_LABELS: { key: keyof Omit<ProfilePermissions, 'routes'>; label: string; description: string; icon: React.ReactNode }[] = [
  { key: 'canSeeFinancials', label: 'Ver Valores Financeiros', description: 'Exibe faturamento, preços totais e lucros nos pedidos', icon: <DollarSign className="h-4 w-4" /> },
  { key: 'canEditOrders', label: 'Criar & Editar Pedidos', description: 'Permite alterar status e criar novos orçamentos', icon: <Edit3 className="h-4 w-4" /> },
  { key: 'canManageClients', label: 'Gerenciar Clientes', description: 'Adicionar, editar e remover cadastro de clientes', icon: <Users className="h-4 w-4" /> },
  { key: 'canManageStock', label: 'Gerenciar Estoque', description: 'Alterar quantidade de insumos, linhas e agulhas', icon: <Boxes className="h-4 w-4" /> },
  { key: 'canExportReports', label: 'Exportar Relatórios', description: 'Gerar PDFs de pedidos, orçamentos e relatórios', icon: <FileSpreadsheet className="h-4 w-4" /> },
  { key: 'canSendWhatsApp', label: 'Enviar WhatsApp', description: 'Disparar mensagens para clientes e equipe via Evolution API', icon: <MessageCircle className="h-4 w-4" /> },
  { key: 'canChangeSettings', label: 'Alterar Configurações', description: 'Acesso total às configurações da empresa e logo', icon: <Settings className="h-4 w-4" /> },
];

export const NetflixProfileModal: React.FC = () => {
  const navigate = useNavigate();
  const {
    role,
    activeProfile,
    customProfiles,
    isUnlocked,
    unlockChefe,
    selectProfile,
    hasPinSet,
    setMasterPin,
    createProfile,
    updateProfile,
    deleteProfile,
    isProfileModalOpen,
    closeProfileModal,
  } = useProfile();

  const { settings } = useCompanySettings();
  const pc = settings.primaryColor || '#ef4444';

  const [modalStep, setModalStep] = useState<ModalStep>('select');
  const [targetProfileId, setTargetProfileId] = useState<string>('chefe');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  // Form para novo/editar perfil
  const [profileName, setProfileName] = useState('');
  const [profileIcon, setProfileIcon] = useState('🧵');
  const [profileColor, setProfileColor] = useState('#06b6d4');
  const [profilePin, setProfilePin] = useState('');
  const [usePin, setUsePin] = useState(false);
  const [profilePermissions, setProfilePermissions] = useState<ProfilePermissions>(PRODUCAO_PERMISSIONS);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

  // Reset do form
  const resetForm = () => {
    setProfileName('');
    setProfileIcon('🧵');
    setProfileColor('#06b6d4');
    setProfilePin('');
    setUsePin(false);
    setProfilePermissions(PRODUCAO_PERMISSIONS);
    setEditingProfileId(null);
  };

  // Keyboard input para PIN
  useEffect(() => {
    if (!isProfileModalOpen || modalStep !== 'pin_input') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        if (pin.length < 6) {
          const nextPin = pin + e.key;
          setPin(nextPin);
          setError(false);
          if (nextPin.length === 4) submitPin(nextPin);
        }
      } else if (e.key === 'Backspace') {
        setPin(prev => prev.slice(0, -1));
        setError(false);
      } else if (e.key === 'Enter') {
        submitPin(pin);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProfileModalOpen, modalStep, pin]);

  if (!isProfileModalOpen) return null;

  const handleCardClick = (p: CustomProfile) => {
    if (activeProfile.id === p.id) {
      closeProfileModal();
      return;
    }

    // Se for Chefe ou se o perfil tiver PIN exigido
    if (p.id === 'chefe' || (p.pin && p.pin.trim() !== '')) {
      setTargetProfileId(p.id);
      setModalStep('pin_input');
      setPin('');
      setError(false);
    } else {
      selectProfile(p.id);
      toast.success(`Perfil alternado para ${p.name}`);
      closeProfileModal();
    }
  };

  const submitPin = (pinToSubmit: string) => {
    if (targetProfileId === 'chefe' && !hasPinSet) {
      if (pinToSubmit.length >= 4) {
        setMasterPin(pinToSubmit);
        toast.success('Senha de Chefe cadastrada com sucesso!');
        setModalStep('select');
        closeProfileModal();
      } else {
        setError(true);
      }
      return;
    }

    const success = selectProfile(targetProfileId, pinToSubmit);
    if (success) {
      toast.success('Acesso autorizado!');
      setModalStep('select');
      setPin('');
      setError(false);
      closeProfileModal();
    } else {
      setError(true);
      setPin('');
    }
  };

  const handleOpenEditPermissions = (p: CustomProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProfileId(p.id);
    setProfileName(p.name);
    setProfileIcon(p.icon);
    setProfileColor(p.color);
    setProfilePin(p.pin || '');
    setUsePin(Boolean(p.pin));
    setProfilePermissions(p.permissions);
    setModalStep('edit_permissions');
  };

  const handleSaveProfileForm = async () => {
    if (!profileName.trim()) {
      toast.error('Informe o nome do perfil.');
      return;
    }

    const finalPin = usePin ? profilePin : undefined;

    if (editingProfileId) {
      await updateProfile(editingProfileId, {
        name: profileName,
        icon: profileIcon,
        color: profileColor,
        pin: finalPin,
        permissions: profilePermissions,
      });
    } else {
      await createProfile({
        name: profileName,
        icon: profileIcon,
        color: profileColor,
        pin: finalPin,
        permissions: profilePermissions,
      });
    }

    resetForm();
    setModalStep('select');
  };

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-zinc-100/95 dark:bg-black/95 backdrop-blur-2xl p-4 overflow-y-auto">
      {/* Botão Fechar */}
      <button
        onClick={() => {
          setModalStep('select');
          closeProfileModal();
        }}
        className="absolute top-6 right-6 p-3 rounded-full bg-zinc-200/50 dark:bg-white/10 hover:bg-zinc-300/50 dark:hover:bg-white/20 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-all shadow-lg z-10"
      >
        <X className="h-6 w-6" />
      </button>

      <div className="w-full max-w-4xl flex flex-col items-center space-y-6 my-auto py-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border text-xs font-black uppercase tracking-widest"
            style={{ backgroundColor: `${pc}20`, borderColor: `${pc}40`, color: pc }}
          >
            <Sparkles className="h-3.5 w-3.5" /> Seletor de Perfil & Permissões
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-zinc-900 dark:text-white tracking-tight">
            {modalStep === 'select' && 'Quem está usando?'}
            {modalStep === 'pin_input' && 'Digite o PIN de Segurança'}
            {modalStep === 'create_profile' && 'Criar Novo Perfil'}
            {modalStep === 'edit_permissions' && `Permissões de ${profileName}`}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            {modalStep === 'select' && 'Selecione o perfil para carregar a interface e permissões correspondentes'}
            {modalStep === 'pin_input' && 'Insira a senha de 4 dígitos para autorizar este perfil'}
            {modalStep === 'create_profile' && 'Configure o nome, ícone e o controle de acesso para este perfil'}
            {modalStep === 'edit_permissions' && 'Marque quais telas e funcionalidades este perfil pode acessar'}
          </p>
        </div>

        {/* ─── PASSO 1: Seleção de Cards ─── */}
        {modalStep === 'select' && (
          <div className="w-full max-w-3xl space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 px-2">
              {customProfiles.map(p => {
                const isActive = activeProfile.id === p.id;
                const hasPin = Boolean(p.pin || p.id === 'chefe');

                return (
                  <div
                    key={p.id}
                    onClick={() => handleCardClick(p)}
                    className={`group relative overflow-hidden p-6 rounded-3xl border transition-all duration-300 cursor-pointer flex flex-col items-center text-center space-y-3 ${
                      isActive
                        ? 'bg-white dark:bg-black/60 shadow-2xl ring-2'
                        : 'bg-zinc-50 dark:bg-white/5 border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/10 hover:scale-105 shadow-xl'
                    }`}
                    style={{
                      borderColor: isActive ? p.color : undefined,
                      boxShadow: isActive ? `0 0 30px ${p.color}35` : undefined,
                    }}
                  >
                    {/* Badge Ativo */}
                    {isActive && (
                      <span
                        className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-white text-[9px] font-black uppercase tracking-wider shadow-md"
                        style={{ backgroundColor: p.color }}
                      >
                        <Check className="h-3 w-3" /> Ativo
                      </span>
                    )}

                    {/* Botões de Ação Rapida no Card (visível no Modo Chefe) */}
                    {isUnlocked && (
                      <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
                        <button
                          type="button"
                          onClick={e => handleOpenEditPermissions(p, e)}
                          className="p-2 rounded-xl bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 text-zinc-500 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-all shadow-md"
                          title="Editar Permissões deste Perfil"
                        >
                          <Settings className="h-4 w-4 text-purple-300" />
                        </button>
                        
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            // Toggle rápido da permissão de ver valores financeiros
                            const updatedProfile = {
                              ...p,
                              permissions: {
                                ...p.permissions,
                                canSeeFinancials: !p.permissions.canSeeFinancials
                              }
                            };
                            updateProfile(p.id, updatedProfile);
                            toast.success(`Acesso Financeiro ${updatedProfile.permissions.canSeeFinancials ? 'Liberado' : 'Bloqueado'} para ${p.name}`);
                          }}
                          className={`p-2 rounded-xl transition-all shadow-md ${
                            p.permissions.canSeeFinancials
                              ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                          }`}
                          title={p.permissions.canSeeFinancials ? "Ocultar Valores Financeiros" : "Liberar Valores Financeiros"}
                        >
                          {p.permissions.canSeeFinancials ? <DollarSign className="h-4 w-4" /> : <DollarSign className="h-4 w-4 opacity-50 line-through" />}
                        </button>
                      </div>
                    )}

                    {/* Avatar Icon */}
                    <div className="relative mt-2">
                      <div
                        className="h-20 w-20 rounded-2xl p-1 shadow-xl group-hover:scale-110 transition-transform duration-300"
                        style={{ background: `linear-gradient(135deg, ${p.color} 0%, #8b5cf6 100%)` }}
                      >
                        <div className="h-full w-full rounded-[14px] bg-white dark:bg-[#0d0d14] flex items-center justify-center text-3xl">
                          {p.icon}
                        </div>
                      </div>
                      {hasPin && (
                        <div
                          className="absolute -bottom-1 -right-1 p-1.5 rounded-xl text-white shadow-lg"
                          style={{ backgroundColor: p.color }}
                        >
                          <Lock className="h-3 w-3" />
                        </div>
                      )}
                    </div>

                    {/* Textos */}
                    <div className="space-y-0.5">
                      <h3 className="text-lg font-black text-zinc-900 dark:text-white group-hover:brightness-125 transition-colors truncate">
                        {p.name}
                      </h3>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                        {p.permissions.canSeeFinancials ? '💰 Acesso Financeiro' : '🔒 Restrito (Sem Valores)'}
                      </p>
                    </div>

                    {/* Footer Badge */}
                    <div className="pt-1 flex items-center gap-1.5">
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border text-[10px] font-bold"
                        style={{ backgroundColor: `${p.color}15`, borderColor: `${p.color}35`, color: p.color }}
                      >
                        {hasPin ? '🔒 Requer PIN' : '⚡ Entrar Direto'}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Card Criar Novo Perfil (Visível no Modo Chefe) */}
              {isUnlocked && (
                <div
                  onClick={() => {
                    resetForm();
                    setModalStep('create_profile');
                  }}
                  className="group p-6 rounded-3xl border border-dashed border-zinc-300 dark:border-white/20 bg-zinc-50 dark:bg-white/[0.02] hover:bg-purple-50 dark:hover:bg-purple-500/10 hover:border-purple-300 dark:hover:border-purple-500/50 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center text-center space-y-3 min-h-[220px]"
                >
                  <div className="h-14 w-14 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform shadow-lg">
                    <Plus className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-zinc-800 dark:text-white">Criar Novo Perfil</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Adicione uma nova função com permissões personalizadas</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── PASSO 2: Entrada do PIN (Réplica iOS Passcode Liquid Glass 26.0) ─── */}
        {modalStep === 'pin_input' && (
          <div className="w-full max-w-md backdrop-blur-2xl bg-zinc-100/90 dark:bg-zinc-950/85 p-6 sm:p-8 rounded-[36px] border border-zinc-300 dark:border-white/15 shadow-[0_0_80px_rgba(0,0,0,0.1)] dark:shadow-[0_0_80px_rgba(0,0,0,0.8)] space-y-6 animate-in zoom-in-95 duration-200 text-center select-none">
            <form onSubmit={e => { e.preventDefault(); submitPin(pin); }} className="space-y-6">
              
              {/* Header com ícone de cadeado flutuante */}
              <div className="space-y-3">
                <div
                  className="h-14 w-14 rounded-full border border-white/20 flex items-center justify-center mx-auto shadow-2xl backdrop-blur-xl transition-all duration-300 hover:scale-105"
                  style={{ backgroundColor: `${pc}25`, borderColor: `${pc}50`, color: pc, boxShadow: `0 0 25px ${pc}40` }}
                >
                  <KeyRound className="h-7 w-7" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
                    {targetProfileId === 'chefe' && !hasPinSet ? 'Criar Senha de 4 Dígitos' : 'Código de Acesso'}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                    {targetProfileId === 'chefe' && !hasPinSet ? 'Digite um código numérico de 4 dígitos' : 'Digite a senha do perfil para continuar'}
                  </p>
                </div>

                {/* 🔴 4 Círculos Indicadores Estilo iOS Passcode */}
                <div className="flex items-center justify-center gap-4 py-3">
                  {[0, 1, 2, 3].map(idx => {
                    const isFilled = pin.length > idx;
                    return (
                      <div
                        key={idx}
                        className={`h-4 w-4 sm:h-5 sm:w-5 rounded-full transition-all duration-200 border-2 ${
                          error
                            ? 'bg-rose-500 border-rose-400 scale-125 shadow-[0_0_15px_rgba(244,63,94,0.8)] animate-shake'
                            : isFilled
                            ? 'bg-zinc-800 dark:bg-white border-zinc-800 dark:border-white scale-110 shadow-[0_0_15px_rgba(0,0,0,0.2)] dark:shadow-[0_0_15px_rgba(255,255,255,0.9)]'
                            : 'bg-transparent border-zinc-400 dark:border-white/30'
                        }`}
                        style={isFilled && !error ? { backgroundColor: pc, borderColor: pc, boxShadow: `0 0 18px ${pc}` } : undefined}
                      />
                    );
                  })}
                </div>

                {error && (
                  <p className="text-rose-400 text-xs font-bold animate-in fade-in">
                    Código incorreto. Tente novamente.
                  </p>
                )}
              </div>

              {/* 🔢 Teclado Numérico iOS Passcode (Liquid Glass 3x4) */}
              <div className="grid grid-cols-3 gap-3.5 sm:gap-5 max-w-[280px] sm:max-w-[320px] mx-auto py-1">
                {[
                  { num: '1', sub: '' },
                  { num: '2', sub: 'A B C' },
                  { num: '3', sub: 'D E F' },
                  { num: '4', sub: 'G H I' },
                  { num: '5', sub: 'J K L' },
                  { num: '6', sub: 'M N O' },
                  { num: '7', sub: 'P Q R S' },
                  { num: '8', sub: 'T U V' },
                  { num: '9', sub: 'W X Y Z' },
                ].map(item => (
                  <button
                    key={item.num}
                    type="button"
                    onClick={() => {
                      if (pin.length < 4) {
                        const next = pin + item.num;
                        setPin(next);
                        setError(false);
                        if (next.length === 4) submitPin(next);
                      }
                    }}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border border-zinc-300 dark:border-white/15 bg-zinc-200/50 dark:bg-white/10 hover:bg-zinc-300/50 dark:hover:bg-white/20 active:bg-zinc-400/50 dark:active:bg-white/35 active:scale-90 transition-all duration-150 backdrop-blur-2xl flex flex-col items-center justify-center shadow-lg cursor-pointer mx-auto aspect-square select-none group"
                  >
                    <span className="text-2xl sm:text-3xl font-light text-zinc-800 dark:text-white leading-none group-active:scale-95 transition-transform">
                      {item.num}
                    </span>
                    {item.sub && (
                      <span className="text-[8px] sm:text-[9px] font-bold text-zinc-500 dark:text-white/50 tracking-[0.15em] leading-none mt-1 group-hover:text-zinc-700 dark:group-hover:text-white/80">
                        {item.sub}
                      </span>
                    )}
                  </button>
                ))}

                {/* Botão Limpar */}
                <button
                  type="button"
                  onClick={() => { setPin(''); setError(false); }}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-zinc-200/50 dark:bg-white/5 hover:bg-zinc-300/50 dark:hover:bg-white/15 active:bg-zinc-400/50 dark:active:bg-white/25 border border-zinc-300 dark:border-white/10 backdrop-blur-2xl flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-white active:scale-90 transition-all duration-150 shadow-md cursor-pointer mx-auto aspect-square select-none"
                  title="Limpar"
                >
                  <RotateCcw className="h-5 w-5" />
                </button>

                {/* Número 0 */}
                <button
                  type="button"
                  onClick={() => {
                    if (pin.length < 4) {
                      const next = pin + '0';
                      setPin(next);
                      setError(false);
                      if (next.length === 4) submitPin(next);
                    }
                  }}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border border-white/15 bg-white/10 hover:bg-white/20 active:bg-white/35 active:scale-90 transition-all duration-150 backdrop-blur-2xl flex flex-col items-center justify-center shadow-lg cursor-pointer mx-auto aspect-square select-none group"
                >
                  <span className="text-2xl sm:text-3xl font-light text-white leading-none group-active:scale-95 transition-transform">
                    0
                  </span>
                </button>

                {/* Botão Apagar / Backspace */}
                <button
                  type="button"
                  onClick={() => { setPin(p => p.slice(0, -1)); setError(false); }}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/5 hover:bg-white/15 active:bg-white/25 border border-white/10 backdrop-blur-2xl flex items-center justify-center text-zinc-400 hover:text-white active:scale-90 transition-all duration-150 shadow-md cursor-pointer mx-auto aspect-square select-none"
                  title="Apagar"
                >
                  <Delete className="h-5 w-5" />
                </button>
              </div>

              <div className="pt-2 flex flex-col items-center gap-2">
                <p className="text-[11px] text-zinc-500 font-medium flex items-center gap-1.5">
                  ⌨️ Teclado físico também suportado
                </p>
                <button
                  type="button"
                  onClick={() => setModalStep('select')}
                  className="text-xs text-zinc-400 hover:text-white font-semibold transition-colors py-1 px-3 rounded-lg hover:bg-white/5"
                >
                  Voltar à seleção de perfis
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ─── PASSO 3 & 4: Criar / Editar Permissões do Perfil ─── */}
        {(modalStep === 'create_profile' || modalStep === 'edit_permissions') && (
          <div className="w-full max-w-2xl backdrop-blur-xl bg-zinc-100/95 dark:bg-zinc-900/90 p-6 md:p-8 rounded-3xl border border-zinc-300 dark:border-white/15 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200">
            {/* Informações básicas do Perfil */}
            <div className="space-y-4">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2 border-b border-zinc-200 dark:border-white/10 pb-3">
                <Edit3 className="h-4 w-4 text-purple-500 dark:text-purple-400" /> Informações Básicas
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-6 space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nome do Perfil</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={e => setProfileName(e.target.value)}
                    placeholder="Ex: Acabamento & Embalagem"
                    className="w-full px-4 py-3 rounded-xl bg-white dark:bg-black/40 border border-zinc-300 dark:border-white/10 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                </div>

                <div className="sm:col-span-3 space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Ícone</label>
                  <select
                    value={profileIcon}
                    onChange={e => setProfileIcon(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl bg-white dark:bg-black/40 border border-zinc-300 dark:border-white/10 text-zinc-900 dark:text-white text-sm outline-none appearance-none cursor-pointer"
                  >
                    {EMOJI_OPTIONS.map(emoji => (
                      <option key={emoji} value={emoji}>{emoji} {emoji}</option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3 space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Cor de Destaque</label>
                  <div className="flex gap-1.5 pt-1">
                    {COLOR_PRESETS.map(c => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setProfileColor(c.hex)}
                        className={`h-8 w-8 rounded-xl transition-all ${profileColor === c.hex ? 'ring-2 ring-white scale-110' : 'opacity-60 hover:opacity-100'}`}
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Configuração de PIN opcional */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-zinc-800 dark:text-white flex items-center gap-2">
                    <Lock className="h-4 w-4 text-amber-500 dark:text-amber-400" /> Exigir PIN de Acesso
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Se ativado, o operador precisará digitar uma senha de 4 dígitos para entrar neste perfil.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setUsePin(!usePin)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${usePin ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-500/40' : 'bg-zinc-200 dark:bg-white/5 text-zinc-600 dark:text-zinc-500 border border-zinc-300 dark:border-white/10'}`}
                >
                  {usePin ? '🔒 Com PIN' : '⚡ Sem PIN'}
                </button>
              </div>

              {usePin && (
                <div className="space-y-1 pl-4 border-l-2 border-amber-500/40">
                  <label className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">PIN de 4 dígitos</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={profilePin}
                    onChange={e => setProfilePin(e.target.value.replace(/\D/g, ''))}
                    placeholder="1234"
                    className="w-32 px-4 py-2.5 rounded-xl bg-white dark:bg-black/40 border border-zinc-300 dark:border-white/10 text-zinc-900 dark:text-white text-center font-bold tracking-widest text-lg outline-none"
                  />
                </div>
              )}
            </div>

            {/* SEÇÃO 1: Rotas Permitidas */}
            <div className="space-y-3">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2 border-b border-zinc-200 dark:border-white/10 pb-3">
                <LayoutDashboard className="h-4 w-4 text-cyan-500 dark:text-cyan-400" /> Páginas & Telas Acessíveis
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ROUTE_LABELS.map(r => {
                  const allowed = profilePermissions.routes[r.key];
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => {
                        setProfilePermissions(prev => ({
                          ...prev,
                          routes: { ...prev.routes, [r.key]: !allowed },
                        }));
                      }}
                      className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all ${
                        allowed
                          ? 'bg-cyan-50 dark:bg-cyan-500/10 border-cyan-300 dark:border-cyan-500/30 text-cyan-900 dark:text-white'
                          : 'bg-zinc-50 dark:bg-white/[0.02] border-zinc-200 dark:border-white/5 text-zinc-500 dark:text-zinc-500'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={allowed ? 'text-cyan-400' : 'text-zinc-600'}>{r.icon}</span>
                        <span className="text-xs font-semibold">{r.label}</span>
                      </div>
                      {allowed ? (
                        <ToggleRight className="h-5 w-5 text-cyan-400" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-zinc-600" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SEÇÃO 2: Funcionalidades Granulares */}
            <div className="space-y-3">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2 border-b border-zinc-200 dark:border-white/10 pb-3">
                <Shield className="h-4 w-4 text-emerald-500 dark:text-emerald-400" /> Funcionalidades & Ações Permetidas
              </h3>
              <div className="space-y-2">
                {FEATURE_LABELS.map(f => {
                  const enabled = Boolean(profilePermissions[f.key]);
                  const isFinancial = f.key === 'canSeeFinancials';
                  
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => {
                        setProfilePermissions(prev => ({
                          ...prev,
                          [f.key]: !enabled,
                        }));
                      }}
                      className={`w-full flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all ${
                        isFinancial
                          ? enabled 
                            ? 'bg-emerald-500/20 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.3)] ring-1 ring-emerald-500' 
                            : 'bg-red-500/10 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)] ring-1 ring-red-500/50'
                          : enabled
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30'
                            : 'bg-zinc-50 dark:bg-white/[0.02] border-zinc-200 dark:border-white/5'
                      }`}
                    >
                      <div>
                        <p className={`text-xs font-bold flex items-center gap-1.5 ${
                          isFinancial 
                            ? enabled ? 'text-emerald-400' : 'text-red-400'
                            : enabled ? 'text-emerald-900 dark:text-white' : 'text-zinc-500'
                        }`}>
                          {f.icon && <span className={
                            isFinancial 
                              ? enabled ? 'text-emerald-400 drop-shadow-md' : 'text-red-400 opacity-70'
                              : enabled ? 'text-emerald-500' : 'text-zinc-500'
                          }>{f.icon}</span>}
                          {f.label}
                        </p>
                        <p className={`text-[11px] mt-0.5 ${
                          isFinancial
                            ? enabled ? 'text-emerald-500/80' : 'text-red-500/70'
                            : 'text-zinc-400'
                        }`}>{f.description}</p>
                      </div>
                      {enabled ? (
                        <ToggleRight className={`h-6 w-6 flex-shrink-0 ml-3 ${isFinancial ? 'text-emerald-400 drop-shadow-md' : 'text-emerald-400'}`} />
                      ) : (
                        <ToggleLeft className={`h-6 w-6 flex-shrink-0 ml-3 ${isFinancial ? 'text-red-400/80' : 'text-zinc-600'}`} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Botões de Ação Responsivos */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between pt-4 border-t border-zinc-200 dark:border-white/10 gap-2.5 w-full">
              {editingProfileId ? (
                <button
                  type="button"
                  onClick={async () => {
                    if (window.confirm('Tem certeza que deseja excluir este perfil?')) {
                      await deleteProfile(editingProfileId);
                      setModalStep('select');
                    }
                  }}
                  className="w-full sm:w-auto px-4 py-3 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <Trash2 className="h-4 w-4" /> Excluir Perfil
                </button>
              ) : <div />}

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setModalStep('select')}
                  className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-zinc-200/50 dark:bg-white/5 hover:bg-zinc-300/50 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-400 text-xs font-bold transition-all text-center"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveProfileForm}
                  className="w-full sm:w-auto px-6 sm:px-8 py-3.5 rounded-2xl text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-xl"
                  style={{ backgroundColor: pc }}
                >
                  <Save className="h-4 w-4" /> Salvar Perfil
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
