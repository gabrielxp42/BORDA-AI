import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProfileProvider } from '@/contexts/ProfileContext';
import { CompanySettingsProvider } from '@/contexts/CompanySettingsContext';
import { PricingProvider } from '@/contexts/PricingContext';
import { PricingRulesModal } from '@/components/pricing/PricingRulesModal';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

import { AppLayout } from '@/components/layout/AppLayout';
import { Dashboard } from '@/pages/Dashboard';
import { Matrizes } from '@/pages/Matrizes';
import { Calculadora } from '@/pages/Calculadora';
import { Clientes } from '@/pages/Clientes';
import { Pedidos } from '@/pages/Pedidos';
import { Maquinas } from '@/pages/Maquinas';
import { Configuracoes } from '@/pages/Configuracoes';
import { Faturamento } from '@/pages/Faturamento';
import { Estoque } from '@/pages/Estoque';
import { PerfilConfig } from '@/pages/PerfilConfig';
import { GabiAutomations } from '@/pages/GabiAutomations';
import { CobrancasHub } from '@/pages/CobrancasHub';
import { Admin } from '@/pages/Admin';
import { Login } from '@/pages/Login';

import { Toaster } from 'sonner';
import { TaskDock } from '@/components/TaskDock';
import { CloudSyncModal } from '@/components/ui/CloudSyncModal';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <CompanySettingsProvider>
        <ProfileProvider>
          <PricingProvider>
            <Toaster theme="dark" position="top-right" richColors toastOptions={{ style: { zIndex: 999999999 } }} />
            <PricingRulesModal />
            <BrowserRouter>
              <Routes>
                {/* Rota Pública: Tela de Login / Cadastro */}
                <Route path="/login" element={<Login />} />

                {/* Rotas Protegidas do ERP */}
                <Route
                  path="/*"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary area="Sistema">
                      <AppLayout>
                        <CloudSyncModal />
                        <TaskDock />
                        <Routes>
                          <Route path="/" element={<Dashboard />} />
                          <Route path="/gabi" element={<GabiAutomations />} />
                          <Route path="/matrizes" element={<Matrizes />} />
                          <Route path="/calculadora" element={<Calculadora />} />
                          <Route path="/clientes" element={<Clientes />} />
                          <Route path="/pedidos" element={<Pedidos />} />
                          <Route path="/pedidos-kanban" element={<Pedidos />} />
                          <Route path="/estoque" element={<Estoque />} />
                          <Route path="/faturamento" element={<Faturamento />} />
                          <Route path="/cobrancas" element={<CobrancasHub />} />
                          <Route path="/relatorios" element={<Faturamento />} />
                          <Route path="/maquinas" element={<Maquinas />} />
                          <Route path="/configuracoes" element={<Configuracoes />} />
                          <Route path="/perfil" element={<PerfilConfig />} />
                          <Route path="/admin" element={<Admin />} />
                        </Routes>
                      </AppLayout>
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </BrowserRouter>
          </PricingProvider>
        </ProfileProvider>
      </CompanySettingsProvider>
    </AuthProvider>
  );
};

export default App;
