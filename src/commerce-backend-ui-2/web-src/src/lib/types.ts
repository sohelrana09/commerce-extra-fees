export type RuleType = "automatic" | "required" | "optional";
export type CalcMode = "fixed" | "percent" | "fixed_plus_percent" | "max_of";
export type ApplyPer = "order" | "item" | "unit";
export type InputType = "checkbox" | "dropdown" | "radio";

export type Calc = {
  applyPer?: ApplyPer;
  base?: { includeDiscount?: boolean; includeShipping?: boolean };
  fixed?: number;
  max?: number;
  min?: number;
  mode?: CalcMode;
  percent?: number;
};

export type FeeOption = {
  calc?: Calc;
  code: string;
  default?: boolean;
  label: string;
};

/** A condition tree node, as described in the README. Kept loose: edited as JSON. */
export type Condition = Record<string, unknown>;

export type FeeRule = {
  calc?: Calc;
  code: string;
  conditions?: Condition;
  customerGroups?: number[];
  description?: string;
  enabled?: boolean;
  input?: InputType;
  items?: Condition;
  label: string;
  options?: FeeOption[];
  sortOrder?: number;
  stores?: number[];
  subtotal?: { min?: number; max?: number };
  type?: RuleType;
  updatedAt?: string;
};

export type Fee = {
  base_fee: number;
  code: string;
  label: string;
};

export type Lookups = {
  customerGroups: { id: number; label: string }[];
  storeViews: { id: number; code: string; label: string }[];
  unavailable?: boolean;
};

export type PreviewLine = {
  price: number;
  qty: number;
  sku: string;
};

export type PreviewCart = {
  country?: string;
  customerGroup?: number;
  discount?: number;
  isGuest?: boolean;
  items: PreviewLine[];
  postcode?: string;
  region?: string;
  shippingAmount?: number;
  shippingMethod?: string;
  storeId?: number;
  subtotal?: number;
};

export type PreviewResult = {
  fees: Fee[];
  invalid: { code: string; errors: string[] }[];
  options: {
    code: string;
    label: string;
    input: InputType;
    amount: number | null;
    options: {
      code: string;
      label: string;
      amount: number;
      selected: boolean;
    }[];
  }[];
  subtotal: number;
  total: number;
};

export type ReportGroupBy = "fee" | "day" | "month";

export type ReportRow = {
  code: string;
  currency: string | null;
  label: string;
  orders: number;
  period: string | null;
  total: number;
};

export type ReportTotal = {
  currency: string | null;
  orders: number;
  total: number;
};

export type FeeReport = {
  from: string;
  groupBy: ReportGroupBy;
  rows: ReportRow[];
  to: string;
  totals: ReportTotal[];
};
