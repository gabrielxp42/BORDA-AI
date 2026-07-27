import React, { useState } from 'react';
import {
  ShieldCheck, Plus, Settings, Trash2, Edit3, Lock, Check,
  Sparkles, Save, X, ToggleLeft, ToggleRight, LayoutDashboard,
  ShoppingBag, Calculator, Layers, Boxes, FileSpreadsheet, Users,
  Cpu, Shield, KeyRound
} from 'lucide-react';
import { useProfile, CustomProfile, ProfilePermissions, PRODUCAO_PERMISSIONS } from '@/contexts/ProfileContext';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { toast } from 'sonner';

const EMOJI_OPTIONS = ['🧵', '✂️', '📦', '🔧', '💼', '👷', '🎨', '📋', '👕', '⚡', '🎯', '🚀', '⭐', '🛡️'];

const COLOR_PRESETS = [
  { name: 'Vermelho', hex: '#ef4444' },
  { name: 'Ciano', hex: '#06b6d4' },
  { name: 'Roxo', hex: '#8b5cf6' },
  { name: 'Verde', hex: '#10b981' },
  { name: 'Laranja', hex: '#f59e0b' },
  { name: 'Rosa', hex: '#ec4899' },
];

const ROUTE_ITEMS: { key: keyof ProfilePermissions['routes']; label: string; icon: React.ReactNode }[] = [
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

const FEATURE_ITEMS: { key: keyof Omit<ProfilePermissions, 'routes'>; label: string; description: string }[] = [
  { key: 'canSeeFinancials', label: 'Ver Valores Financeiros', description: 'Exibe faturamento, valores totais e lucros nos pedidos' },
  { key: 'canEditOrders', label: 'Criar & Editar Pedidos', description: 'Permite alterar status e criar novos orçamentos' },
  { key: 'canManageClients', label: 'Gerenciar Clientes', description: 'Adicionar, editar e remover cadastro de clientes' },
  { key: 'canManageStock', label: 'Gerenciar Estoque', description: 'Alterar quantidade de insumos, linhas e agulhas' },
  { key: 'canExportReports', label: 'Exportar Relatórios', description: 'Gerar PDFs de pedidos, orçamentos e relatórios' },
  { key: 'canSendWhatsApp', label: 'Enviar WhatsApp', description: 'Disparar mensagens via Evolution API' },
  { key: 'canChangeSettings', label: 'Alterar Configurações', description: 'Acesso total às configurações da empresa e logo' },
];

export const ProfilePermissionsManager: React.FC = () => {
  const { customProfiles, createProfile, updateProfile, deleteProfile } = useProfile();
  const { settings } = useCompanySettings();
  const pc = settings.primaryColor || '#ef4444';

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🧵');
  const [color, setColor] = useState('#06b6d4');
  const [pin, setPin] = useState('');
  const [usePin, setUsePin] = useState(false);
  const [permissions, setPermissions] = useState<ProfilePermissions>(PRODUCAO_PERMISSIONS);

  const handleOpenCreate = () => {
    setEditingId(null);
    setName('');
    setIcon('🧵');
    setColor('#06b6d4');
    setPin('');
    setUsePin(false);
    setPermissions(PRODUCAO_PERMISSIONS);
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (p: CustomProfile) => {
    setEditingId(p.id);
    setName(p.name);
    setIcon(p.icon);
    setColor(p.color);
    setPin(p.pin || '');
    setUsePin(Boolean(p.pin));
    setPermissions(p.permissions);
    setIsEditorOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Por favor, informe o nome do perfil.');
      return;
    }

    const finalPin = usePin ? pin : undefined;

    if (editingId) {
      await updateProfile(editingId, {
        name,
        icon,
        color,
        pin: finalPin,
        permissions,
      });
    } else {
      await createProfile({
        name,
        icon,
        color,
        pin: finalPin,
        permissions,
      });
    }

    setIsEditorOpen(false);
  };

  return (
    <div className="bg-white dark:bg-zinc-900/70 border border-slate-200 dark:border-white/10 rounded-3xl p-6 md:p-8 shadow-xl backdrop-blur-xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 dark:border-white/10 pb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">
              Gestão de Perfis & Permissões de Acesso
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Crie perfis para seus funcionários e defina exatamente o que cada um pode ver e fazer.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="px-4 py-2.5 rounded-xl text-white text-xs font-bold flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-md cursor-pointer"
          style={{ backgroundColor: pc }}
        >
          <Plus className="h-4 w-4" />
          Novo Perfil Customizado
        </button>
      </div>

      {/* Grid de Perfis Existentes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {customProfiles.map(p => {
          const isBuiltIn = p.isBuiltIn;
          const hasPin = Boolean(p.pin || p.id === 'chefe');

          return (
            <div
              key={p.id}
              className="p-5 rounded-2xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 flex flex-col justify-between space-y-4 hover:border-slate-300 dark:hover:border-white/20 transition-all group"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl shadow-md flex-shrink-0"
                      style={{ backgroundColor: `${p.color}22`, border: `1px solid ${p.color}44` }}
                    >
                      {p.icon}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        {p.name}
                        {isBuiltIn && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/10 text-slate-400 font-normal">
                            Sistema
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                        {p.permissions.canSeeFinancials ? '💰 Acesso Financeiro Total' : '🔒 Modo Restrito (Sem Valores)'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span
                    className="px-2.5 py-1 rounded-lg border text-[10px] font-bold"
                    style={{ backgroundColor: `${p.color}15`, borderColor: `${p.color}30`, color: p.color }}
                  >
                    {hasPin ? '🔒 Requer PIN de Acesso' : '⚡ Acesso Direto'}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-white/5 text-slate-600 dark:text-zinc-400 text-[10px] font-semibold">
                    {Object.values(p.permissions.routes).filter(Boolean).length} / 10 Páginas Liberaadas
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/5 gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(p)}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-800 dark:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                >
                  <Settings className="h-3.5 w-3.5 text-purple-400" />
                  Editar Permissões
                </button>

                {!isBuiltIn && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (window.confirm(`Tem certeza que deseja excluir o perfil "${p.name}"?`)) {
                        await deleteProfile(p.id);
                      }
                    }}
                    className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-all"
                    title="Excluir Perfil"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal / Editor Inline de Permissões */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-zinc-900 border border-white/15 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 my-auto text-left">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-lg">
                  {icon}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {editingId ? `Configurar Permissões: ${name}` : 'Criar Perfil de Acesso'}
                  </h3>
                  <p className="text-xs text-zinc-400">Defina o nome, ícone e selecione quais módulos estarão visíveis</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Informações Básicas */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-6 space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Nome do Perfil</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ex: Operador Máquina 1, Vendedor"
                    className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white placeholder-zinc-500 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                </div>

                <div className="sm:col-span-3 space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Ícone Emoji</label>
                  <select
                    value={icon}
                    onChange={e => setIcon(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl bg-black/40 border border-white/10 text-white text-sm outline-none cursor-pointer"
                  >
                    {EMOJI_OPTIONS.map(emoji => (
                      <option key={emoji} value={emoji}>{emoji} {emoji}</option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3 space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Cor</label>
                  <div className="flex gap-1.5 pt-1">
                    {COLOR_PRESETS.map(c => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setColor(c.hex)}
                        className={`h-8 w-8 rounded-xl transition-all ${color === c.hex ? 'ring-2 ring-white scale-110' : 'opacity-50 hover:opacity-100'}`}
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* PIN opcional */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-white flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-amber-400" /> Exigir PIN de 4 Dígitos para Acessar
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">Ao selecionar este perfil na tela inicial, exigirá senha.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setUsePin(!usePin)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    usePin ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-white/5 text-zinc-500 border border-white/10'
                  }`}
                >
                  {usePin ? '🔒 PIN Ativo' : '⚡ Sem PIN'}
                </button>
              </div>

              {usePin && (
                <div className="space-y-1 pl-4 border-l-2 border-amber-500/40">
                  <label className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">PIN de 4 dígitos</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="1234"
                    className="w-32 px-4 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-center font-bold tracking-widest text-base outline-none"
                  />
                </div>
              )}
            </div>

            {/* SEÇÃO 1: Matriz de Rotas */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-purple-400 uppercase tracking-widest flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" /> Páginas Acessíveis (Menu de Navegação)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ROUTE_ITEMS.map(r => {
                  const isAllowed = permissions.routes[r.key];
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => {
                        setPermissions(prev => ({
                          ...prev,
                          routes: { ...prev.routes, [r.key]: !isAllowed }
                        }));
                      }}
                      className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all ${
                        isAllowed
                          ? 'bg-purple-500/10 border-purple-500/30 text-white'
                          : 'bg-white/[0.02] border-white/5 text-zinc-500'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={isAllowed ? 'text-purple-400' : 'text-zinc-600'}>{r.icon}</span>
                        <span className="text-xs font-semibold">{r.label}</span>
                      </div>
                      {isAllowed ? (
                        <ToggleRight className="h-5 w-5 text-purple-400" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-zinc-600" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SEÇÃO 2: Funcionalidades */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                <Shield className="h-4 w-4" /> Permissões de Ações & Dados
              </h4>
              <div className="space-y-2">
                {FEATURE_ITEMS.map(f => {
                  const isEnabled = Boolean(permissions[f.key]);
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => {
                        setPermissions(prev => ({
                          ...prev,
                          [f.key]: !isEnabled
                        }));
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl border text-left transition-all ${
                        isEnabled
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-white'
                          : 'bg-white/[0.02] border-white/5 text-zinc-500'
                      }`}
                    >
                      <div>
                        <p className={`text-xs font-bold ${isEnabled ? 'text-white' : 'text-zinc-500'}`}>{f.label}</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">{f.description}</p>
                      </div>
                      {isEnabled ? (
                        <ToggleRight className="h-6 w-6 text-emerald-400 flex-shrink-0 ml-3" />
                      ) : (
                        <ToggleLeft className="h-6 w-6 text-zinc-600 flex-shrink-0 ml-3" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 text-xs font-bold transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-8 py-2.5 rounded-xl text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 hover:brightness-110 transition-all shadow-lg cursor-pointer"
                style={{ backgroundColor: pc }}
              >
                <Save className="h-4 w-4" /> Salvar Permissões
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
