import React, { useState, useEffect } from 'react';
import { X, ArrowDownRight, ArrowUpRight, Check, Package, AlertCircle } from 'lucide-react';
import { StockItem, MovementType } from '@/types/stockTypes';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { toast } from 'sonner';

interface StockMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: MovementType; // 'in' | 'out'
  preselectedItem?: StockItem | null;
  items: StockItem[];
  onSubmitMovement: (itemId: string, type: MovementType, quantity: number, reason: string) => void;
}

export const StockMovementModal: React.FC<StockMovementModalProps> = ({
  isOpen,
  onClose,
  type,
  preselectedItem,
  items,
  onSubmitMovement,
}) => {
  const { settings } = useCompanySettings();

  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [quantity, setQuantity] = useState<number | ''>(1);
  const [reason, setReason] = useState<string>('');

  useEffect(() => {
    if (preselectedItem) {
      setSelectedItemId(preselectedItem.id);
    } else if (items.length > 0) {
      setSelectedItemId(items[0].id);
    }
  }, [preselectedItem, items, isOpen]);

  if (!isOpen) return null;

  const currentItem = items.find((i) => i.id === selectedItemId) || preselectedItem;
  const isIn = type === 'in';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId) {
      toast.error('Selecione um item do estoque.');
      return;
    }
    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Informe uma quantidade válida maior que zero.');
      return;
    }
    if (!isIn && currentItem && qty > currentItem.quantity) {
      toast.error(`Estoque insuficiente! Saldo atual: ${currentItem.quantity} ${currentItem.unit}(s)`);
      return;
    }

    const finalReason = reason.trim() || (isIn ? 'Entrada manual de estoque' : 'Consumo / Baixa de produção');
    onSubmitMovement(selectedItemId, type, qty, finalReason);
    onClose();
    setQuantity(1);
    setReason('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md max-h-[90dvh] overflow-y-auto custom-scrollbar rounded-t-3xl sm:rounded-3xl border border-white/10 bg-[#0d0d14] shadow-2xl p-5 sm:p-6 space-y-5 animate-in zoom-in-95 duration-200">
        
        {/* Header com indicador de ação */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div
              className={`h-11 w-11 rounded-2xl flex items-center justify-center font-black ${
                isIn
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}
            >
              {isIn ? <ArrowUpRight className="h-6 w-6" /> : <ArrowDownRight className="h-6 w-6" />}
            </div>
            <div>
              <h3 className="text-lg font-black text-white">
                {isIn ? '⚡ Nova Entrada de Estoque' : '📉 Registrar Saída / Baixa'}
              </h3>
              <p className="text-xs text-zinc-400">
                {isIn ? 'Adicionar insumos ao saldo disponível' : 'Dar baixa por consumo, perda ou teste'}
              </p>
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
          
          {/* Seleção de Item */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              Item de Insumo *
            </label>
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
            >
              {items.map((item) => (
                <option key={item.id} value={item.id} className="bg-[#111118] text-white">
                  {item.name} ({item.quantity} {item.unit}s em saldo)
                </option>
              ))}
            </select>
          </div>

          {/* Saldo Atual & prévia do novo saldo */}
          {currentItem && (
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-zinc-400 font-medium">
                <Package className="h-4 w-4 text-purple-400" />
                <span>Saldo Atual:</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">
                  {currentItem.quantity} {currentItem.unit}(s)
                </span>
                <span className="text-zinc-600">➔</span>
                <span
                  className={`font-black ${
                    isIn ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isIn
                    ? currentItem.quantity + (Number(quantity) || 0)
                    : Math.max(0, currentItem.quantity - (Number(quantity) || 0))}{' '}
                  {currentItem.unit}(s)
                </span>
              </div>
            </div>
          )}

          {/* Quantidade */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              Quantidade a {isIn ? 'Adicionar' : 'Retirar'} ({currentItem?.unit || 'unid'}) *
            </label>
            <input
              type="number"
              min="1"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="Ex: 5"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-base font-black text-white focus:outline-none focus:border-purple-500 transition-colors"
              required
            />
          </div>

          {/* Motivo / Observação */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              Motivo / Observação (Opcional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isIn ? 'Ex: Compra de lote N° 402' : 'Ex: Consumo no pedido #1040'}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              className={`w-full py-3.5 rounded-2xl font-black text-sm text-white shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                isIn
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:brightness-110 shadow-emerald-500/25'
                  : 'bg-gradient-to-r from-rose-600 to-amber-600 hover:brightness-110 shadow-rose-500/25'
              }`}
            >
              <Check className="h-4 w-4" />
              <span>{isIn ? 'Confirmar Entrada de Estoque' : 'Confirmar Baixa de Estoque'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
