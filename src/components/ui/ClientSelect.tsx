import React, { useState, useEffect, useRef } from 'react';
import { Search, Check, ChevronDown, UserPlus, Loader2 } from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { Client } from '../../types/borda';
import { CreateClientModal } from '../clients/CreateClientModal';

interface ClientSelectProps {
  value: string;
  onChange: (clientId: string) => void;
  error?: boolean;
}

export const ClientSelect: React.FC<ClientSelectProps> = ({ value, onChange, error }) => {
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

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  );

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
          className={`w-full bg-black/40 border ${error ? 'border-red-500' : 'border-white/10'} rounded-2xl px-4 py-2 text-xs text-white flex items-center justify-between cursor-pointer hover:border-purple-500/50 transition-colors`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className={selectedClient ? 'text-white' : 'text-zinc-500'}>
            {loading ? (
              <span className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Carregando clientes...</span>
            ) : (
              selectedClient?.name || "Selecione um cliente..."
            )}
          </span>
          <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>

        {isOpen && (
          <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-[#12121a] border border-white/10 rounded-2xl shadow-xl overflow-hidden animate-in slide-in-from-top-2">
            <div className="p-2 border-b border-white/5 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <input 
                type="text"
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente..."
                className="w-full bg-black/40 border border-white/5 rounded-xl pl-8 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50"
              />
            </div>
            
            <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
              {filteredClients.length > 0 ? (
                filteredClients.map(c => (
                  <div 
                    key={c.id}
                    className="px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 hover:text-white rounded-xl cursor-pointer flex items-center justify-between group transition-colors"
                    onClick={() => {
                      onChange(c.id);
                      setIsOpen(false);
                      setSearch('');
                    }}
                  >
                    <span>{c.name}</span>
                    {value === c.id && <Check className="h-3.5 w-3.5 text-purple-400" />}
                  </div>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-xs text-zinc-500">
                  Nenhum cliente encontrado.
                </div>
              )}
            </div>

            {/* Novo Cliente Button */}
            <div className="p-2 border-t border-white/5 bg-black/20">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setShowCreateModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-xs font-bold transition-colors border border-purple-500/20"
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
