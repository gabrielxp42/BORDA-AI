import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes, ArrowUpRight, ArrowDownRight, Plus, Search, Filter,
  AlertTriangle, CheckCircle2, Clock, Trash2, Edit, RefreshCw,
  Package, Layers, Sparkles, TrendingUp, TrendingDown, History
} from 'lucide-react';
import { StockItem, StockMovement, StockCategory, MovementType } from '@/types/stockTypes';
import { StockMovementModal } from '@/components/stock/StockMovementModal';
import { CreateItemModal } from '@/components/stock/CreateItemModal';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { supabase } from '@/integrations/supabase/client';
import { CloudSyncMigrationBanner } from '@/components/ui/CloudSyncMigrationBanner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

// Insumos de exemplo iniciais para uma oficina de bordados se o estoque estiver vazio
const INITIAL_MOCK_ITEMS: StockItem[] = [
  {
    id: '1',
    name: 'Linha Lumina 2004 Amarelo Ouro (5000m)',
    category: 'linhas',
    unit: 'cone',
    quantity: 8,
    min_quantity: 3,
    cost_price: 19.5,
    color_code: '#2004',
    location: 'Prateleira A1',
    notes: 'Linha de poliéster 120D/2 mais usada para bordados de logotipos',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    name: 'Linha Lumina 2000 Branco Neve (5000m)',
    category: 'linhas',
    unit: 'cone',
    quantity: 14,
    min_quantity: 5,
    cost_price: 19.5,
    color_code: '#2000',
    location: 'Prateleira A1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '3',
    name: 'Linha Lumina 2099 Preto Absoluto (5000m)',
    category: 'linhas',
    unit: 'cone',
    quantity: 2,
    min_quantity: 4,
    cost_price: 19.5,
    color_code: '#2099',
    location: 'Prateleira A1',
    notes: 'ESTOQUE BAIXO - Reposição urgente necessária',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '4',
    name: 'Entretela Rasga-Fácil 60g (Rolo 100m)',
    category: 'entretelas',
    unit: 'rolo',
    quantity: 3,
    min_quantity: 2,
    cost_price: 110.0,
    location: 'Estante de Rolos B',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '5',
    name: 'Agulha Industrial DBxK5 Cabos Finos N° 75/11',
    category: 'agulhas',
    unit: 'caixa',
    quantity: 5,
    min_quantity: 2,
    cost_price: 45.0,
    notes: 'Caixa com 100 agulhas especificas para tajima/feiya/barudan',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '6',
    name: 'Spray de Cola Temporária 505 (500ml)',
    category: 'agulhas',
    unit: 'unidade',
    quantity: 1,
    min_quantity: 3,
    cost_price: 68.0,
    notes: 'ESTOQUE BAIXO',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '7',
    name: 'Camisetas Polo Algodão Pima - Preta (Tam M)',
    category: 'pecas',
    unit: 'unidade',
    quantity: 25,
    min_quantity: 10,
    cost_price: 32.0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const Estoque: React.FC = () => {
  const { settings } = useCompanySettings();

  // Active Tab: 'inventory' | 'history'
  const [activeTab, setActiveTab] = useState<'inventory' | 'history'>('inventory');

  // Items State (carrega do localStorage ou inicia com mock)
  const [items, setItems] = useState<StockItem[]>(() => {
    const saved = localStorage.getItem('borda_stock_items');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return INITIAL_MOCK_ITEMS;
      }
    }
    return INITIAL_MOCK_ITEMS;
  });

  // Movements Log State
  const [movements, setMovements] = useState<StockMovement[]>(() => {
    const saved = localStorage.getItem('borda_stock_movements');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  // Modals
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movementType, setMovementType] = useState<MovementType>('in');
  const [preselectedItem, setPreselectedItem] = useState<StockItem | null>(null);
  const [isCreateItemModalOpen, setIsCreateItemModalOpen] = useState(false);

  // Persistence & Supabase Cloud Sync
  useEffect(() => {
    localStorage.setItem('borda_stock_items', JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem('borda_stock_movements', JSON.stringify(movements));
  }, [movements]);

  // Carrega insumos do Supabase na inicialização
  useEffect(() => {
    const fetchCloudStock = async () => {
      try {
        const { data, error } = await supabase
          .from('stock_items')
          .select('*')
          .order('created_at', { ascending: false });

        if (data && data.length > 0 && !error) {
          const loaded: StockItem[] = data.map((item: any) => ({
            id: item.id,
            name: item.name,
            category: item.category as any,
            unit: item.unit as any,
            quantity: Number(item.quantity) || 0,
            min_quantity: Number(item.min_quantity) || 0,
            cost_price: Number(item.cost_price) || 0,
            color_code: item.color_code,
            location: item.location,
            notes: item.notes,
            created_at: item.created_at,
            updated_at: item.updated_at,
          }));
          setItems(loaded);
          localStorage.setItem('borda_stock_items', JSON.stringify(loaded));
        }
      } catch (err) {
        console.warn('Erro ao carregar insumos da nuvem:', err);
      }
    };

    fetchCloudStock();
  }, []);

  // Open Movement Modal
  const openMovementModal = (type: MovementType, item?: StockItem) => {
    setMovementType(type);
    setPreselectedItem(item || null);
    setIsMovementModalOpen(true);
  };

  // Submit Movement Handler
  const handleMovementSubmit = (itemId: string, type: MovementType, qty: number, reason: string) => {
    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id === itemId) {
          const newQty = type === 'in' ? item.quantity + qty : Math.max(0, item.quantity - qty);
          return {
            ...item,
            quantity: newQty,
            updated_at: new Date().toISOString(),
          };
        }
        return item;
      })
    );

    const targetItem = items.find((i) => i.id === itemId);
    const newMovement: StockMovement = {
      id: Date.now().toString(),
      item_id: itemId,
      item_name: targetItem?.name || 'Insumo',
      type,
      quantity: qty,
      reason,
      date: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    setMovements((prev) => [newMovement, ...prev]);

    if (type === 'in') {
      toast.success(`Entrada de +${qty} ${targetItem?.unit || ''}(s) registrada com sucesso!`);
    } else {
      toast.warning(`Baixa de -${qty} ${targetItem?.unit || ''}(s) realizada!`);
    }
  };

  // Create Item Handler
  const handleCreateItem = (newItemData: Omit<StockItem, 'id' | 'created_at' | 'updated_at'>) => {
    const newItem: StockItem = {
      ...newItemData,
      id: Date.now().toString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setItems((prev) => [newItem, ...prev]);

    // Lança movimento inicial de entrada se houver quantidade
    if (newItem.quantity > 0) {
      const initialMovement: StockMovement = {
        id: (Date.now() + 1).toString(),
        item_id: newItem.id,
        item_name: newItem.name,
        type: 'in',
        quantity: newItem.quantity,
        reason: 'Cadastro inicial de insumo',
        date: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      setMovements((prev) => [initialMovement, ...prev]);
    }
  };

  // Delete Item
  const handleDeleteItem = (id: string, name: string) => {
    if (window.confirm(`Tem certeza que deseja remover "${name}" do estoque?`)) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.info('Item removido do estoque.');
    }
  };

  // Computed Filters
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.color_code && item.color_code.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
      const matchesLow = !onlyLowStock || item.quantity <= item.min_quantity;

      return matchesSearch && matchesCat && matchesLow;
    });
  }, [items, searchTerm, selectedCategory, onlyLowStock]);

  // KPIs
  const totalItemsCount = items.length;
  const lowStockCount = items.filter((i) => i.quantity <= i.min_quantity).length;
  const totalMovementsMonth = movements.length;

  const categoryLabels: Record<StockCategory, { label: string; icon: string }> = {
    linhas: { label: 'Linhas de Bordado', icon: '🧵' },
    entretelas: { label: 'Entretelas', icon: '📜' },
    pecas: { label: 'Peças em Branco', icon: '👕' },
    agulhas: { label: 'Agulhas & Insumos', icon: '🪡' },
    embalagens: { label: 'Embalagens', icon: '📦' },
    outros: { label: 'Outros Insumos', icon: '⚙️' },
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* Cloud Sync Migration Banner */}
      <CloudSyncMigrationBanner />
      
      {/* Header da Página */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <Boxes className="h-6 w-6 text-purple-400" />
            Controle de Estoque & Insumos
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Gerenciamento manual de entradas e saídas de linhas, entretelas, peças e aviamentos.
          </p>
        </div>

        <button
          onClick={() => setIsCreateItemModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold text-white bg-white/10 hover:bg-white/15 border border-white/10 transition-all shadow-sm active:scale-95"
        >
          <Plus className="h-4 w-4" />
          <span>Cadastrar Novo Insumo</span>
        </button>
      </div>

      {/* 🟢🔴 DOIS BOTÕES GIGANTES DE ENTRADA E SAÍDA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Botão Gigante 1: REGISTRAR ENTRADA */}
        <button
          onClick={() => openMovementModal('in')}
          className="group relative overflow-hidden p-6 rounded-3xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 via-emerald-900/20 to-black/60 hover:border-emerald-400 transition-all shadow-xl hover:shadow-emerald-950/50 text-left active:scale-[0.99]"
        >
          <div className="absolute -right-6 -bottom-6 opacity-10 group-hover:opacity-20 transition-opacity">
            <ArrowUpRight className="h-40 w-40 text-emerald-400" />
          </div>
          <div className="relative z-10 flex items-center justify-between">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider">
                🟢 Reposição / Compra
              </span>
              <h2 className="text-2xl font-black text-white group-hover:text-emerald-300 transition-colors">
                + REGISTRAR ENTRADA
              </h2>
              <p className="text-xs text-zinc-400 max-w-sm">
                Adicionar mais cones de linha, rolos de entretela ou peças compradas ao saldo.
              </p>
            </div>
            <div className="h-14 w-14 rounded-2xl bg-emerald-500 text-black flex items-center justify-center font-black shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform shrink-0">
              <ArrowUpRight className="h-8 w-8 stroke-[3]" />
            </div>
          </div>
        </button>

        {/* Botão Gigante 2: REGISTRAR SAÍDA / BAIXA */}
        <button
          onClick={() => openMovementModal('out')}
          className="group relative overflow-hidden p-6 rounded-3xl border border-rose-500/40 bg-gradient-to-br from-rose-950/40 via-rose-900/20 to-black/60 hover:border-rose-400 transition-all shadow-xl hover:shadow-rose-950/50 text-left active:scale-[0.99]"
        >
          <div className="absolute -right-6 -bottom-6 opacity-10 group-hover:opacity-20 transition-opacity">
            <ArrowDownRight className="h-40 w-40 text-rose-400" />
          </div>
          <div className="relative z-10 flex items-center justify-between">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-black uppercase tracking-wider">
                🔴 Consumo na Produção / Perda
              </span>
              <h2 className="text-2xl font-black text-white group-hover:text-rose-300 transition-colors">
                - REGISTRAR SAÍDA / BAIXA
              </h2>
              <p className="text-xs text-zinc-400 max-w-sm">
                Dar baixa em materiais utilizados em um pedido, testes ou descartes.
              </p>
            </div>
            <div className="h-14 w-14 rounded-2xl bg-rose-500 text-white flex items-center justify-center font-black shadow-lg shadow-rose-500/30 group-hover:scale-110 transition-transform shrink-0">
              <ArrowDownRight className="h-8 w-8 stroke-[3]" />
            </div>
          </div>
        </button>
      </div>

      {/* Grid de KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total de Itens */}
        <div className="glass-panel p-5 rounded-3xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
              Insumos Cadastrados
            </span>
            <p className="text-2xl font-black text-white mt-1">{totalItemsCount}</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Em todas as categorias</p>
          </div>
          <div className="h-10 w-10 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
            <Package className="h-5 w-5" />
          </div>
        </div>

        {/* Alerta de Estoque Mínimo */}
        <div
          onClick={() => setOnlyLowStock(!onlyLowStock)}
          className={`glass-panel p-5 rounded-3xl border transition-all cursor-pointer flex items-center justify-between ${
            lowStockCount > 0
              ? 'border-amber-500/40 bg-amber-500/5 hover:border-amber-400'
              : 'border-white/10'
          }`}
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Estoque Crítico / Baixo
            </span>
            <p className="text-2xl font-black text-amber-400 mt-1">{lowStockCount} item(s)</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {onlyLowStock ? 'Clique para ver todos' : 'Clique para filtrar itens críticos'}
            </p>
          </div>
          <div className="h-10 w-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
            {lowStockCount}
          </div>
        </div>

        {/* Total Movimentações */}
        <div className="glass-panel p-5 rounded-3xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
              Histórico de Movimentos
            </span>
            <p className="text-2xl font-black text-white mt-1">{totalMovementsMonth}</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Entradas e baixas registradas</p>
          </div>
          <div className="h-10 w-10 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
            <History className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Tabs NAVEGAÇÃO: Saldo Atual vs Histórico */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`px-4 py-2 rounded-2xl text-xs font-black transition-all ${
              activeTab === 'inventory'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            📦 Saldo Atual do Estoque ({filteredItems.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-2xl text-xs font-black transition-all ${
              activeTab === 'history'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            📜 Log de Movimentações ({movements.length})
          </button>
        </div>
      </div>

      {/* CONTEÚDO TAB 1: SALDO ATUAL DO ESTOQUE */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          
          {/* Barra de Filtros e Busca */}
          <div className="glass-panel p-4 rounded-3xl border border-white/10 flex flex-col md:flex-row items-center justify-between gap-3">
            
            {/* Categorias */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  selectedCategory === 'all'
                    ? 'bg-white text-black shadow-md'
                    : 'bg-white/5 text-zinc-400 hover:text-white'
                }`}
              >
                Todas
              </button>
              {Object.entries(categoryLabels).map(([key, cat]) => (
                <button
                  key={key}
                  onClick={() => setSelectedCategory(key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    selectedCategory === key
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'bg-white/5 text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>

            {/* Input de Busca */}
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar por nome ou cor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Tabela de Insumos */}
          <div className="glass-panel rounded-3xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 font-bold uppercase text-[10px] text-zinc-400">
                    <th className="px-6 py-4">Insumo / Material</th>
                    <th className="px-6 py-4">Categoria</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-right">Saldo Atual</th>
                    <th className="px-6 py-4 text-right">Custo Un.</th>
                    <th className="px-6 py-4 text-center">Ações Rápidas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-medium text-zinc-200">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
                        Nenhum insumo encontrado. Crie um novo item ou limpe os filtros.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const isLow = item.quantity <= item.min_quantity;
                      const isZero = item.quantity === 0;

                      return (
                        <tr key={item.id} className="hover:bg-white/5 transition-colors">
                          
                          {/* Nome & detalhes */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {item.color_code && (
                                <div
                                  className="h-4 w-4 rounded-full border border-white/20 shrink-0 shadow-sm"
                                  style={{ backgroundColor: item.color_code.startsWith('#') ? item.color_code : '#6b7280' }}
                                  title={`Código: ${item.color_code}`}
                                />
                              )}
                              <div>
                                <p className="font-bold text-white text-sm">{item.name}</p>
                                {item.notes && (
                                  <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-1">{item.notes}</p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Categoria */}
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-zinc-300">
                              <span>{categoryLabels[item.category]?.icon || '📦'}</span>
                              <span>{categoryLabels[item.category]?.label || item.category}</span>
                            </span>
                          </td>

                          {/* Status Mínimo */}
                          <td className="px-6 py-4 text-center">
                            {isZero ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-black">
                                🔴 Esgotado
                              </span>
                            ) : isLow ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-black">
                                ⚠️ Estoque Baixo (Mín: {item.min_quantity})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                                🟢 OK
                              </span>
                            )}
                          </td>

                          {/* Saldo Atual */}
                          <td className="px-6 py-4 text-right">
                            <p className="text-base font-black text-white">
                              {item.quantity} <span className="text-xs font-normal text-zinc-400">{item.unit}(s)</span>
                            </p>
                          </td>

                          {/* Preço de Custo */}
                          <td className="px-6 py-4 text-right font-bold text-zinc-400">
                            {item.cost_price
                              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.cost_price)
                              : '—'}
                          </td>

                          {/* Ações Rápidas por Item */}
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Botão Entrada Rápida */}
                              <button
                                onClick={() => openMovementModal('in', item)}
                                title="Adicionar Entrada"
                                className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-black transition-all active:scale-95"
                              >
                                <ArrowUpRight className="h-4 w-4" />
                              </button>

                              {/* Botão Baixa Rápida */}
                              <button
                                onClick={() => openMovementModal('out', item)}
                                title="Dar Baixa / Saída"
                                className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all active:scale-95"
                              >
                                <ArrowDownRight className="h-4 w-4" />
                              </button>

                              {/* Botão Excluir */}
                              <button
                                onClick={() => handleDeleteItem(item.id, item.name)}
                                title="Excluir Insumo"
                                className="p-2 rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-white/10 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>

                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CONTEÚDO TAB 2: LOG DE MOVIMENTAÇÕES */}
      {activeTab === 'history' && (
        <div className="glass-panel rounded-3xl border border-white/10 overflow-hidden space-y-4 p-5">
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <History className="h-4 w-4 text-purple-400" />
            Histórico Completo de Entradas e Baixas
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 font-bold uppercase text-[10px] text-zinc-400">
                  <th className="px-4 py-3">Data / Hora</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Insumo</th>
                  <th className="px-4 py-3 text-right">Qtd</th>
                  <th className="px-4 py-3">Motivo / Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium text-zinc-200">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                      Nenhuma movimentação registrada ainda.
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => (
                    <tr key={m.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-zinc-400 font-mono">
                        {format(new Date(m.date), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                      </td>
                      <td className="px-4 py-3">
                        {m.type === 'in' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black">
                            <ArrowUpRight className="h-3 w-3" /> Entrada
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-black">
                            <ArrowDownRight className="h-3 w-3" /> Baixa / Saída
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold text-white">{m.item_name}</td>
                      <td className={`px-4 py-3 text-right font-black ${m.type === 'in' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {m.type === 'in' ? `+${m.quantity}` : `-${m.quantity}`}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{m.reason}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Entrada / Saída de Estoque */}
      <StockMovementModal
        isOpen={isMovementModalOpen}
        onClose={() => setIsMovementModalOpen(false)}
        type={movementType}
        preselectedItem={preselectedItem}
        items={items}
        onSubmitMovement={handleMovementSubmit}
      />

      {/* Modal de Novo Insumo */}
      <CreateItemModal
        isOpen={isCreateItemModalOpen}
        onClose={() => setIsCreateItemModalOpen(false)}
        onCreateItem={handleCreateItem}
      />
    </div>
  );
};
