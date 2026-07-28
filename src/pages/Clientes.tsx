import React, { useState, useEffect } from 'react';
import { Users, Plus, Search, Phone, Mail, Building, Repeat, Trash2, ChevronRight, Pencil, Clock, CheckCircle2 } from 'lucide-react';
import { Client } from '@/types/borda';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { CreateClientModal } from '@/components/clients/CreateClientModal';
import { ClientDetailsModal } from '@/components/clients/ClientDetailsModal';
import { toast } from 'sonner';

export const Clientes: React.FC = () => {
  const { settings } = useCompanySettings();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientPendingMap, setClientPendingMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null);
  const [selectedClientForDetails, setSelectedClientForDetails] = useState<Client | null>(null);

  useEffect(() => {
    fetchClients();

    const channel = supabase
      .channel('realtime-clients-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => {
        fetchClients();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || '246afa29-5a6b-4671-ade1-eb7d19ab3a9d';

      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (clientsError) throw clientsError;

      // Busca ordens para calcular saldo pendente por cliente
      const { data: ordersData } = await supabase
        .from('orders')
        .select('client_id, total_amount, payment_status')
        .eq('user_id', userId);

      const pendingMap: Record<string, number> = {};
      (ordersData || []).forEach((o: any) => {
        if (!o.client_id) return;
        const amt = Number(o.total_amount || 0);
        if (o.payment_status === 'pending') {
          pendingMap[o.client_id] = (pendingMap[o.client_id] || 0) + amt;
        } else if (o.payment_status === 'half_paid') {
          pendingMap[o.client_id] = (pendingMap[o.client_id] || 0) + (amt * 0.5);
        }
      });

      setClientPendingMap(pendingMap);
      setClients((clientsData as Client[]) || []);
    } catch (err: any) {
      console.error('Erro ao carregar clientes:', err);
      toast.error('Erro ao carregar lista de clientes.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClient = async (id: string, name: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o cliente "${name}"?`)) return;

    try {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
      toast.success(`Cliente "${name}" removido.`);
      setClients(prev => prev.filter(c => c.id !== id));
      if (selectedClientForDetails?.id === id) {
        setSelectedClientForDetails(null);
      }
    } catch (err: any) {
      console.error('Erro ao excluir cliente:', err);
      toast.error('Erro ao excluir cliente: ' + err.message);
    }
  };

  const filteredClients = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Users className="h-6 w-6" style={{ color: settings.primaryColor }} /> Clientes & CRM
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Clique no card do cliente para abrir a Ficha CRM completa, cobranças e histórico de bordados.
          </p>
        </div>
        <button
          onClick={() => {
            setClientToEdit(null);
            setIsCreateModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-white font-bold text-xs shadow-lg hover:brightness-110 transition-all active:scale-95"
          style={{
            backgroundColor: settings.primaryColor,
            boxShadow: `0 4px 14px ${settings.primaryColor}40`,
          }}
        >
          <Plus className="h-4 w-4" /> Cadastrar Cliente
        </button>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por nome do cliente, empresa ou telefone..."
          className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-slate-900 dark:text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
        />
      </div>

      {/* States */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div
            className="h-10 w-10 rounded-2xl flex items-center justify-center animate-pulse"
            style={{ backgroundColor: `${settings.primaryColor}20` }}
          >
            <Users className="h-5 w-5" style={{ color: settings.primaryColor }} />
          </div>
          <p className="text-xs text-zinc-400 font-medium">Carregando lista de clientes...</p>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-3xl border-2 border-dashed border-slate-300 dark:border-white/10">
          <Users className="h-10 w-10 text-zinc-600" />
          <p className="text-sm font-bold text-slate-500 dark:text-zinc-400">
            {searchTerm ? 'Nenhum cliente encontrado para essa busca' : 'Nenhum cliente cadastrado ainda'}
          </p>
          <p className="text-xs text-zinc-500">
            Clique no botão acima para registrar o primeiro cliente.
          </p>
        </div>
      ) : (
        /* Grid de Cards dos Clientes (Clicáveis para abrir CRM) */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredClients.map((c) => (
            <div 
              key={c.id} 
              onClick={() => setSelectedClientForDetails(c)}
              className="glass-card p-5 rounded-3xl space-y-4 group relative cursor-pointer hover:border-purple-500/40 hover:scale-[1.01] transition-all shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="h-11 w-11 rounded-2xl flex items-center justify-center font-black text-base border transition-transform group-hover:scale-105 shrink-0"
                    style={{
                      backgroundColor: `${settings.primaryColor}15`,
                      borderColor: `${settings.primaryColor}30`,
                      color: settings.primaryColor,
                    }}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate flex items-center gap-1">
                      {c.name}
                      <ChevronRight className="h-3.5 w-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h3>
                    <p className="text-xs font-medium flex items-center gap-1 mt-0.5" style={{ color: settings.primaryColor }}>
                      <Building className="h-3 w-3" /> {c.company_name || 'Particular'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {c.is_recurring && (
                    <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                      <Repeat className="h-3 w-3" /> Recorrente
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setClientToEdit(c);
                      setIsCreateModalOpen(true);
                    }}
                    title="Editar cliente"
                    className="p-1.5 rounded-xl text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteClient(c.id, c.name);
                    }}
                    title="Excluir cliente"
                    className="p-1.5 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600 dark:text-zinc-400 border-t border-slate-200 dark:border-white/5 pt-3">
                {c.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-zinc-500" />
                    <span>{c.phone}</span>
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-zinc-500" />
                    <span className="truncate">{c.email}</span>
                  </div>
                )}
                {c.notes && (
                  <p className="text-[11px] text-slate-500 dark:text-zinc-500 italic mt-1 leading-snug line-clamp-2">
                    "{c.notes}"
                  </p>
                )}
              </div>

              {/* Badge de Pendência Financeira com a Cor Principal da Marca do Usuário */}
              <div className="pt-2.5 flex items-center justify-between border-t border-slate-200/60 dark:border-white/5">
                <span className="text-[10px] font-black text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                  Saldo Financeiro:
                </span>
                {clientPendingMap[c.id] && clientPendingMap[c.id] > 0 ? (
                  <span 
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border shadow-sm animate-pulse"
                    style={{
                      backgroundColor: `${settings.primaryColor}15`,
                      borderColor: `${settings.primaryColor}50`,
                      color: settings.primaryColor,
                    }}
                  >
                    <Clock className="h-3.5 w-3.5 stroke-[2.5]" />
                    Pendente: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(clientPendingMap[c.id])}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3" /> Conta em Dia
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal CRM de Detalhes do Cliente */}
      <ClientDetailsModal
        isOpen={!!selectedClientForDetails}
        onClose={() => setSelectedClientForDetails(null)}
        client={selectedClientForDetails}
        onDeleteClient={handleDeleteClient}
        onEditClient={(clientToEditObj) => {
          setClientToEdit(clientToEditObj);
          setIsCreateModalOpen(true);
        }}
      />

      {/* Modal de Cadastro/Edição de Cliente */}
      <CreateClientModal
        isOpen={isCreateModalOpen}
        clientToEdit={clientToEdit}
        onClose={() => {
          setIsCreateModalOpen(false);
          setClientToEdit(null);
        }}
        onClientCreated={(updatedClient) => {
          fetchClients();
          if (selectedClientForDetails?.id === updatedClient.id) {
            setSelectedClientForDetails(updatedClient);
          }
          setIsCreateModalOpen(false);
          setClientToEdit(null);
        }}
      />
    </div>
  );
};
