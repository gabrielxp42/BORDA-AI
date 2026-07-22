import React, { useState } from 'react';
import { Cpu, Plus, CheckCircle2, AlertTriangle, Activity } from 'lucide-react';
import { Machine } from '@/types/borda';

const mockMachines: Machine[] = [
  { id: 'm1', name: 'Bordadeira Tajima 01', brand: 'Tajima', model: 'TME-DX', heads_count: 6, speed_rpm: 850, status: 'active', notes: 'Produção rápida', created_at: '' },
  { id: 'm2', name: 'Bordadeira Barudan 02', brand: 'Barudan', model: 'BEXY-Z', heads_count: 8, speed_rpm: 1000, status: 'active', notes: 'Jaquetas e peito', created_at: '' },
  { id: 'm3', name: 'Bordadeira Brother Single', brand: 'Brother', model: 'PR-1055X', heads_count: 1, speed_rpm: 700, status: 'maintenance', notes: 'Troca de agulha em andamento', created_at: '' },
];

export const Maquinas: React.FC = () => {
  const [machines, setMachines] = useState<Machine[]>(mockMachines);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
            <Cpu className="h-6 w-6 text-purple-400" /> Bordadeiras & Máquinas
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Controle do parque de máquinas industriais de bordado (cabeças, RPM e status de manutenção).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {machines.map((m) => (
          <div key={m.id} className="glass-card p-5 rounded-3xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-sm text-white">{m.name}</h3>
                <p className="text-xs text-zinc-400 font-medium">{m.brand} {m.model}</p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase flex items-center gap-1 border ${
                  m.status === 'active'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                }`}
              >
                {m.status === 'active' ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {m.status === 'active' ? 'Operacional' : 'Manutenção'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-white/5 p-3 rounded-2xl border border-white/5 text-xs">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Cabeças</span>
                <span className="font-black text-purple-300">{m.heads_count} Cabeças</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Velocidade</span>
                <span className="font-bold text-zinc-200">{m.speed_rpm} RPM</span>
              </div>
            </div>

            {m.notes && <p className="text-xs text-zinc-400 italic">"{m.notes}"</p>}
          </div>
        ))}
      </div>
    </div>
  );
};
