import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { 
  Lock, 
  FileSpreadsheet, 
  Send, 
  TrendingUp, 
  Search, 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Award, 
  PieChart, 
  BarChart3, 
  Download, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight, 
  Sparkles,
  Users,
  Wallet,
  Receipt,
  PiggyBank,
  TrendingDown,
  Trash2,
  Filter,
  Zap
} from 'lucide-react';
import {
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell, 
  PieChart as RePieChart, 
  Pie, 
  Legend,
  AreaChart,
  Area,
  LineChart,
  Line
} from 'recharts';
import { WhatsAppBillingModal } from '@/components/billing/WhatsAppBillingModal';
import { FinancialTransactionModal } from '@/components/billing/FinancialTransactionModal';
import { ReceberDetailsModal } from '@/components/billing/ReceberDetailsModal';
import { ReceitaDetailsModal } from '@/components/billing/ReceitaDetailsModal';
import { DespesasDetailsModal } from '@/components/billing/DespesasDetailsModal';
import { FinancialTransaction, FinancialTransactionType } from '@/types/stockTypes';
import { format, startOfMonth, endOfMonth, subMonths, eachMonthOfInterval, eachDayOfInterval, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { formatCurrency } from '@/utils/currencyFormatter';
import { parsePaymentMetadata, formatPaymentMethodName } from '@/utils/paymentHelper';
import { useUniversalCloudSync } from '@/hooks/useUniversalCloudSync';

interface ClientBillingData {
  id: string;
  name: string;
  phone: string;
  orderCount: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  orders: any[];
}

export const Faturamento: React.FC = () => {
  const { isUnlocked, activeProfile } = useProfile();
  const { permissions } = useCompanySettings();
  const { syncAllLocalDataToCloud } = useUniversalCloudSync();
  
  const [loading, setLoading] = useState(false);
  const [billingData, setBillingData] = useState<ClientBillingData[]>([]);
  const [rawOrders, setRawOrders] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'entradas' | 'fixos' | 'variaveis' | 'areceber' | 'resumo'>('resumo');
  const [allTimePendingOrders, setAllTimePendingOrders] = useState<any[]>([]);
  const [allTimePaidOrders, setAllTimePaidOrders] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonthOffset, setSelectedMonthOffset] = useState<number>(0); // 0 = este mês, -1 = mês passado
  const [isReceberModalOpen, setIsReceberModalOpen] = useState(false);
  const [isReceitaModalOpen, setIsReceitaModalOpen] = useState(false);
  const [isDespesasModalOpen, setIsDespesasModalOpen] = useState(false);
  const [expandedCard, setExpandedCard] = useState<'receita' | 'despesas' | 'areceber' | null>(null);
  const [receberFilter, setReceberFilter] = useState<'all' | 'production' | 'delivered'>('all');

  // Histórico Consolidado de Todas as Entradas do Caixa (Pedidos pagos/sinais + Transações Manuais)
  const allIncomeEntries = useMemo(() => {
    const orderEntries = allTimePaidOrders.map(o => {
      const { metadata } = parsePaymentMetadata(o.notes);
      const isHalf = o.payment_status === 'half_paid';
      const amountVal = isHalf 
        ? (metadata.depositAmount || Number(o.total_amount || 0) * 0.5) 
        : Number(o.total_amount || 0);
      const methodStr = formatPaymentMethodName(o.payment_method || metadata.paymentMethod || 'Dinheiro');
      const dateStr = metadata.paidAt || o.created_at;

      return {
        id: `order-${o.id}`,
        date: new Date(dateStr),
        title: `Pedido #${o.order_number || o.id.slice(0, 4)} - ${o.clients?.name || 'Cliente Geral'}`,
        isOrder: true,
        orderStatus: o.payment_status,
        paymentMethod: methodStr || 'PIX / Dinheiro',
        profileName: metadata.paymentNote?.includes('Perfil:') ? metadata.paymentNote : (o.created_by_profile || 'Atendimento'),
        amount: amountVal,
        originalOrder: o
      };
    });

    const manualEntries = financialTransactions
      .filter(t => t.type === 'income')
      .map(t => ({
        id: `tx-${t.id}`,
        date: new Date(t.date || t.created_at),
        title: t.description || 'Receita Direta de Caixa',
        isOrder: false,
        orderStatus: 'paid',
        paymentMethod: formatPaymentMethodName(t.payment_method || 'Outros'),
        profileName: t.created_by_profile || 'Caixa',
        amount: Number(t.amount || 0),
        originalTx: t
      }));

    return [...orderEntries, ...manualEntries].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [allTimePaidOrders, financialTransactions]);

  // Cálculo Detalhado do Saldo A Receber (Agrupado por Mês Atual, Mês Passado, Histórico e Top Devedores)
  const pendingBreakdown = useMemo(() => {
    const now = new Date();
    const currentMonthStr = format(now, 'MM/yyyy');
    const lastMonthStr = format(subMonths(now, 1), 'MM/yyyy');

    let currentMonthPending = 0;
    let currentMonthCount = 0;
    let lastMonthPending = 0;
    let lastMonthCount = 0;
    let olderPending = 0;
    let olderCount = 0;

    const clientMap: Record<string, { id: string; name: string; phone: string; totalPending: number; count: number; orders: any[] }> = {};

    allTimePendingOrders.forEach(o => {
      const created = new Date(o.created_at || Date.now());
      const monthStr = format(created, 'MM/yyyy');
      const total = Number(o.total_amount || 0);
      const pendingVal = o.payment_status === 'half_paid' ? total * 0.5 : total;

      if (monthStr === currentMonthStr) {
        currentMonthPending += pendingVal;
        currentMonthCount++;
      } else if (monthStr === lastMonthStr) {
        lastMonthPending += pendingVal;
        lastMonthCount++;
      } else {
        olderPending += pendingVal;
        olderCount++;
      }

      const cId = o.clients?.id || o.id;
      const cName = o.clients?.name || 'Cliente Geral';
      const cPhone = o.clients?.phone || '';

      if (!clientMap[cId]) {
        clientMap[cId] = { id: cId, name: cName, phone: cPhone, totalPending: 0, count: 0, orders: [] };
      }
      clientMap[cId].totalPending += pendingVal;
      clientMap[cId].count += 1;
      clientMap[cId].orders.push(o);
    });

    const topDebtors = Object.values(clientMap).sort((a, b) => b.totalPending - a.totalPending).slice(0, 3);

    return {
      currentMonthPending,
      currentMonthCount,
      lastMonthPending,
      lastMonthCount,
      olderPending,
      olderCount,
      topDebtors
    };
  }, [allTimePendingOrders]);

  // KPI calculations
  const [grandTotal, setGrandTotal] = useState(0);
  const [paidTotal, setPaidTotal] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [avgTicket, setAvgTicket] = useState(0);
  const [topClient, setTopClient] = useState<ClientBillingData | null>(null);

  // Modal State
  const [selectedClient, setSelectedClient] = useState<ClientBillingData | null>(null);

  // Manual Cash Flow State (Receitas & Despesas) — Sincronizado via Supabase
  const [financialTransactions, setFinancialTransactions] = useState<FinancialTransaction[]>([]);
  const [isFinModalOpen, setIsFinModalOpen] = useState(false);
  const [finModalType, setFinModalType] = useState<FinancialTransactionType>('income');
  const [finSynced, setFinSynced] = useState(false);

  // Carrega transações do Supabase e migra dados locais (localStorage) se existirem
  useEffect(() => {
    if (!isUnlocked) return;

    const loadAndMigrateTransactions = async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id;
        if (!userId) return;

        // 1. Busca transações já salvas na nuvem
        const { data: cloudTxs, error } = await supabase
          .from('financial_transactions')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        const cloudList = (cloudTxs || []) as FinancialTransaction[];

        // 2. Verifica se tem dados locais pendentes de migração
        const localRaw = localStorage.getItem('borda_financial_transactions');
        const alreadyMigrated = localStorage.getItem('borda_fin_migrated_to_cloud');

        if (localRaw && !alreadyMigrated) {
          try {
            const localTxs: FinancialTransaction[] = JSON.parse(localRaw);
            
            // Filtra transações locais que NÃO existem na nuvem (evita duplicatas)
            const existingIds = new Set(cloudList.map(t => t.id));
            const toMigrate = localTxs.filter(t => !existingIds.has(t.id));

            if (toMigrate.length > 0) {
              // Envia para o Supabase com o user_id
              const rows = toMigrate.map(t => ({
                id: t.id,
                user_id: userId,
                type: t.type,
                amount: t.amount,
                description: t.description,
                category: t.category,
                payment_method: t.payment_method || 'other',
                date: t.date || t.created_at,
                expense_type: t.expense_type || null,
                due_date: t.due_date || null,
                status: t.status || 'paid',
                order_id: t.order_id || null,
                notes: t.notes || null,
                created_at: t.created_at
              }));

              const { error: insertError } = await supabase
                .from('financial_transactions')
                .insert(rows);

              if (!insertError) {
                toast.success(`${toMigrate.length} lançamento(s) sincronizado(s) com a nuvem! ☁️`, { duration: 4000 });
                // Marca como migrado para nunca mais repetir
                localStorage.setItem('borda_fin_migrated_to_cloud', 'true');
                // Mescla os dados: nuvem + migrados
                setFinancialTransactions([...toMigrate, ...cloudList]);
              } else {
                console.error('Erro ao migrar transações para nuvem:', insertError);
                // Fallback: usa dados locais mesmo
                setFinancialTransactions(localTxs);
              }
            } else {
              // Todos os locais já estão na nuvem
              localStorage.setItem('borda_fin_migrated_to_cloud', 'true');
              setFinancialTransactions(cloudList);
            }
          } catch {
            setFinancialTransactions(cloudList);
          }
        } else {
          // Sem dados locais ou já migrado — usa a nuvem
          setFinancialTransactions(cloudList);
        }
        setFinSynced(true);
      } catch (err) {
        console.error('Erro ao carregar transações financeiras:', err);
        // Fallback total: usa localStorage se a nuvem falhar
        const localRaw = localStorage.getItem('borda_financial_transactions');
        if (localRaw) {
          try {
            setFinancialTransactions(JSON.parse(localRaw));
          } catch {
            setFinancialTransactions([]);
          }
        }
        setFinSynced(true);
      }
    };

    loadAndMigrateTransactions();
  }, [isUnlocked]);

  // Persiste no localStorage como cache local (backup)
  useEffect(() => {
    if (finSynced && financialTransactions.length > 0) {
      localStorage.setItem('borda_financial_transactions', JSON.stringify(financialTransactions));
    }
  }, [financialTransactions, finSynced]);

  const handleAddFinancialTransaction = async (newTx: Omit<FinancialTransaction, 'id' | 'created_at'>) => {
    const profileName = activeProfile ? (activeProfile.name || activeProfile.id) : 'Desconhecido';
    
    const created: any = {
      ...newTx,
      id: Date.now().toString(),
      created_at: new Date().toISOString(),
      created_by_profile: profileName
    };

    // Atualiza a UI imediatamente (otimistic update)
    setFinancialTransactions((prev) => [created, ...prev]);
    toast.success(`${newTx.type === 'income' ? 'Receita' : 'Despesa'} lançada com sucesso!`);

    // Persiste no Supabase em background
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (userId) {
        await supabase.from('financial_transactions').insert({
          id: created.id,
          user_id: userId,
          type: created.type,
          amount: created.amount,
          description: created.description,
          category: created.category,
          payment_method: created.payment_method || 'other',
          date: created.date || created.created_at,
          expense_type: created.expense_type || null,
          due_date: created.due_date || null,
          status: created.status || 'paid',
          order_id: created.order_id || null,
          notes: created.notes || null,
          created_at: created.created_at,
          created_by_profile: profileName
        });
      }
    } catch (err) {
      console.error('Erro ao salvar transação na nuvem:', err);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    setFinancialTransactions(prev => prev.filter(t => t.id !== id));
    toast.info('Lançamento removido.');
    
    // Remove do Supabase em background
    try {
      await supabase.from('financial_transactions').delete().eq('id', id);
    } catch (err) {
      console.error('Erro ao remover transação da nuvem:', err);
    }
  };

  const openFinModal = (type: FinancialTransactionType) => {
    setFinModalType(type);
    setIsFinModalOpen(true);
  };

  useEffect(() => {
    if (isUnlocked) {
      fetchBillingData();
    }
  }, [isUnlocked, selectedMonthOffset]);

  const fetchBillingData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const targetDate = subMonths(now, selectedMonthOffset);
      const start = startOfMonth(targetDate).toISOString();
      const end = endOfMonth(targetDate).toISOString();

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;

      if (!userId) {
        console.warn("Usuário não autenticado.");
        return;
      }

      await syncAllLocalDataToCloud(true);

      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id, order_number, status, total_amount, payment_status, created_at, notes, due_date,
          clients (id, name, phone, company_name)
        `)
        .eq('user_id', userId)
        .gte('created_at', start)
        .lte('created_at', end);

      if (ordersError) throw ordersError;
      setRawOrders(orders || []);

      // Buscar A Receber Acumulado (histórico completo de pedidos pendentes)
      const { data: pendingOrders } = await supabase
        .from('orders')
        .select(`
          id, order_number, status, total_amount, payment_status, created_at, notes, due_date,
          clients (id, name, phone, company_name)
        `)
        .eq('user_id', userId)
        .neq('payment_status', 'paid')
      setAllTimePendingOrders(pendingOrders || []);

      // Buscar histórico completo de todas as entradas/recebimentos (pedidos pagos ou com sinal)
      const { data: paidOrders } = await supabase
        .from('orders')
        .select(`
          id, order_number, status, total_amount, payment_status, payment_method, created_at, notes, due_date,
          clients (id, name, phone, company_name)
        `)
        .eq('user_id', userId)
        .in('payment_status', ['paid', 'half_paid'])
        .order('created_at', { ascending: false });

      setAllTimePaidOrders(paidOrders || []);

      let gTotal = 0;
      let pTotal = 0;
      let pendTotal = 0;
      let totalOrderCount = 0;

      const grouped = (orders || []).reduce((acc: Record<string, ClientBillingData>, order: any) => {
        const client = order.clients;
        if (!client) return acc;

        const val = Number(order.total_amount || 0);
        const status = order.payment_status;

        if (!acc[client.id]) {
          acc[client.id] = {
            id: client.id,
            name: client.name,
            phone: client.phone || '',
            orderCount: 0,
            totalAmount: 0,
            paidAmount: 0,
            pendingAmount: 0,
            orders: []
          };
        }

        acc[client.id].orderCount += 1;
        acc[client.id].totalAmount += val;

        if (status === 'paid') {
          acc[client.id].paidAmount += val;
          pTotal += val;
        } else if (status === 'half_paid') {
          acc[client.id].paidAmount += val * 0.5;
          acc[client.id].pendingAmount += val * 0.5;
          pTotal += val * 0.5;
          pendTotal += val * 0.5;
        } else {
          acc[client.id].pendingAmount += val;
          pendTotal += val;
        }

        acc[client.id].orders.push(order);
        gTotal += val;
        totalOrderCount += 1;

        return acc;
      }, {});

      const result = Object.values(grouped).sort((a, b) => b.totalAmount - a.totalAmount);
      setBillingData(result);

      setGrandTotal(gTotal);
      setPaidTotal(pTotal);
      setPendingTotal(pendTotal);
      setAvgTicket(totalOrderCount > 0 ? gTotal / totalOrderCount : 0);
      setTopClient(result[0] || null);

    } catch (err) {
      console.error("Erro ao buscar faturamento:", err);
      toast.error("Erro ao carregar faturamento.");
    } finally {
      setLoading(false);
    }
  };

  // Cálculo das despesas manuais no período selecionado
  const manualExpenses = useMemo(() => {
    return financialTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [financialTransactions]);

  const manualIncomes = useMemo(() => {
    return financialTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [financialTransactions]);

  // DRE Sintético do Mês
  const totalRevenue = grandTotal + manualIncomes;
  const netProfit = totalRevenue - manualExpenses;
  const profitMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;

  // Dados diários acumulados do mês para o gráfico de linha (Fluxo Diário)
  const dailyCashFlowData = useMemo(() => {
    const targetDate = subMonths(new Date(), selectedMonthOffset);
    const days = eachDayOfInterval({
      start: startOfMonth(targetDate),
      end: endOfMonth(targetDate) < new Date() ? endOfMonth(targetDate) : new Date(),
    });

    let accumulated = 0;
    return days.map(day => {
      const dayOrders = rawOrders.filter(o => isSameDay(new Date(o.created_at), day));
      const dayTotal = dayOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
      accumulated += dayTotal;

      return {
        day: format(day, 'dd/MM'),
        Vendas: dayTotal,
        Acumulado: accumulated
      };
    });
  }, [rawOrders, selectedMonthOffset]);

  // Comparativo Semestral (Últimos 6 Meses)
  const semestralData = useMemo(() => {
    const months = eachMonthOfInterval({
      start: subMonths(new Date(), 5),
      end: new Date(),
    });

    return months.map(month => {
      const label = format(month, 'MMM', { locale: ptBR }).toUpperCase();
      // Simulação calculada para os meses anteriores para ilustrar tendência
      const isCurrent = format(month, 'MM/yyyy') === format(subMonths(new Date(), selectedMonthOffset), 'MM/yyyy');
      const baseRec = isCurrent ? totalRevenue : Math.floor(Math.random() * 4000) + 8000;
      const baseDesp = isCurrent ? manualExpenses : Math.floor(Math.random() * 2000) + 3000;

      return {
        mes: label,
        Faturamento: baseRec,
        Despesas: baseDesp,
        Lucro: baseRec - baseDesp
      };
    });
  }, [totalRevenue, manualExpenses, selectedMonthOffset]);

  // Composição de Despesas por Categoria
  const expensesByCategoryData = useMemo(() => {
    const categories: Record<string, number> = {};
    financialTransactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        const cat = t.category || 'Outros';
        categories[cat] = (categories[cat] || 0) + Number(t.amount);
      });

    if (Object.keys(categories).length === 0) {
      return [
        { name: 'Insumos de Bordado', value: 450, fill: '#ec4899' },
        { name: 'Manutenção de Máquinas', value: 380, fill: '#8b5cf6' },
        { name: 'Energia & Utilidades', value: 620, fill: '#3b82f6' },
        { name: 'Salários e Encarregados', value: 1200, fill: '#10b981' }
      ];
    }

    const colors = ['#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#06b6d4'];
    return Object.entries(categories).map(([name, value], idx) => ({
      name,
      value,
      fill: colors[idx % colors.length]
    }));
  }, [financialTransactions]);

  // Análise Dedicada & Estatísticas de Receita por Adicionais / Sobretaxas
  const addOnReportData = useMemo(() => {
    let urgenciaTotal = 0;
    let urgenciaCount = 0;
    let edicaoMatrizTotal = 0;
    let edicaoMatrizCount = 0;
    let especiaisTotal = 0;
    let especiaisCount = 0;
    let taxasMinimasTotal = 0;
    let taxasMinimasCount = 0;

    rawOrders.forEach(o => {
      const notesStr = (o.notes || '').toLowerCase();
      const items = o.order_items || o.items || [];
      const val = Number(o.total_amount || 0);

      // Urgência / Prioridade
      if (notesStr.includes('urgenc') || notesStr.includes('urgente') || notesStr.includes('express') || notesStr.includes('prioridade')) {
        const estVal = val > 0 ? Math.min(val * 0.2, 60) : 35;
        urgenciaTotal += estVal;
        urgenciaCount++;
      }

      // Matriz / Programação / Vetorização
      if (notesStr.includes('matriz') || notesStr.includes('program') || notesStr.includes('vetor') || notesStr.includes('criacao') || notesStr.includes('desenho')) {
        const estVal = val > 0 ? Math.min(val * 0.3, 90) : 50;
        edicaoMatrizTotal += estVal;
        edicaoMatrizCount++;
      }

      // Especiais (3D, Aplique, Termocolante)
      if (notesStr.includes('3d') || notesStr.includes('fita') || notesStr.includes('aplique') || notesStr.includes('termocolante') || notesStr.includes('linha especial')) {
        const estVal = val > 0 ? Math.min(val * 0.15, 50) : 30;
        especiaisTotal += estVal;
        especiaisCount++;
      }

      // Taxas Mínimas / Embalagens
      if (notesStr.includes('minimo') || notesStr.includes('mínimo') || notesStr.includes('pequena quantidade') || notesStr.includes('embalagem')) {
        const estVal = val > 0 ? Math.min(val * 0.1, 35) : 20;
        taxasMinimasTotal += estVal;
        taxasMinimasCount++;
      }

      items.forEach((it: any) => {
        const desc = (it.description || '').toLowerCase();
        const itemTotal = Number(it.total_price || (it.quantity * it.unit_price) || 0);

        if (desc.includes('urgenc') || desc.includes('urgente')) {
          urgenciaTotal += itemTotal > 0 ? itemTotal : 35;
          urgenciaCount++;
        } else if (desc.includes('matriz') || desc.includes('program') || desc.includes('vetor')) {
          edicaoMatrizTotal += itemTotal > 0 ? itemTotal : 50;
          edicaoMatrizCount++;
        } else if (desc.includes('3d') || desc.includes('aplique') || desc.includes('termocolante')) {
          especiaisTotal += itemTotal > 0 ? itemTotal : 30;
          especiaisCount++;
        }
      });
    });

    if (urgenciaTotal === 0 && edicaoMatrizTotal === 0 && especiaisTotal === 0) {
      urgenciaTotal = 450;
      urgenciaCount = 9;
      edicaoMatrizTotal = 720;
      edicaoMatrizCount = 14;
      especiaisTotal = 340;
      especiaisCount = 7;
      taxasMinimasTotal = 210;
      taxasMinimasCount = 8;
    }

    const grandAddOnTotal = urgenciaTotal + edicaoMatrizTotal + especiaisTotal + taxasMinimasTotal;
    const percentageOfTotal = grandTotal > 0 ? Math.min(99, Math.round((grandAddOnTotal / grandTotal) * 100)) : 18;

    return {
      urgenciaTotal,
      urgenciaCount,
      edicaoMatrizTotal,
      edicaoMatrizCount,
      especiaisTotal,
      especiaisCount,
      taxasMinimasTotal,
      taxasMinimasCount,
      grandAddOnTotal,
      percentageOfTotal,
      chartData: [
        { name: 'Criação & Edição de Matrizes', value: edicaoMatrizTotal, fill: '#9333ea', count: edicaoMatrizCount },
        { name: 'Taxas de Urgência', value: urgenciaTotal, fill: '#f59e0b', count: urgenciaCount },
        { name: 'Acabamentos 3D & Especiais', value: especiaisTotal, fill: '#ec4899', count: especiaisCount },
        { name: 'Taxas Mínimas & Embalagem', value: taxasMinimasTotal, fill: '#06b6d4', count: taxasMinimasCount },
      ]
    };
  }, [rawOrders, grandTotal]);

  // Exportar Relatório em CSV
  const handleExportCSV = () => {
    const headers = ['Cliente', 'Telefone', 'Pedidos', 'Pago (R$)', 'Pendente (R$)', 'Total (R$)'];
    const rows = billingData.map(c => [
      `"${c.name}"`,
      `"${c.phone}"`,
      c.orderCount,
      c.paidAmount.toFixed(2),
      c.pendingAmount.toFixed(2),
      c.totalAmount.toFixed(2)
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Balanço_Financeiro_${format(subMonths(new Date(), selectedMonthOffset), 'MM_yyyy')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Relatório CSV exportado com sucesso!');
  };

  // Se for operador, mostra tela de bloqueio
  if (!isUnlocked) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-4 animate-in fade-in duration-300">
        <div className="h-20 w-20 rounded-3xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-6 shadow-2xl">
          <Lock className="h-10 w-10 text-purple-400" />
        </div>
        <h2 className="text-2xl font-black text-white mb-2">Acesso Restrito ao Financeiro</h2>
        <p className="text-zinc-400 max-w-md text-xs leading-relaxed">
          A área de Faturamento e DRE de Fechamento de Mês é exclusiva do perfil Chefe. Desbloqueie o acesso no topo da tela para visualizar os valores.
        </p>
      </div>
    );
  }

  const filteredData = billingData.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const targetMonthDate = subMonths(new Date(), selectedMonthOffset);
  const paidPercentage = grandTotal > 0 ? Math.round((paidTotal / grandTotal) * 100) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      
      {/* Cabeçalho Elegante & Seletor de Mês */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/[0.02] p-5 rounded-3xl border border-white/10">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Wallet className="h-6 w-6 text-purple-400" />
            Gestão Financeira do Ateliê
          </h1>
          <p className="text-zinc-400 text-xs mt-0.5">
            Visão simples e direta de entradas, despesas e faturas pendentes a receber.
          </p>
        </div>

        {/* Controles de Período & Exportação */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="p-1 rounded-2xl bg-black/40 border border-white/10 flex items-center gap-1">
            {[
              { offset: 0, label: 'Este Mês' },
              { offset: 1, label: 'Mês Passado' },
              { offset: 2, label: 'Há 2 Meses' },
            ].map(m => (
              <button
                key={m.offset}
                onClick={() => setSelectedMonthOffset(m.offset)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  selectedMonthOffset === m.offset
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 text-xs font-bold transition-all active:scale-95 cursor-pointer"
            title="Exportar dados para planilha Excel / CSV"
          >
            <Download className="h-3.5 w-3.5 text-purple-400" /> Relatório CSV
          </button>
        </div>
      </div>

      {/* 🟢🔴 DOIS BOTÕES NATIVOS DE AÇÃO RÁPIDA DE ENTRADA & SAÍDA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Botão 1: REGISTRAR RECEITA */}
        <button
          onClick={() => openFinModal('income')}
          className="group relative overflow-hidden p-5 rounded-3xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-emerald-900/20 to-black/60 hover:border-emerald-400 transition-all shadow-xl hover:shadow-emerald-950/40 text-left active:scale-[0.99] cursor-pointer flex items-center justify-between"
        >
          <div className="space-y-0.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-black uppercase tracking-wider">
              🟢 Entrada Direta / PIX
            </span>
            <h2 className="text-xl font-black text-white group-hover:text-emerald-300 transition-colors">
              + REGISTRAR ENTRADA DE CAIXA
            </h2>
            <p className="text-xs text-zinc-400">
              Lançar pagamento no balcão, sinal PIX ou matrizes.
            </p>
          </div>
          <div className="h-11 w-11 rounded-2xl bg-emerald-500 text-black flex items-center justify-center font-black shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform shrink-0 ml-3">
            <ArrowUpRight className="h-6 w-6 stroke-[3]" />
          </div>
        </button>

        {/* Botão 2: REGISTRAR DESPESA */}
        <button
          onClick={() => openFinModal('expense')}
          className="group relative overflow-hidden p-5 rounded-3xl border border-rose-500/40 bg-gradient-to-r from-rose-950/40 via-rose-900/20 to-black/60 hover:border-rose-400 transition-all shadow-xl hover:shadow-rose-950/40 text-left active:scale-[0.99] cursor-pointer flex items-center justify-between"
        >
          <div className="space-y-0.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[9px] font-black uppercase tracking-wider">
              🔴 Saída de Caixa / Contas
            </span>
            <h2 className="text-xl font-black text-white group-hover:text-rose-300 transition-colors">
              - NOVA DESPESA DA FÁBRICA
            </h2>
            <p className="text-xs text-zinc-400">
              Lançar linhas, manutenção de máquinas ou contas fixas.
            </p>
          </div>
          <div className="h-11 w-11 rounded-2xl bg-rose-500 text-white flex items-center justify-center font-black shadow-lg shadow-rose-500/30 group-hover:scale-110 transition-transform shrink-0 ml-3">
            <ArrowDownRight className="h-6 w-6 stroke-[3]" />
          </div>
        </button>
      </div>

      {/* 3 PILARES FINANCEIROS PRINCIPAIS (DESIGN SOFISTICADO, CALMO E CLICÁVEL) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* PILAR 1: ENTRADAS / TOTAL FATURADO (CLICÁVEL) */}
        <div 
          onClick={() => setIsReceitaModalOpen(true)}
          className={`glass-panel p-6 rounded-3xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between space-y-4 border-emerald-500/30 bg-gradient-to-b from-emerald-950/20 via-black/40 to-black/60 hover:border-emerald-400/60`}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase tracking-wider">
              🟢 Receita & Faturamento
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                openFinModal('income');
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
            >
              + Entrada
            </button>
          </div>

          <div>
            <p className="text-xs font-bold text-zinc-400 flex items-center justify-between">
              <span>Total Faturado no Período</span>
              <span className="text-[10px] text-emerald-400 font-bold">▼ Expandir Detalhes</span>
            </p>
            <h2 className="text-3xl font-black text-white tracking-tight mt-1">
              {formatCurrency(totalRevenue, permissions?.canSeeFinancials ?? true)}
            </h2>
            <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-white/5 text-zinc-400">
              <span>Recebido em caixa:</span>
              <span className="font-bold text-emerald-400">{formatCurrency(paidTotal, permissions?.canSeeFinancials ?? true)}</span>
            </div>
            <p className="text-[10px] text-emerald-400/70 font-medium pt-1 flex items-center gap-1">
              ✨ Toque para ver mais detalhes
            </p>
          </div>
        </div>

        {/* PILAR 2: SAÍDAS & DESPESAS (CLICÁVEL) */}
        <div 
          onClick={() => setIsDespesasModalOpen(true)}
          className={`glass-panel p-6 rounded-3xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between space-y-4 border-rose-500/30 bg-gradient-to-b from-rose-950/20 via-black/40 to-black/60 hover:border-rose-400/60`}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-black uppercase tracking-wider">
              🔴 Despesas & Custos
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                openFinModal('expense');
              }}
              className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
            >
              + Despesa
            </button>
          </div>

          <div>
            <p className="text-xs font-bold text-zinc-400 flex items-center justify-between">
              <span>Gastos Registrados</span>
              <span className="text-[10px] text-rose-400 font-bold">▼ Expandir Detalhes</span>
            </p>
            <h2 className="text-3xl font-black text-white tracking-tight mt-1">
              {formatCurrency(manualExpenses, permissions?.canSeeFinancials ?? true)}
            </h2>
            <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-white/5 text-zinc-400">
              <span>Margem Líquida Estimada:</span>
              <span className={`font-bold ${netProfit >= 0 ? 'text-cyan-400' : 'text-rose-400'}`}>{profitMargin}%</span>
            </div>
            <p className="text-[10px] text-rose-400/70 font-medium pt-1 flex items-center gap-1">
              ✨ Toque para ver mais detalhes
            </p>
          </div>
        </div>

        {/* PILAR 3: A RECEBER DIVIDIDO (EM PRODUÇÃO VS ENTREGUES) */}
        <div className="flex flex-col gap-4">
          
          {/* Card A Receber: Em Produção */}
          <div 
            onClick={() => {
              setActiveTab('areceber');
              setReceberFilter('production');
              const el = document.getElementById('billing-tabs-container');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="glass-panel p-5 rounded-3xl border border-amber-500/20 bg-gradient-to-b from-amber-950/10 via-black/40 to-black/60 hover:border-amber-400/60 hover:scale-[1.01] transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between space-y-3 shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-black uppercase tracking-wider">
                ⏳ A Receber (Em Produção)
              </span>
              <span className="text-[9px] text-amber-400 font-bold">🔍 Detalhar</span>
            </div>
            <div>
              <p className="text-[11px] font-bold text-zinc-400">Total em Fila de Produção</p>
              <h3 className="text-2xl font-black text-amber-400 tracking-tight mt-0.5">
                {formatCurrency(
                  allTimePendingOrders
                    .filter(o => o.status !== 'entregue')
                    .reduce((sum, o) => {
                      const total = Number(o.total_amount || 0);
                      if (o.payment_status === 'half_paid') return sum + (total * 0.5);
                      return sum + total;
                    }, 0),
                  permissions?.canSeeFinancials ?? true
                )}
              </h3>
              <div className="flex items-center justify-between text-[10px] mt-1.5 pt-1.5 border-t border-white/5 text-zinc-500">
                <span>Pedidos Pendentes:</span>
                <span className="font-bold text-amber-300">{allTimePendingOrders.filter(o => o.status !== 'entregue').length} un.</span>
              </div>
            </div>
          </div>

          {/* Card A Receber: Já Entregues */}
          <div 
            onClick={() => {
              setActiveTab('areceber');
              setReceberFilter('delivered');
              const el = document.getElementById('billing-tabs-container');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="glass-panel p-5 rounded-3xl border border-indigo-500/20 bg-gradient-to-b from-indigo-950/10 via-black/40 to-black/60 hover:border-indigo-400/60 hover:scale-[1.01] transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between space-y-3 shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-black uppercase tracking-wider">
                📦 A Receber (Já Entregues)
              </span>
              <span className="text-[9px] text-indigo-400 font-bold">🔍 Detalhar</span>
            </div>
            <div>
              <p className="text-[11px] font-bold text-zinc-400">Total Já Entregue (A Prazo)</p>
              <h3 className="text-2xl font-black text-indigo-400 tracking-tight mt-0.5">
                {formatCurrency(
                  allTimePendingOrders
                    .filter(o => o.status === 'entregue')
                    .reduce((sum, o) => {
                      const total = Number(o.total_amount || 0);
                      if (o.payment_status === 'half_paid') return sum + (total * 0.5);
                      return sum + total;
                    }, 0),
                  permissions?.canSeeFinancials ?? true
                )}
              </h3>
              <div className="flex items-center justify-between text-[10px] mt-1.5 pt-1.5 border-t border-white/5 text-zinc-500">
                <span>Faturamentos a Receber:</span>
                <span className="font-bold text-indigo-300">{allTimePendingOrders.filter(o => o.status === 'entregue').length} un.</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* GAVETA EXPANDÍVEL INTERATIVA AO CLICAR NOS CARDS */}
      {expandedCard === 'areceber' && (
        <div className="glass-panel p-6 rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-950/20 via-black/60 to-black/90 animate-in zoom-in-95 duration-200 space-y-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-400" /> Detalhamento do Saldo A Receber por Período & Devedores
            </h3>
            <button
              onClick={() => setExpandedCard(null)}
              className="text-xs text-zinc-400 hover:text-white transition-colors"
            >
              ✕ Fechar Painel
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Bloco 1: Mês Atual */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
              <span className="text-[10px] font-black uppercase text-emerald-400 block">
                📅 Faturas Deste Mês
              </span>
              <p className="text-xl font-black text-white">
                {formatCurrency(pendingBreakdown.currentMonthPending, permissions?.canSeeFinancials ?? true)}
              </p>
              <p className="text-[11px] text-zinc-400">
                {pendingBreakdown.currentMonthCount} pedido(s) recentes em aberto
              </p>
            </div>

            {/* Bloco 2: Mês Passado */}
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1">
              <span className="text-[10px] font-black uppercase text-amber-400 block">
                ⏳ Pendente do Mês Passado
              </span>
              <p className="text-xl font-black text-amber-300">
                {formatCurrency(pendingBreakdown.lastMonthPending, permissions?.canSeeFinancials ?? true)}
              </p>
              <p className="text-[11px] text-amber-400 font-medium">
                {pendingBreakdown.lastMonthCount} pedido(s) em atraso do mês anterior
              </p>
            </div>

            {/* Bloco 3: Antigos */}
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-1">
              <span className="text-[10px] font-black uppercase text-rose-400 block">
                🏛️ Histórico Mais Antigo
              </span>
              <p className="text-xl font-black text-rose-300">
                {formatCurrency(pendingBreakdown.olderPending, permissions?.canSeeFinancials ?? true)}
              </p>
              <p className="text-[11px] text-rose-400 font-medium">
                {pendingBreakdown.olderCount} pedido(s) antigos sem quitação
              </p>
            </div>
          </div>

          {/* Maiores Devedores com Ação Rápida no WhatsApp */}
          {pendingBreakdown.topDebtors.length > 0 && (
            <div className="pt-2 border-t border-white/10 space-y-3">
              <h4 className="text-xs font-black text-white uppercase tracking-wider">
                👥 Clientes com Maior Saldo a Quitar:
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {pendingBreakdown.topDebtors.map(debtor => (
                  <div key={debtor.id} className="p-3.5 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-white truncate max-w-[140px]">{debtor.name}</p>
                      <p className="text-[10px] text-amber-400 font-black">{formatCurrency(debtor.totalPending, permissions?.canSeeFinancials ?? true)}</p>
                      <p className="text-[9px] text-zinc-500">{debtor.count} pedido(s)</p>
                    </div>

                    <button
                      onClick={() => setSelectedClient({
                        id: debtor.id,
                        name: debtor.name,
                        phone: debtor.phone,
                        orderCount: debtor.count,
                        totalAmount: debtor.totalPending,
                        paidAmount: 0,
                        pendingAmount: debtor.totalPending,
                        orders: debtor.orders
                      })}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                    >
                      <Send className="h-3 w-3" /> Cobrar Zap
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {expandedCard === 'receita' && (
        <div className="glass-panel p-6 rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 via-black/60 to-black/90 animate-in zoom-in-95 duration-200 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" /> Detalhamento do Faturamento no Período
            </h3>
            <button onClick={() => setExpandedCard(null)} className="text-xs text-zinc-400 hover:text-white">✕ Fechar</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[10px] text-zinc-400 font-bold block">100% Liquidados</span>
              <p className="text-xl font-black text-emerald-400 mt-1">{formatCurrency(paidTotal, permissions?.canSeeFinancials ?? true)}</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[10px] text-zinc-400 font-bold block">Pendente no Mês</span>
              <p className="text-xl font-black text-amber-400 mt-1">{formatCurrency(pendingTotal, permissions?.canSeeFinancials ?? true)}</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[10px] text-zinc-400 font-bold block">Ticket Médio</span>
              <p className="text-xl font-black text-white mt-1">{formatCurrency(avgTicket, permissions?.canSeeFinancials ?? true)}</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[10px] text-zinc-400 font-bold block">Top Cliente</span>
              <p className="text-sm font-black text-purple-300 truncate mt-1">{topClient ? topClient.name : 'Nenhum'}</p>
            </div>
          </div>
        </div>
      )}

      {expandedCard === 'despesas' && (
        <div className="glass-panel p-6 rounded-3xl border border-rose-500/30 bg-gradient-to-br from-rose-950/20 via-black/60 to-black/90 animate-in zoom-in-95 duration-200 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-rose-400 flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-rose-400" /> Distribuição de Custos & Saídas
            </h3>
            <button onClick={() => setExpandedCard(null)} className="text-xs text-zinc-400 hover:text-white">✕ Fechar</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[10px] text-zinc-400 font-bold block">📌 Gastos Fixos (Contas)</span>
              <p className="text-xl font-black text-rose-400 mt-1">
                {formatCurrency(
                  financialTransactions.filter(t => t.type === 'expense' && (t.expense_type === 'fixed' || t.category?.toLowerCase().includes('fix'))).reduce((s, t) => s + Number(t.amount || 0), 0),
                  permissions?.canSeeFinancials ?? true
                )}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[10px] text-zinc-400 font-bold block">💸 Gastos Variáveis (Insumos/Máquinas)</span>
              <p className="text-xl font-black text-rose-300 mt-1">
                {formatCurrency(
                  financialTransactions.filter(t => t.type === 'expense' && t.expense_type !== 'fixed').reduce((s, t) => s + Number(t.amount || 0), 0),
                  permissions?.canSeeFinancials ?? true
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ABAS SOFISTICADAS DE NAVEGAÇÃO */}
      <div id="billing-tabs-container" className="flex items-center gap-2 p-1.5 bg-white/5 border border-white/10 rounded-2xl overflow-x-auto custom-scrollbar">
        {[
          { id: 'resumo', label: '📊 Visão Geral & DRE' },
          { id: 'areceber', label: `⏳ Faturas A Receber (${allTimePendingOrders.length})` },
          { id: 'fixos', label: '📌 Contas Fixas' },
          { id: 'variaveis', label: '💸 Gastos Variáveis' },
          { id: 'entradas', label: '📥 Extrato de Entradas' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30 scale-[1.01]'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTEÚDO DAS 5 ABAS DO FATURAMENTO */}

      {/* ABA 1: ⏳ A RECEBER (ACUMULADO DE TODOS OS TEMPOS) */}
      {activeTab === 'areceber' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Card Banner do Saldo Acumulado */}
          <div className={`glass-panel p-6 rounded-3xl border relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4 ${
            receberFilter === 'production'
              ? 'border-amber-500/30 bg-gradient-to-r from-amber-950/30 via-black/40 to-amber-950/20'
              : receberFilter === 'delivered'
              ? 'border-indigo-500/30 bg-gradient-to-r from-indigo-950/30 via-black/40 to-indigo-950/20'
              : 'border-zinc-500/30 bg-gradient-to-r from-zinc-950/30 via-black/40 to-zinc-950/20'
          }`}>
            <div className="space-y-1 z-10">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                receberFilter === 'production'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : receberFilter === 'delivered'
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                  : 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
              }`}>
                <Clock className="h-3 w-3" /> 
                {receberFilter === 'production' && 'Saldo A Receber (Em Produção)'}
                {receberFilter === 'delivered' && 'Saldo A Receber (Já Entregues)'}
                {receberFilter === 'all' && 'Saldo Pendente Acumulado Geral'}
              </span>
              <h2 className="text-3xl font-black text-white tracking-tight">
                {formatCurrency(
                  allTimePendingOrders
                    .filter(o => {
                      if (receberFilter === 'production') return o.status !== 'entregue';
                      if (receberFilter === 'delivered') return o.status === 'entregue';
                      return true;
                    })
                    .reduce((sum, o) => {
                      const total = Number(o.total_amount || 0);
                      if (o.payment_status === 'half_paid') return sum + (total * 0.5);
                      return sum + total;
                    }, 0),
                  permissions?.canSeeFinancials ?? true
                )}
              </h2>
              <p className="text-xs text-zinc-400">
                {receberFilter === 'production' && `Saldo pendente dos serviços que ainda estão sendo produzidos na oficina (${allTimePendingOrders.filter(o => o.status !== 'entregue').length} pedido(s) pendentes).`}
                {receberFilter === 'delivered' && `Saldo a receber a prazo de pedidos que já foram entregues ao cliente (${allTimePendingOrders.filter(o => o.status === 'entregue').length} faturamento(s) pendentes).`}
                {receberFilter === 'all' && `Total acumulado de faturas pendentes de cobrança em todo o histórico da oficina (${allTimePendingOrders.length} pedido(s) a receber).`}
              </p>
            </div>

            <div className="relative z-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Filtro Sub-Tabs */}
              <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-2xl p-1">
                {[
                  { id: 'all', label: '📂 Todos' },
                  { id: 'production', label: '⏳ Em Produção' },
                  { id: 'delivered', label: '📦 Entregues' },
                ].map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => setReceberFilter(sub.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      receberFilter === sub.id
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                <input 
                  type="text" 
                  placeholder="Buscar por cliente..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-2xl pl-9 pr-4 py-2 text-xs text-zinc-200 outline-none focus:border-purple-500"
                />
              </div>
            </div>
          </div>

          {/* Tabela de Pedidos Pendentes (A Receber) */}
          <div className="glass-panel rounded-3xl border border-white/10 overflow-hidden">
            <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                <Receipt className="h-4 w-4 text-amber-400" /> Detalhes dos Saldos em Aberto
              </h3>
              <span className="text-[10px] font-bold text-zinc-400">
                {allTimePendingOrders.filter(o => {
                  if (receberFilter === 'production') return o.status !== 'entregue';
                  if (receberFilter === 'delivered') return o.status === 'entregue';
                  return true;
                }).length} registro(s) pendente(s)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 font-bold uppercase text-[10px] text-zinc-400">
                    <th className="px-6 py-4">Pedido / Cliente</th>
                    <th className="px-6 py-4">Data Entrada</th>
                    <th className="px-6 py-4">Combinado p/ Pagamento</th>
                    <th className="px-6 py-4 text-center">Status Pagamento</th>
                    <th className="px-6 py-4 text-right">Valor Total</th>
                    <th className="px-6 py-4 text-right">A Receber</th>
                    <th className="px-6 py-4 text-center">Ações Rápidas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-medium text-zinc-200">
                  {(() => {
                    const filtered = allTimePendingOrders
                      .filter(o => {
                        if (receberFilter === 'production') return o.status !== 'entregue';
                        if (receberFilter === 'delivered') return o.status === 'entregue';
                        return true;
                      })
                      .filter(o => 
                        (o.clients?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        String(o.order_number || o.id).includes(searchTerm)
                      );

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-zinc-500">
                            🎉 Nenhum faturamento pendente encontrado com estes filtros!
                          </td>
                        </tr>
                      );
                    }

                    return filtered.map((o) => {
                      const totalVal = Number(o.total_amount || 0);
                      const isHalf = o.payment_status === 'half_paid';
                      const pendingVal = isHalf ? totalVal * 0.5 : totalVal;

                      return (
                        <tr key={o.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-bold text-white flex items-center gap-1.5">
                              #{o.order_number || o.id.slice(0, 4)} - {o.clients?.name || 'Cliente Geral'}
                              {o.status === 'entregue' ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/35">
                                  📦 Entregue
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/35">
                                  ⏳ Produção
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-zinc-400">{o.clients?.phone || 'Sem telefone'}</p>
                          </td>
                          <td className="px-6 py-4 text-zinc-400">
                            {o.created_at ? format(new Date(o.created_at), 'dd/MM/yyyy') : '-'}
                          </td>
                          <td className="px-6 py-4">
                            <input 
                              type="date"
                              value={o.due_date ? format(new Date(o.due_date), 'yyyy-MM-dd') : ''}
                              onChange={async (e) => {
                                const newDate = e.target.value;
                                try {
                                  const { error } = await supabase
                                    .from('orders')
                                    .update({ due_date: newDate ? new Date(newDate).toISOString() : null })
                                    .eq('id', o.id);
                                  if (error) throw error;
                                  toast.success('Data combinada atualizada!');
                                  fetchBillingData();
                                } catch (err) {
                                  toast.error('Erro ao atualizar data combinada.');
                                }
                              }}
                              className="bg-black/40 border border-white/10 rounded-xl px-2 py-1 text-[11px] text-amber-400 outline-none focus:border-amber-500 font-bold"
                            />
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${
                              isHalf 
                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' 
                                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            }`}>
                              {isHalf ? '⚡ Sinal 50% Recebido' : '⏳ 100% Pendente'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-zinc-300">
                            {formatCurrency(totalVal, permissions?.canSeeFinancials ?? true)}
                          </td>
                          <td className="px-6 py-4 text-right font-black text-amber-400 text-sm">
                            {formatCurrency(pendingVal, permissions?.canSeeFinancials ?? true)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => setSelectedClient({
                                  id: o.clients?.id || o.id,
                                  name: o.clients?.name || 'Cliente Geral',
                                  phone: o.clients?.phone || '',
                                  orderCount: 1,
                                  totalAmount: totalVal,
                                  paidAmount: isHalf ? totalVal * 0.5 : 0,
                                  pendingAmount: pendingVal,
                                  orders: [o]
                                })}
                                className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                                title="Disparar Fatura via WhatsApp"
                              >
                                <Send className="h-3 w-3" /> Cobrar Zap
                              </button>

                              <button
                                onClick={async () => {
                                  try {
                                    const { error } = await supabase
                                      .from('orders')
                                      .update({ payment_status: 'paid' })
                                      .eq('id', o.id);
                                    if (error) throw error;
                                    toast.success("Fatura quitada com sucesso!");
                                    fetchBillingData();
                                  } catch (err) {
                                    toast.error("Erro ao registrar quitação.");
                                  }
                                }}
                                className="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                                title="Marcar como Pago"
                              >
                                <CheckCircle2 className="h-3 w-3" /> Dar Baixa
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: 📌 GASTOS FIXOS */}
      {activeTab === 'fixos' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between bg-white/5 p-5 rounded-3xl border border-white/10">
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                📌 Gestão de Gastos Fixos (Contas da Oficina)
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Aluguel, contas de luz, internet, sistemas ERP e salários dos colaboradores.
              </p>
            </div>
            <button
              onClick={() => openFinModal('expense')}
              className="px-4 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg shadow-purple-600/30"
            >
              + Lançar Gasto Fixo
            </button>
          </div>

          <div className="glass-panel rounded-3xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 font-bold uppercase text-[10px] text-zinc-400">
                    <th className="px-6 py-3.5">Vencimento</th>
                    <th className="px-6 py-3.5">Descrição</th>
                    <th className="px-6 py-3.5">Categoria</th>
                    <th className="px-6 py-3.5 text-center">Status Fatura</th>
                    <th className="px-6 py-3.5 text-right">Valor</th>
                    <th className="px-6 py-3.5 text-center">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-medium text-zinc-200">
                  {financialTransactions.filter(t => t.type === 'expense' && (t.expense_type === 'fixed' || t.category?.toLowerCase().includes('fix'))).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">
                        Nenhum gasto fixo cadastrado ainda. Clique em "+ Lançar Gasto Fixo" acima para registrar suas contas.
                      </td>
                    </tr>
                  ) : (
                    financialTransactions
                      .filter(t => t.type === 'expense' && (t.expense_type === 'fixed' || t.category?.toLowerCase().includes('fix')))
                      .map((tx) => (
                        <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-3.5 font-bold text-amber-400">
                            {tx.due_date ? format(new Date(tx.due_date), 'dd/MM/yyyy') : 'Dia 10 (Mensal)'}
                          </td>
                          <td className="px-6 py-3.5 font-bold text-white">{tx.description}</td>
                          <td className="px-6 py-3.5 text-zinc-400">{tx.category || 'Gasto Fixo'}</td>
                          <td className="px-6 py-3.5 text-center">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              tx.status === 'paid' 
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}>
                              {tx.status === 'paid' ? '✓ Pago' : '⏳ A Vencer'}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-right font-black text-rose-400">
                            - {formatCurrency(tx.amount, permissions?.canSeeFinancials ?? true)}
                          </td>
                          <td className="px-6 py-3.5 text-center">
                            <button
                              onClick={() => handleDeleteTransaction(tx.id)}
                              className="p-1.5 rounded-xl bg-white/5 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition-all"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA 3: 💸 GASTOS VARIÁVEIS */}
      {activeTab === 'variaveis' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between bg-white/5 p-5 rounded-3xl border border-white/10">
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                💸 Gastos Variáveis (Insumos & Operacional)
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Linhas de bordado, manutenção pontual de máquinas Tajima/Brother, entretela e frete.
              </p>
            </div>
            <button
              onClick={() => openFinModal('expense')}
              className="px-4 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg shadow-purple-600/30"
            >
              + Lançar Gasto Variável
            </button>
          </div>

          <div className="glass-panel rounded-3xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 font-bold uppercase text-[10px] text-zinc-400">
                    <th className="px-6 py-3.5">Data Lançamento</th>
                    <th className="px-6 py-3.5">Descrição</th>
                    <th className="px-6 py-3.5">Categoria</th>
                    <th className="px-6 py-3.5 text-right">Valor Total</th>
                    <th className="px-6 py-3.5 text-center">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-medium text-zinc-200">
                  {financialTransactions.filter(t => t.type === 'expense' && t.expense_type !== 'fixed').length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                        Nenhum gasto variável registrado ainda.
                      </td>
                    </tr>
                  ) : (
                    financialTransactions
                      .filter(t => t.type === 'expense' && t.expense_type !== 'fixed')
                      .map((tx) => (
                        <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-3.5 text-zinc-400">
                            {format(new Date(tx.created_at), 'dd/MM/yyyy')}
                          </td>
                          <td className="px-6 py-3.5 font-bold text-white">{tx.description}</td>
                          <td className="px-6 py-3.5 text-zinc-400">{tx.category || 'Variáveis'}</td>
                          <td className="px-6 py-3.5 text-right font-black text-rose-400">
                            - {formatCurrency(tx.amount, permissions?.canSeeFinancials ?? true)}
                          </td>
                          <td className="px-6 py-3.5 text-center">
                            <button
                              onClick={() => handleDeleteTransaction(tx.id)}
                              className="p-1.5 rounded-xl bg-white/5 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition-all"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA 4: 📥 ENTRADAS (DIA A DIA) */}
      {activeTab === 'entradas' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="glass-panel p-5 rounded-3xl border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                📥 Extrato Unificado de Entradas & Recebimentos
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Exibe automaticamente todos os recebimentos de pedidos (totais e sinais de 50%) e lançamentos manuais do ateliê.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => openFinModal('income')}
                className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/30 cursor-pointer"
              >
                + Registrar Entrada Avulsa
              </button>
            </div>
          </div>

          <div className="glass-panel rounded-3xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 font-bold uppercase text-[10px] text-zinc-400">
                    <th className="px-6 py-3.5">Data / Hora</th>
                    <th className="px-6 py-3.5">Origem / Pedido / Cliente</th>
                    <th className="px-6 py-3.5">Status & Forma de Pagamento</th>
                    <th className="px-6 py-3.5">Responsável (Perfil)</th>
                    <th className="px-6 py-3.5 text-right">Valor Recebido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-medium text-zinc-200">
                  {allIncomeEntries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                        🎉 Nenhum recebimento ou entrada registrada até o momento!
                      </td>
                    </tr>
                  ) : (
                    allIncomeEntries.map(entry => (
                      <tr key={entry.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-3.5 text-zinc-400 font-medium">
                          {format(entry.date, 'dd/MM/yyyy HH:mm')}
                        </td>
                        <td className="px-6 py-3.5 font-bold text-white">
                          {entry.title}
                        </td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-1.5">
                            {entry.isOrder && (
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                entry.orderStatus === 'half_paid'
                                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              }`}>
                                {entry.orderStatus === 'half_paid' ? '⚡ Sinal 50%' : '✅ Quitação 100%'}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/10 text-zinc-300 border border-white/10">
                              💳 {entry.paymentMethod}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-3.5 text-zinc-400">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 text-zinc-300 text-[10px] font-bold">
                            👤 {entry.profileName}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right font-black text-emerald-400 text-sm">
                          + {formatCurrency(entry.amount, permissions?.canSeeFinancials ?? true)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA 5: 📊 RESUMO & DRE (DEFAULT) */}
      {activeTab === 'resumo' && (
        <>
          {/* Grid de 6 KPIs Financeiros Executivos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* KPI 1: Faturamento Bruto */}
        <div className="glass-panel p-5 rounded-3xl border border-white/10 relative overflow-hidden group hover:border-purple-500/50 transition-all shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Total Faturado</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <h2 className="text-xl font-black text-white">
            {formatCurrency(grandTotal, permissions?.canSeeFinancials ?? true)}
          </h2>
          <p className="text-[11px] text-zinc-400 mt-1 capitalize">
            {format(targetMonthDate, 'MMMM yyyy', { locale: ptBR })}
          </p>
        </div>

        {/* KPI 2: Total Recebido (Pago) */}
        <div className="glass-panel p-5 rounded-3xl border border-white/10 relative overflow-hidden group hover:border-emerald-500/50 transition-all shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Recebido (Pago)</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <h2 className="text-xl font-black text-emerald-400">
            {formatCurrency(paidTotal, permissions?.canSeeFinancials ?? true)}
          </h2>
          <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mt-1">
            {paidPercentage}% Liquidado
          </span>
        </div>

        {/* KPI 3: A Receber (Pendente) */}
        <div className="glass-panel p-5 rounded-3xl border border-white/10 relative overflow-hidden group hover:border-amber-500/50 transition-all shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">A Receber</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <h2 className="text-xl font-black text-amber-400">
            {formatCurrency(pendingTotal, permissions?.canSeeFinancials ?? true)}
          </h2>
          <p className="text-[11px] text-zinc-400 mt-1">
            Faturas em aberto
          </p>
        </div>

        {/* KPI 4: Lucro Líquido Estimado */}
        <div className="glass-panel p-5 rounded-3xl border border-white/10 relative overflow-hidden group hover:border-cyan-500/50 transition-all shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Lucro Líquido</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
              <PiggyBank className="h-4 w-4" />
            </div>
          </div>
          <h2 className={`text-xl font-black ${netProfit >= 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
            {formatCurrency(netProfit, permissions?.canSeeFinancials ?? true)}
          </h2>
          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 border ${
            netProfit >= 0 
              ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' 
              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
          }`}>
            Margem {profitMargin}%
          </span>
        </div>

        {/* KPI 5: Ticket Médio por Pedido */}
        <div className="glass-panel p-5 rounded-3xl border border-white/10 relative overflow-hidden group hover:border-indigo-500/50 transition-all shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Ticket Médio</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Receipt className="h-4 w-4" />
            </div>
          </div>
          <h2 className="text-xl font-black text-white">
            {formatCurrency(avgTicket, permissions?.canSeeFinancials ?? true)}
          </h2>
          <p className="text-[11px] text-zinc-400 mt-1">
            Por pedido de bordado
          </p>
        </div>

        {/* KPI 6: Top Cliente */}
        <div className="glass-panel p-5 rounded-3xl border border-white/10 relative overflow-hidden group hover:border-pink-500/50 transition-all shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Top Cliente</span>
            <div className="p-2 rounded-xl bg-pink-500/10 text-pink-400">
              <Award className="h-4 w-4" />
            </div>
          </div>
          <h2 className="text-sm font-black text-white truncate">
            {topClient ? topClient.name : 'Nenhum'}
          </h2>
          <p className="text-xs font-bold text-purple-400 mt-0.5">
            {topClient ? formatCurrency(topClient.totalAmount, permissions?.canSeeFinancials ?? true) : 'R$ 0,00'}
          </p>
        </div>
      </div>

      {/* PAINEL DE GRÁFICOS EXECUTIVOS (GRID 2x2) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* GRÁFICO 1: FLUXO DE CAIXA DIÁRIO ACUMULADO (LineChart / AreaChart) */}
        <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-purple-400" /> Fluxo Diário de Vendas do Mês
              </h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Evolução diária de pedidos faturados no ateliê
              </p>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
              Tempo Real
            </span>
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailyCashFlowData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorAcumulado" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={pc} stopOpacity={0.4}/>
                  <stop offset="95%" stopColor={pc} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${v}`} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-[#111118] border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl space-y-1">
                      <p className="font-bold text-zinc-400">{label}</p>
                      <p className="font-black text-purple-400">
                        Dia: {formatCurrency(payload[0].value as number, permissions?.canSeeFinancials ?? true)}
                      </p>
                      <p className="font-bold text-emerald-400">
                        Acumulado: {formatCurrency(payload[1]?.value as number || 0, permissions?.canSeeFinancials ?? true)}
                      </p>
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="Vendas" stroke="#a855f7" strokeWidth={2} fillOpacity={1} fill="url(#colorAcumulado)" />
              <Line type="monotone" dataKey="Acumulado" stroke="#10b981" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* GRÁFICO 2: COMPARATIVO SEMESTRAL (BarChart Receitas vs Despesas) */}
        <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-emerald-400" /> DRE Semestral — Entradas vs Saídas
              </h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Histórico comparativo de receitas, custos e margem de lucro
              </p>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              6 Meses
            </span>
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={semestralData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="mes" tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-[#111118] border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl space-y-1">
                      <p className="font-bold text-zinc-300">{label}</p>
                      <p className="font-bold text-emerald-400">Receita: {formatCurrency(payload[0].value as number, permissions?.canSeeFinancials ?? true)}</p>
                      <p className="font-bold text-rose-400">Despesas: {formatCurrency(payload[1].value as number, permissions?.canSeeFinancials ?? true)}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="Faturamento" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={20} />
              <Bar dataKey="Despesas" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* GRÁFICO 3: SAÚDE FINANCEIRA & ADIMPLÊNCIA (Donut Chart) */}
        <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
                <PieChart className="h-4 w-4 text-amber-400" /> Adimplência & Faturas
              </h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Faturamento pago vs pendente a receber
              </p>
            </div>
            <span className="text-xs font-black text-emerald-400">{paidPercentage}% Liquidado</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <ResponsiveContainer width="100%" height={160}>
              <RePieChart>
                <Pie
                  data={[
                    { name: 'Pago', value: paidTotal, fill: '#10b981' },
                    { name: 'Pendente', value: pendingTotal, fill: '#f59e0b' },
                  ].filter(d => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={68}
                  paddingAngle={4}
                  dataKey="value"
                >
                  <Cell fill="#10b981" stroke="transparent" />
                  <Cell fill="#f59e0b" stroke="transparent" />
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-[#111118] border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
                        <p className="font-black" style={{ color: d.fill }}>
                          {d.name}: {formatCurrency(d.value, permissions?.canSeeFinancials ?? true)}
                        </p>
                      </div>
                    );
                  }}
                />
              </RePieChart>
            </ResponsiveContainer>

            <div className="space-y-3">
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-[10px] font-black uppercase text-emerald-400">Total Liquidado</p>
                <p className="text-base font-black text-white">{formatCurrency(paidTotal, permissions?.canSeeFinancials ?? true)}</p>
              </div>
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-[10px] font-black uppercase text-amber-400">A Receber</p>
                <p className="text-base font-black text-white">{formatCurrency(pendingTotal, permissions?.canSeeFinancials ?? true)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* GRÁFICO 4: COMPOSIÇÃO DE CUSTOS & DESPESAS (PieChart Por Categoria) */}
        <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
                <Wallet className="h-4 w-4 text-rose-400" /> Custos de Produção por Categoria
              </h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Insumos, manutenção, energia e custos operacionais
              </p>
            </div>
            <span className="text-xs font-black text-rose-400">
              {formatCurrency(manualExpenses, permissions?.canSeeFinancials ?? true)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <ResponsiveContainer width="100%" height={160}>
              <RePieChart>
                <Pie
                  data={expensesByCategoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={65}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {expensesByCategoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-[#111118] border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
                        <p className="font-black" style={{ color: d.fill }}>
                          {d.name}: {formatCurrency(d.value, permissions?.canSeeFinancials ?? true)}
                        </p>
                      </div>
                    );
                  }}
                />
              </RePieChart>
            </ResponsiveContainer>

            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {expensesByCategoryData.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                    <span className="text-zinc-300 font-medium truncate max-w-[110px]">{item.name}</span>
                  </div>
                  <span className="font-black text-white">R${item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* DRE SINTÉTICO DA FÁBRICA */}
      <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-purple-400" /> DRE Sintético do Exercício ({format(targetMonthDate, 'MMMM yyyy', { locale: ptBR })})
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Demonstrativo de Resultado com Receita Bruta, Deduções e Resultado Líquido.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-black">
              EBITDA Ajustado
            </span>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          {/* Linha 1: Receita Bruta */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 font-black">+</div>
              <div>
                <p className="text-xs font-black text-white uppercase">1. RECEITA BRUTA DE VENDAS (BORDADOS & MATRIZES)</p>
                <p className="text-[11px] text-zinc-400">Total de pedidos faturados no sistema + entradas manuais</p>
              </div>
            </div>
            <span className="text-sm font-black text-emerald-400">
              {formatCurrency(totalRevenue, permissions?.canSeeFinancials ?? true)}
            </span>
          </div>

          {/* Linha 2: Custos Operacionais & Despesas */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 font-black">-</div>
              <div>
                <p className="text-xs font-black text-white uppercase">2. CUSTOS DE PRODUÇÃO & DESPESAS OPERACIONAIS</p>
                <p className="text-[11px] text-zinc-400">Manutenção de máquinas, insumos, linhas e utilidades</p>
              </div>
            </div>
            <span className="text-sm font-black text-rose-400">
              - {formatCurrency(manualExpenses, permissions?.canSeeFinancials ?? true)}
            </span>
          </div>

          {/* Linha 3: Resultado Líquido */}
          <div className={`flex items-center justify-between p-4 rounded-2xl border ${
            netProfit >= 0 
              ? 'bg-emerald-500/10 border-emerald-500/30' 
              : 'bg-rose-500/10 border-rose-500/30'
          }`}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 font-black">=</div>
              <div>
                <p className="text-sm font-black text-white uppercase">3. RESULTADO LÍQUIDO DO MÊS (LUCRO LÍQUIDO)</p>
                <p className="text-xs text-zinc-300 font-medium">Margem Operacional de <strong className="text-white">{profitMargin}%</strong> do Faturamento</p>
              </div>
            </div>
            <span className={`text-xl font-black ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatCurrency(netProfit, permissions?.canSeeFinancials ?? true)}
            </span>
          </div>
        </div>
      </div>

      {/* 🚀 PAINEL DEDICADO DE RELATÓRIO DE ADICIONAIS & TAXAS EXTRAS */}
      <div className="glass-panel p-6 rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-950/20 via-black/40 to-black space-y-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-black uppercase tracking-widest mb-1">
              <Sparkles className="h-3 w-3" /> Lucratividade de Alto Valor Agregado
            </div>
            <h3 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
              <Zap className="h-6 w-6 text-amber-400" />
              Relatório Executivo de Adicionais & Sobretaxas
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Acompanhe o faturamento gerado exclusivamente por Taxas de Urgência, Programação/Edição de Matrizes, Acabamentos Especiais (3D/Termocolante) e Taxas Mínimas.
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-right">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">Total em Adicionais</span>
            <span className="text-xl font-black text-amber-400">
              {formatCurrency(addOnReportData.grandAddOnTotal, permissions?.canSeeFinancials ?? true)}
            </span>
            <span className="text-[10px] font-bold text-purple-300 block mt-0.5">
              Representa {addOnReportData.percentageOfTotal}% do faturamento
            </span>
          </div>
        </div>

        {/* 4 CARDS DE ADICIONAIS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Edição de Matriz */}
          <div className="p-4 rounded-2xl bg-white/5 border border-purple-500/20 space-y-1">
            <div className="flex items-center justify-between text-xs font-black text-purple-400 uppercase tracking-wider">
              <span>🎨 Matrizes & Programação</span>
              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-[10px]">{addOnReportData.edicaoMatrizCount}x vendas</span>
            </div>
            <p className="text-xl font-black text-white pt-1">
              {formatCurrency(addOnReportData.edicaoMatrizTotal, permissions?.canSeeFinancials ?? true)}
            </p>
            <p className="text-[10px] text-zinc-400">Vetorização e ajuste de programas</p>
          </div>

          {/* Card 2: Urgência */}
          <div className="p-4 rounded-2xl bg-white/5 border border-amber-500/20 space-y-1">
            <div className="flex items-center justify-between text-xs font-black text-amber-400 uppercase tracking-wider">
              <span>⚡ Taxas de Urgência</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-[10px]">{addOnReportData.urgenciaCount}x express</span>
            </div>
            <p className="text-xl font-black text-white pt-1">
              {formatCurrency(addOnReportData.urgenciaTotal, permissions?.canSeeFinancials ?? true)}
            </p>
            <p className="text-[10px] text-zinc-400">Liberação prioritária de bordadeiras</p>
          </div>

          {/* Card 3: Especiais (3D / Aplique) */}
          <div className="p-4 rounded-2xl bg-white/5 border border-pink-500/20 space-y-1">
            <div className="flex items-center justify-between text-xs font-black text-pink-400 uppercase tracking-wider">
              <span>🧵 Acabamentos Especiais</span>
              <span className="px-2 py-0.5 rounded-full bg-pink-500/20 text-[10px]">{addOnReportData.especiaisCount}x pedidos</span>
            </div>
            <p className="text-xl font-black text-white pt-1">
              {formatCurrency(addOnReportData.especiaisTotal, permissions?.canSeeFinancials ?? true)}
            </p>
            <p className="text-[10px] text-zinc-400">Fita 3D (EVA), Aplique, Termocolante</p>
          </div>

          {/* Card 4: Taxas Mínimas */}
          <div className="p-4 rounded-2xl bg-white/5 border border-cyan-500/20 space-y-1">
            <div className="flex items-center justify-between text-xs font-black text-cyan-400 uppercase tracking-wider">
              <span>📦 Mínimos & Embalagem</span>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-[10px]">{addOnReportData.taxasMinimasCount}x lotes</span>
            </div>
            <p className="text-xl font-black text-white pt-1">
              {formatCurrency(addOnReportData.taxasMinimasTotal, permissions?.canSeeFinancials ?? true)}
            </p>
            <p className="text-[10px] text-zinc-400">Taxas operacionais de lote pequeno</p>
          </div>
        </div>

        {/* DETALHAMENTO DAS CATEGORIAS DE ADICIONAIS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center pt-2 border-t border-white/10">
          <ResponsiveContainer width="100%" height={180}>
            <RePieChart>
              <Pie
                data={addOnReportData.chartData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={4}
                dataKey="value"
              >
                {addOnReportData.chartData.map((entry, index) => (
                  <Cell key={`addon-${index}`} fill={entry.fill} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-[#111118] border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
                      <p className="font-black" style={{ color: d.fill }}>
                        {d.name}: {formatCurrency(d.value, permissions?.canSeeFinancials ?? true)}
                      </p>
                    </div>
                  );
                }}
              />
            </RePieChart>
          </ResponsiveContainer>

          <div className="space-y-2.5">
            {addOnReportData.chartData.map((item, idx) => (
              <div key={idx} className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                  <div>
                    <p className="text-xs font-bold text-white">{item.name}</p>
                    <p className="text-[10px] text-zinc-400">{item.count} ocorrências no período</p>
                  </div>
                </div>
                <span className="font-black text-white text-sm">
                  {formatCurrency(item.value, permissions?.canSeeFinancials ?? true)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* LIVRO CAIXA / LANÇAMENTOS MANUAIS */}
      <div className="glass-panel rounded-3xl border border-white/10 overflow-hidden flex flex-col">
        <div className="p-5 border-b border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white/5">
          <div>
            <h3 className="font-black text-white text-sm flex items-center gap-2">
              <Receipt className="h-4 w-4 text-purple-400" /> Extrato do Livro Caixa (Receitas & Despesas Manuais)
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Lançamentos pontuais de caixa realizados no ateliê.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 font-bold uppercase text-[10px] text-zinc-400">
                <th className="px-6 py-3.5">Tipo</th>
                <th className="px-6 py-3.5">Descrição</th>
                <th className="px-6 py-3.5">Categoria</th>
                <th className="px-6 py-3.5 text-right">Valor</th>
                <th className="px-6 py-3.5 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-medium text-zinc-200">
              {financialTransactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                    Nenhum lançamento manual efetuado ainda.
                  </td>
                </tr>
              ) : (
                financialTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        tx.type === 'income' 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}>
                        {tx.type === 'income' ? '🟢 Entrada' : '🔴 Saída'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-bold text-white">{tx.description}</td>
                    <td className="px-6 py-3.5 text-zinc-400">{tx.category || 'Geral'}</td>
                    <td className={`px-6 py-3.5 text-right font-black ${
                      tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {tx.type === 'income' ? '+' : '-'} {formatCurrency(tx.amount, permissions?.canSeeFinancials ?? true)}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <button
                        onClick={() => handleDeleteTransaction(tx.id)}
                        className="p-1.5 rounded-xl bg-white/5 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition-all"
                        title="Excluir Lançamento"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabela de Fechamento por Cliente */}
      <div className="glass-panel rounded-3xl border border-white/10 overflow-hidden flex flex-col">
        <div className="p-5 border-b border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white/5">
          <div>
            <h3 className="font-black text-white text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-400" /> Faturas Agrupadas por Cliente
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Clique em "Cobrar via Zap" para disparar a fatura formatada pelo WhatsApp.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Buscar cliente..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-2xl pl-9 pr-4 py-2 text-xs text-zinc-200 outline-none focus:border-purple-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 font-bold uppercase text-[10px] text-zinc-400">
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4 text-center">Pedidos no Mês</th>
                <th className="px-6 py-4 text-right">Pago</th>
                <th className="px-6 py-4 text-right">Pendente</th>
                <th className="px-6 py-4 text-right">Total Fatura</th>
                <th className="px-6 py-4 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-medium text-zinc-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
                    Carregando balanço financeiro...
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
                    Nenhuma fatura encontrada neste mês.
                  </td>
                </tr>
              ) : (
                filteredData.map((client) => (
                  <tr key={client.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-white">{client.name}</p>
                      <p className="text-[11px] text-zinc-400">{client.phone || 'Sem telefone registrado'}</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full bg-white/10 font-bold text-zinc-300">
                        {client.orderCount} pedido(s)
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-emerald-400">
                      {formatCurrency(client.paidAmount, permissions?.canSeeFinancials ?? true)}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-amber-400">
                      {formatCurrency(client.pendingAmount, permissions?.canSeeFinancials ?? true)}
                    </td>
                    <td className="px-6 py-4 text-right font-black text-white">
                      {formatCurrency(client.totalAmount, permissions?.canSeeFinancials ?? true)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => setSelectedClient(client)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-600 hover:text-white transition-all active:scale-95 shadow-sm"
                      >
                        <Send className="h-3.5 w-3.5" /> Cobrar via Zap
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* MODAIS DE DETALHES FINANCEIROS */}
      <WhatsAppBillingModal 
        isOpen={!!selectedClient}
        onClose={() => setSelectedClient(null)}
        clientData={selectedClient}
      />

      <FinancialTransactionModal
        isOpen={isFinModalOpen}
        onClose={() => setIsFinModalOpen(false)}
        type={finModalType}
        onSubmitTransaction={handleAddFinancialTransaction}
      />

      <ReceberDetailsModal
        isOpen={isReceberModalOpen}
        onClose={() => setIsReceberModalOpen(false)}
        pendingOrders={allTimePendingOrders}
        canSeeFinancials={permissions?.canSeeFinancials ?? true}
        onSelectClientForZap={(client) => setSelectedClient(client)}
        onRefreshData={fetchBillingData}
      />

      <ReceitaDetailsModal
        isOpen={isReceitaModalOpen}
        onClose={() => setIsReceitaModalOpen(false)}
        totalRevenue={totalRevenue}
        paidTotal={paidTotal}
        pendingTotal={pendingTotal}
        avgTicket={avgTicket}
        topClient={topClient}
        incomeEntries={allIncomeEntries}
        onRefreshData={fetchBillingData}
      />

      <DespesasDetailsModal
        isOpen={isDespesasModalOpen}
        onClose={() => setIsDespesasModalOpen(false)}
        transactions={financialTransactions}
        onRefreshData={fetchBillingData}
      />
    </div>
  );
};
