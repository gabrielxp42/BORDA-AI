import React, { useState } from 'react';
import { Users, X, Loader2, Building2, FileText, Phone, AlignLeft, Star } from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { Client } from '../../types/borda';
import { maskPhone, maskCpfCnpj } from '../../utils/masks';

import { createPortal } from 'react-dom';

interface CreateClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClientCreated: (client: Client) => void;
  initialName?: string;
}

export const CreateClientModal: React.FC<CreateClientModalProps> = ({ 
  isOpen, 
  onClose, 
  onClientCreated,
  initialName = ''
}) => {
  const [name, setName] = useState(initialName);
  const [companyName, setCompanyName] = useState('');
  const [documentStr, setDocumentStr] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Impede que o evento de submit suba para o formulário Pai no React Tree!
    
    if (!name.trim()) return;

    setIsSaving(true);
    setError(null);

    try {
      const { data, error: insertError } = await supabase
        .from('clients')
        .insert({
          name: name.trim(),
          company_name: companyName.trim() || null,
          document: documentStr.trim() || null,
          phone: phone.trim() || null,
          notes: notes.trim() || null,
          is_recurring: isRecurring
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (data) {
        onClientCreated(data as Client);
        setName('');
        setCompanyName('');
        setDocumentStr('');
        setPhone('');
        setNotes('');
        setIsRecurring(false);
        onClose();
      }
    } catch (err: any) {
      console.error("Erro ao criar cliente:", err);
      setError(err.message || "Erro desconhecido ao cadastrar cliente.");
    } finally {
      setIsSaving(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-[#0f0f13] border border-white/10 rounded-3xl overflow-hidden shadow-2xl shadow-black/80 flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between px-6 py-5 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
              <Users className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-wider">Novo Cliente</h2>
              <p className="text-xs text-zinc-400">Cadastre os dados essenciais do cliente para faturamento e produção.</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulário com Scroll em telas menores */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <form id="create-client-form" onSubmit={handleSave} className="space-y-6">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs font-bold text-red-400">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Nome do Contato */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <Users className="h-3 w-3" /> Nome do Contato *
                </label>
                <input 
                  type="text" 
                  autoFocus
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: João da Silva"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </div>

              {/* Empresa */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <Building2 className="h-3 w-3" /> Empresa / Marca
                </label>
                <input 
                  type="text" 
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex: Uniformes Silva Ltda"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </div>

              {/* WhatsApp */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <Phone className="h-3 w-3" /> WhatsApp / Telefone
                </label>
                <input 
                  type="text" 
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  placeholder="(00) 00000-0000"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </div>

              {/* CNPJ / CPF */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <FileText className="h-3 w-3" /> CPF / CNPJ (Para NFe)
                </label>
                <input 
                  type="text" 
                  value={documentStr}
                  onChange={(e) => setDocumentStr(maskCpfCnpj(e.target.value))}
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </div>
            </div>

            {/* Observações de Produção */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <AlignLeft className="h-3 w-3" /> Observações (Avisos de Produção)
              </label>
              <textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Cliente só usa linha marca Lumina. Muito exigente com prazo."
                rows={3}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500/50 resize-none custom-scrollbar"
              />
            </div>

            {/* Toggle: Cliente Recorrente */}
            <label className="flex items-center gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 cursor-pointer hover:bg-blue-500/15 transition-colors">
              <input 
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="w-5 h-5 rounded border-white/20 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 bg-black/50"
              />
              <div>
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-blue-400 fill-blue-400/20" />
                  <span className="text-sm font-bold text-white tracking-wide">Cliente Recorrente / Revenda</span>
                </div>
                <p className="text-xs text-blue-200/70 mt-0.5">
                  Marcando esta opção, o sistema pode aplicar tabelas de preços com desconto especial (atacado) no futuro.
                </p>
              </div>
            </label>

          </form>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-white/10 bg-white/5 flex justify-end gap-3 rounded-b-3xl">
          <button 
            type="button" 
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-300 transition-colors"
          >
            Cancelar
          </button>
          <button 
            form="create-client-form"
            type="submit" 
            disabled={isSaving || !name.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-lg shadow-blue-600/20"
          >
            {isSaving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
            ) : (
              "Salvar Cliente"
            )}
          </button>
        </div>

      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
