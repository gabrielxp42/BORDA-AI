import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Sparkles } from 'lucide-react';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#09090d] text-white space-y-4">
        <div className="h-12 w-12 rounded-2xl bg-purple-600 flex items-center justify-center animate-bounce shadow-lg shadow-purple-500/30">
          <Sparkles className="h-6 w-6 text-white animate-spin" />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Verificando Autenticação...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
