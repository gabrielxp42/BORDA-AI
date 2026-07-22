import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from './AuthContext';
import { PricingRule } from '../types/borda';

const DEFAULT_PRICING_RULES = [
  { name: 'Base Milheiro de Pontos', rule_type: 'thousand_stitches', value: 0.65, display_order: 1, is_active: true },
  { name: 'Margem Operacional Padrao', rule_type: 'percent_addon', value: 20, display_order: 2, is_active: true },
  { name: 'Adicional 1 a 6 Cores', rule_type: 'color_percent', min_value: 1, max_value: 6, value: 20, display_order: 3, is_active: true },
  { name: 'Adicional 7 a 12 Cores', rule_type: 'color_percent', min_value: 7, max_value: 12, value: 30, display_order: 4, is_active: true },
  { name: 'Adicional Acima de 12 Cores', rule_type: 'color_percent', min_value: 13, max_value: 999, value: 40, display_order: 5, is_active: true },
  { name: 'Adicional Bastidor Grande', rule_type: 'percent_addon', value: 30, display_order: 6, is_active: true },
  { name: 'Adicional Laser', rule_type: 'fixed_addon', value: 0.5, display_order: 7, is_active: true },
  { name: 'Adicional Prensa', rule_type: 'fixed_addon', value: 0.5, display_order: 8, is_active: true },
  { name: 'Adicional Peca Pronta', rule_type: 'percent_addon', value: 50, display_order: 9, is_active: true },
  { name: 'Adicional Fringe', rule_type: 'percent_addon', value: 30, display_order: 10, is_active: true },
];

interface PricingContextType {
  rules: PricingRule[];
  loading: boolean;
  updateRule: (id: string, updates: Partial<PricingRule>) => Promise<boolean>;
  saveAllRules: (updatedRules: PricingRule[]) => Promise<boolean>;
  refreshRules: () => Promise<void>;
  isModalOpen: boolean;
  openPricingModal: () => void;
  closePricingModal: () => void;
}

const PricingContext = createContext<PricingContextType | undefined>(undefined);

export const PricingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const fetchRules = async () => {
    if (!user) {
      setRules([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pricing_rules')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        setRules(data as PricingRule[]);
      } else {
        // Se o usuário não possui regras cadastradas, insere as regras padrão
        const rulesToInsert = DEFAULT_PRICING_RULES.map(r => ({
          ...r,
          user_id: user.id
        }));

        const { data: inserted, error: insertError } = await supabase
          .from('pricing_rules')
          .insert(rulesToInsert)
          .select();

        if (insertError) {
          console.error("Erro ao clonar regras padrão:", insertError);
        } else if (inserted) {
          setRules(inserted as PricingRule[]);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar regras de precificação:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, [user]);

  const updateRule = async (id: string, updates: Partial<PricingRule>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('pricing_rules')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      setRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
      return true;
    } catch (err) {
      console.error("Erro ao atualizar regra:", err);
      return false;
    }
  };

  const saveAllRules = async (updatedRules: PricingRule[]): Promise<boolean> => {
    try {
      for (const rule of updatedRules) {
        await supabase
          .from('pricing_rules')
          .update({
            value: rule.value,
            is_active: rule.is_active,
            min_value: rule.min_value,
            max_value: rule.max_value
          })
          .eq('id', rule.id);
      }
      setRules(updatedRules);
      return true;
    } catch (err) {
      console.error("Erro ao salvar conjunto de regras:", err);
      return false;
    }
  };

  const openPricingModal = () => setIsModalOpen(true);
  const closePricingModal = () => setIsModalOpen(false);

  return (
    <PricingContext.Provider value={{
      rules,
      loading,
      updateRule,
      saveAllRules,
      refreshRules: fetchRules,
      isModalOpen,
      openPricingModal,
      closePricingModal
    }}>
      {children}
    </PricingContext.Provider>
  );
};

export const usePricing = () => {
  const context = useContext(PricingContext);
  if (!context) {
    throw new Error('usePricing deve ser usado dentro de um PricingProvider');
  }
  return context;
};
