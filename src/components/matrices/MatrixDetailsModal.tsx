import React from 'react';
import { X, Layers, Download, Play, Clock, Hash, Maximize2, Tag, User, CheckCircle2 } from 'lucide-react';
import { Matrix } from '../../types/borda';
import { createPortal } from 'react-dom';
import { useCompanySettings } from '../../contexts/CompanySettingsContext';

interface MatrixDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  matrix: Matrix | null;
}

export const MatrixDetailsModal: React.FC<MatrixDetailsModalProps> = ({ isOpen, onClose, matrix }) => {
  if (!isOpen || !matrix) return null;
  const v = matrix.current_version;
  const { settings } = useCompanySettings();

  const modalContent = (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="w-full max-w-3xl bg-[#0f0f13] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row max-h-[90vh]"
        style={{ boxShadow: `0 20px 25px -5px ${settings.primaryColor}10` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Left Side - Preview (Mocked) */}
        <div className="md:w-5/12 bg-black/40 border-r border-white/5 flex flex-col items-center justify-center p-8 relative group">
          <div className="absolute top-4 left-4">
            <span className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 shadow-lg">
              <CheckCircle2 className="h-3.5 w-3.5" /> {v?.file_format?.toUpperCase()}
            </span>
          </div>
          
          <div className="w-full aspect-square border-2 border-dashed border-white/10 rounded-2xl flex items-center justify-center bg-black relative overflow-hidden group-hover:border-purple-500/50 transition-colors">
            {v?.preview_url ? (
              <img src={v.preview_url} alt="Preview" className="w-full h-full object-contain" />
            ) : (
              <>
                <Layers className="h-16 w-16 text-white/10 group-hover:text-purple-500/30 transition-colors" />
                <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <p className="absolute bottom-4 text-xs font-bold text-white/30 uppercase tracking-widest">Sem Preview Visual</p>
              </>
            )}
          </div>

          <div className="w-full flex gap-3 mt-6">
            <button 
              onClick={() => {
                if (v?.file_url) window.open(v.file_url, '_blank');
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-xs font-bold shadow-lg hover:opacity-90 transition-all"
              style={{ backgroundColor: settings.primaryColor, boxShadow: `0 4px 14px ${settings.primaryColor}40` }}
            >
              <Download className="h-4 w-4" /> Baixar
            </button>
            <button className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-500/30 transition-all">
              <Play className="h-4 w-4" /> Produzir
            </button>
          </div>
        </div>

        {/* Right Side - Details */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-white/5">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border"
                  style={{ color: settings.primaryColor, backgroundColor: `${settings.primaryColor}15`, borderColor: `${settings.primaryColor}30` }}>
                  {matrix.code}
                </span>
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                  V{v?.version_number || 1}
                </span>
              </div>
              <h2 className="text-xl font-black text-white tracking-tight">{matrix.name}</h2>
            </div>
            <button 
              onClick={onClose}
              className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 flex-1">
            
            {/* Infos Técnicas */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                <Layers className="h-3 w-3" /> Especificações Técnicas
              </h4>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Pontos (Stitches)</span>
                  <div className="flex items-end gap-1.5">
                    <Hash className="h-4 w-4 mb-0.5" style={{ color: settings.primaryColor }} />
                    <span className="text-lg font-black text-slate-900 dark:text-white leading-none">{v?.stitch_count.toLocaleString('pt-BR')}</span>
                  </div>
                </div>

                <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Dimensões (mm)</span>
                  <div className="flex items-end gap-1.5">
                    <Maximize2 className="h-4 w-4 text-emerald-400 mb-0.5" />
                    <span className="text-lg font-black text-white leading-none">{v?.width_mm} <span className="text-sm text-zinc-500 font-normal">x</span> {v?.height_mm}</span>
                  </div>
                </div>

                <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Qtd de Cores</span>
                  <div className="flex items-end gap-1.5">
                    <div className="flex -space-x-1 mb-0.5">
                      <div className="h-3 w-3 rounded-full bg-red-400 border border-black" />
                      <div className="h-3 w-3 rounded-full bg-blue-400 border border-black" />
                      <div className="h-3 w-3 rounded-full bg-yellow-400 border border-black" />
                    </div>
                    <span className="text-lg font-black text-white leading-none">{v?.color_count}</span>
                  </div>
                </div>

                <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Tempo de Máquina</span>
                  <div className="flex items-end gap-1.5">
                    <Clock className="h-4 w-4 text-blue-400 mb-0.5" />
                    <span className="text-lg font-black text-white leading-none">{v?.estimated_time_minutes} <span className="text-sm text-zinc-500 font-normal">min</span></span>
                  </div>
                </div>
              </div>
            </div>

            {/* Metadados Adicionais */}
            <div className="space-y-4 pt-4 border-t border-white/5">
              
              <div className="flex items-center gap-3 bg-white/5 px-4 py-3 rounded-2xl border border-white/5">
                <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center">
                  <User className="h-4 w-4 text-zinc-400" />
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-bold block">Cliente Vinculado</span>
                  <span className="text-sm font-bold text-white">{matrix.client?.name || "Sem cliente vinculado"}</span>
                </div>
              </div>

              {matrix.tags && matrix.tags.length > 0 && (
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-2">Tags / Categoria</span>
                  <div className="flex flex-wrap gap-2">
                    {matrix.tags.map(tag => (
                      <span key={tag} className="px-3 py-1 rounded-full bg-zinc-800 border border-white/10 text-[11px] text-zinc-300 font-medium flex items-center gap-1.5">
                        <Tag className="h-3 w-3 text-zinc-500" /> {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
