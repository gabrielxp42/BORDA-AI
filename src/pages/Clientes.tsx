import React, { useState } from 'react';
import { Users, Plus, Search, Phone, Mail, Building, Repeat, Star } from 'lucide-react';
import { Client } from '@/types/borda';

const mockClients: Client[] = [
  {
    id: 'c1',
    name: 'Leonardo Araujo',
    company_name: 'VIRE Confecções',
    document: '12.345.678/0001-90',
    phone: '21 98888-7777',
    email: 'leonardo@vire.com.br',
    is_recurring: true,
    notes: 'Cliente de camisetas polo de alta quantidade.',
    created_at: '2026-07-20T10:00:00Z',
    updated_at: '2026-07-20T10:00:00Z',
  },
  {
    id: 'c2',
    name: 'Prefeitura do Rio de Janeiro',
    company_name: 'Secretaria de Saúde',
    document: '42.123.456/0001-10',
    phone: '21 97777-6666',
    email: 'compras@rio.rj.gov.br',
    is_recurring: true,
    notes: 'Uniformes institucionais e jalecos.',
    created_at: '2026-07-21T14:30:00Z',
    updated_at: '2026-07-21T14:30:00Z',
  },
];

export const Clientes: React.FC = () => {
  const [clients, setClients] = useState<Client[]>(mockClients);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const handleAddClient = (e: React.FormEvent) => {
    e.preventDefault();
    const newClient: Client = {
      id: String(Date.now()),
      name,
      company_name: companyName,
      phone,
      email,
      is_recurring: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setClients([newClient, ...clients]);
    setIsModalOpen(false);
    setName('');
    setCompanyName('');
    setPhone('');
    setEmail('');
  };

  const filteredClients = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
            <Users className="h-6 w-6 text-purple-400" /> Clientes & Empresas
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Gerencie contatos de clientes recorrentes para vinculação rápida às matrizes do Wilcom.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-xs shadow-lg shadow-purple-500/25 hover:brightness-110 transition-all"
        >
          <Plus className="h-4 w-4" /> Cadastrar Cliente
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por nome do cliente ou empresa..."
          className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-purple-500"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredClients.map((c) => (
          <div key={c.id} className="glass-card p-5 rounded-3xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center font-black text-purple-300">
                  {c.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">{c.name}</h3>
                  <p className="text-xs text-purple-300/80 font-medium flex items-center gap-1">
                    <Building className="h-3 w-3 text-purple-400" /> {c.company_name || 'Particular'}
                  </p>
                </div>
              </div>
              {c.is_recurring && (
                <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Repeat className="h-3 w-3" /> Recorrente
                </span>
              )}
            </div>

            <div className="space-y-1.5 text-xs text-zinc-400 border-t border-white/5 pt-3">
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-zinc-500" />
                <span>{c.phone}</span>
              </div>
              {c.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-zinc-500" />
                  <span>{c.email}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-panel p-6 rounded-3xl border border-white/10 w-full max-w-md space-y-4">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-400" /> Novo Cliente
            </h3>

            <form onSubmit={handleAddClient} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Ramon Bordados"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-xs text-white mt-1 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase">Empresa / Marca</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex: Confecções Ramon LTDA"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-xs text-white mt-1 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase">WhatsApp</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ex: 21 99999-8888"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-xs text-white mt-1 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold shadow-lg shadow-purple-500/20"
                >
                  Salvar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
