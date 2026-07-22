export type UserRole = 'admin' | 'digitizer' | 'operator' | 'seller';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  name: string;
  company_name?: string;
  document?: string;
  phone: string;
  email?: string;
  address?: string;
  is_recurring: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export type MatrixStatus = 'pending' | 'digitizing' | 'in_review' | 'approved' | 'active' | 'archived';

export interface Matrix {
  id: string;
  client_id?: string;
  client?: Client;
  name: string;
  code?: string;
  category?: string;
  tags?: string[];
  status: MatrixStatus;
  current_version_id?: string;
  current_version?: MatrixVersion;
  created_at: string;
  updated_at: string;
}

export interface MatrixVersion {
  id: string;
  matrix_id: string;
  version_number: number;
  file_name?: string;
  file_url?: string;
  preview_url?: string;
  file_format?: 'dst' | 'emb' | 'pes' | 'exp' | 'emt' | string;
  stitch_count: number;
  width_mm: number;
  height_mm: number;
  color_count: number;
  thread_changes_count?: number;
  estimated_time_minutes?: number;
  hoop_type?: string;
  digitizer_user_id?: string;
  digitizer?: Profile;
  notes?: string;
  created_at: string;
}

export type PricingRuleType = 'thousand_stitches' | 'color_percent' | 'fixed_addon' | 'percent_addon';

export interface PricingRule {
  id: string;
  name: string;
  rule_type: PricingRuleType;
  min_value?: number;
  max_value?: number;
  value: number; // e.g. 0.65 for thousand stitches, 20 for 20%
  is_active: boolean;
  display_order: number;
  created_at: string;
}

export type QuoteStatus = 'draft' | 'sent' | 'approved' | 'rejected';

export interface Quote {
  id: string;
  quote_number: number;
  client_id: string;
  client?: Client;
  status: QuoteStatus;
  subtotal_amount: number;
  total_amount: number;
  breakdown_json?: Record<string, any>;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  matrix_version_id?: string;
  matrix_version?: MatrixVersion;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  applied_rules_json?: Record<string, any>[];
  created_at: string;
}

export type OrderStatus = 'pending' | 'production' | 'embroidering' | 'completed' | 'delivered' | 'cancelled';

export interface Order {
  id: string;
  order_number: number;
  quote_id?: string;
  client_id: string;
  client?: Client;
  status: OrderStatus;
  total_amount: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Machine {
  id: string;
  name: string;
  brand?: string;
  model?: string;
  heads_count: number;
  speed_rpm: number;
  status: 'active' | 'maintenance' | 'inactive';
  notes?: string;
  created_at: string;
}
