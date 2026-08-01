import React, { useState, useEffect, useRef } from 'react';
import { Search, Check, ChevronDown, UserPlus, Loader2, Phone } from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { Client } from '../../types/borda';
import { CreateClientModal } from '../clients/CreateClientModal';

interface ClientSelectProps {
  value: string;
  onChange: (clientId: string) => void;
  error?: boolean;
  shake?: boolean;
}

export const ClientSelect: React.FC<ClientSelectProps> = ({ value, onChange, error, shake }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const { data, error: sbError } = await supabase
        .from('clients')
        .select('*')
        .order('name');
      
      if (sbError) throw sbError;
      if (data) setClients(data as Client[]);
    } catch (err) {
      console.error("Erro ao buscar clientes:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const filteredClients = clients.filter(c => {
    const query = search.toLowerCase().trim();
    if (!query) return true;
    const phoneDigits = (c.phone || '').replace(/\D/g, '');
    const searchDigits = query.replace(/\D/g, '');

    return (
      c.name.toLowerCase().includes(query) ||
      (c.company_name && c.company_name.toLowerCase().includes(query)) ||
      (c.phone && c.phone.toLowerCase().includes(query)) ||
      (searchDigits.length >= 3 && phoneDigits.includes(searchDigits))
    );
  });

  const selectedClient = clients.find(c => c.id === value);

  const handleClientCreated = (newClient: Client) => {
    setClients(prev => [...prev, newClient].sort((a, b) => a.name.localeCompare(b.name)));
    onChange(newClient.id);
    setSearch('');
  };

  return (
    <>
      <div className="relative z-50" ref={dropdownRef}>
        <div 
          className={`w-full bg-slate-50 dark:bg-black/40 border ${error ? 'border-red-500 ring-2 ring-red-500/20 bg-red-500/10' : 'border-slate-200 dark:border-white/10'} rounded-2xl px-4 py-2.5 text-xs text-slate-900 dark:text-white flex items-center justify-between cursor-pointer hover:border-purple-500/50 transition-colors shadow-sm ${shake ? 'animate-shake' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="min-w-0 flex-1 pr-2">
            {loading ? (
              <span className="flex items-center gap-2 text-zinc-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando clientes...</span>
            ) : selectedClient ? (
              <div className="flex items-center gap-2 truncate">
                <span className="font-bold text-slate-900 dark:text-white truncate">{selectedClient.name}</span>
                {selectedClient.company_name && (
                  <span className="text-zinc-500 font-medium truncate">| {selectedClient.company_name}</span>
                )}
                {selectedClient.phone ? (
                  <span className="text-purple-600 dark:text-purple-300 font-bold shrink-0">
                    • 📞 {selectedClient.phone}
                  </span>
                ) : (
                  <span className="text-zinc-400 text-[11px] font-normal shrink-0">(sem telefone)</span>
                )}
              </div>
            ) : (
              <span className="text-zinc-500">Selecione um cliente...</span>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
        </div>

        {isOpen && (
          <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white dark:bg-[#12121a] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-2">
            <div className="p-2 border-b border-slate-100 dark:border-white/5 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <input 
                type="text"
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente por nome, empresa ou telefone..."
                className="w-full bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl pl-8 pr-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-500/50"
              />
            </div>
            
            <div className="max-h-56 overflow-y-auto custom-scrollbar p-1">
              {filteredClients.length > 0 ? (
                filteredClients.map(c => (
                  <div 
                    key={c.id}
                    className="px-3 py-2.5 text-xs text-slate-700 dark:text-zinc-300 hover:bg-purple-500/10 hover:text-purple-600 dark:hover:text-white rounded-xl cursor-pointer flex items-center justify-between group transition-colors my-0.5"
                    onClick={() => {
                      onChange(c.id);
                      setIsOpen(false);
                      setSearch('');
                    }}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-bold text-slate-900 dark:text-white truncate">{c.name}</span>
                        {c.company_name && (
                          <span className="text-zinc-500 text-[11px] truncate">| {c.company_name}</span>
                        )}
                      </div>
                      {c.phone ? (
                        <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1 mt-0.5">
                          📞 {c.phone}
                        </span>
                      ) : (
                        <span className="text-[10px] text-zinc-400 italic">
                          (Sem telefone cadastrado)
                        </span>
                      )}
                    </div>
                    {value === c.id && <Check className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0 ml-2" />}
                  </div>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-xs text-zinc-500">
                  Nenhum cliente encontrado.
                </div>
              )}
            </div>

            {/* Novo Cliente Button */}
            <div className="p-2 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-black/20">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setShowCreateModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-purple-600/10 hover:bg-purple-600/20 text-purple-600 dark:text-purple-400 text-xs font-bold transition-colors border border-purple-500/20 cursor-pointer"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Cadastrar "{search || 'Novo Cliente'}"
              </button>
            </div>
          </div>
        )}
      </div>

      <CreateClientModal 
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onClientCreated={handleClientCreated}
        initialName={search}
      />
    </>
  );
};

