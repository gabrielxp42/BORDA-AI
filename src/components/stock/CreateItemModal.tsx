import React, { useState } from 'react';
import { X, Plus, Package, Layers } from 'lucide-react';
import { StockItem, StockCategory } from '@/types/stockTypes';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { toast } from 'sonner';

interface CreateItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateItem: (item: Omit<StockItem, 'id' | 'created_at' | 'updated_at'>) => void;
}

export const CreateItemModal: React.FC<CreateItemModalProps> = ({
  isOpen,
  onClose,
  onCreateItem,
}) => {
  const { settings } = useCompanySettings();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<StockCategory>('linhas');
  const [unit, setUnit] = useState('cone');
  const [quantity, setQuantity] = useState<number | ''>(10);
  const [minQuantity, setMinQuantity] = useState<number | ''>(3);
  const [costPrice, setCostPrice] = useState<number | ''>('');
  const [colorCode, setColorCode] = useState('');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Informe o nome do insumo.');
      return;
    }

    onCreateItem({
      name: name.trim(),
      category,
      unit,
      quantity: Number(quantity) || 0,
      min_quantity: Number(minQuantity) || 0,
      cost_price: costPrice === '' ? undefined : Number(costPrice),
      color_code: colorCode.trim() || undefined,
      notes: notes.trim() || undefined,
    });

    toast.success('Insumo cadastrado no estoque!');
    onClose();
    setName('');
    setColorCode('');
    setNotes('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto custom-scrollbar rounded-t-3xl sm:rounded-3xl border border-white/10 bg-[#0d0d14] shadow-2xl p-5 sm:p-6 space-y-5 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center font-black">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">Cadastrar Novo Insumo</h3>
              <p className="text-xs text-zinc-400">Linhas, entretelas, peças em branco, agulhas e embalagens</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Nome do Item */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              Nome do Insumo / Material *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Linha Lumina 2004 Amarelo Ouro"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
              required
            />
          </div>

          {/* Grid Categoria & Unidade */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Categoria *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as StockCategory)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
              >
                <option value="linhas" className="bg-[#111118]">🧵 Linhas de Bordado</option>
                <option value="entretelas" className="bg-[#111118]">📜 Entretelas</option>
                <option value="pecas" className="bg-[#111118]">👕 Peças em Branco / Vestuário</option>
                <option value="agulhas" className="bg-[#111118]">🪡 Agulhas & Consumíveis</option>
                <option value="embalagens" className="bg-[#111118]">📦 Embalagens & Sacos</option>
                <option value="outros" className="bg-[#111118]">⚙️ Outros</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Unidade de Medida *
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
              >
                <option value="cone" className="bg-[#111118]">Cone(s)</option>
                <option value="metro" className="bg-[#111118]">Metro(s)</option>
                <option value="rolo" className="bg-[#111118]">Rolo(s)</option>
                <option value="unidade" className="bg-[#111118]">Unidade(s)</option>
                <option value="caixa" className="bg-[#111118]">Caixa(s)</option>
                <option value="pacote" className="bg-[#111118]">Pacote(s)</option>
              </select>
            </div>
          </div>

          {/* Grid Quantidade Inicial & Estoque Mínimo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Quantidade Inicial em Saldo
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ex: 10"
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Estoque Mínimo (Alerta de Reposição)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ex: 3"
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm font-bold text-amber-400 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
          </div>

          {/* Código de Cor & Preço de Custo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Código / Pantone da Cor (Linhas)
              </label>
              <input
                type="text"
                value={colorCode}
                onChange={(e) => setColorCode(e.target.value)}
                placeholder="Ex: #2004 ou Lumina-2004"
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Custo Unitário (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ex: 18.50"
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="pt-3">
            <button
              type="submit"
              className="w-full py-3.5 rounded-2xl font-black text-sm text-white shadow-xl hover:brightness-110 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              style={{ backgroundColor: settings.primaryColor }}
            >
              <Plus className="h-4 w-4" />
              <span>Cadastrar Insumo no Estoque</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
