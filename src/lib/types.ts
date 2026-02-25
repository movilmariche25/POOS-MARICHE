
import type { Timestamp } from "firebase/firestore";

export type ComboItem = {
  productId: string;
  productName: string;
  quantity: number;
}

export type Product = {
  id?: string;
  name: string;
  category: string;
  sku: string;
  costPrice: number;
  promoPrice?: number;
  stockLevel: number;
  reservedStock: number;
  damagedStock: number;
  lowStockThreshold: number;
  compatibleModels?: string[];
  isCombo?: boolean;
  comboItems?: ComboItem[];
  isGiftable?: boolean;
  isFixedPrice?: boolean;
  fixedPrice?: number;
  hasCustomMargin?: boolean;
  customMargin?: number;
  createdAt?: string; // Fecha de ingreso al inventario
};

export type ReservedPart = {
  productId: string;
  productName: string;
  quantity: number;
  costPrice: number;
}

export type RepairStatus = 'Pendiente' | 'Pagado' | 'Completado';

export type RepairJob = {
  id?: string;
  customerName: string;
  customerPhone: string;
  customerID?: string;
  customerAddress?: string;
  deviceMake: string;
  deviceModel: string;
  reportedIssue: string;
  initialConditionsChecklist?: string[];
  partsCost: number;
  laborCost: number;
  estimatedCost: number;
  amountPaid: number;
  isPaid: boolean;
  status: RepairStatus;
  notes?: string;
  createdAt: string;
  reservedParts?: ReservedPart[];
  completedAt?: string;
  warrantyEndDate?: string;
  partsConsumed?: boolean; 
};

export type FiadoStatus = 'Pendiente' | 'Pagado';

export type FiadoItem = {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
};

export type Fiado = {
  id?: string;
  customerName: string;
  customerID: string;
  customerPhone: string;
  concept: string; // Descripción de por qué se fío (ej: Pantalla + Mica)
  totalAmount: number;
  amountPaid: number;
  status: FiadoStatus;
  createdAt: string;
  dueDate?: string; // Fecha límite de pago (Alerta)
  notes?: string;
  items?: FiadoItem[];
};

export type Worker = {
  id?: string;
  name: string;
  phone?: string;
  active: boolean;
  createdAt: string;
};

export type PayrollPayment = {
  id?: string;
  workerId?: string;
  workerName: string;
  amountUSD: number;
  amountBs: number;
  dateFrom: string;
  dateTo: string;
  createdAt: string;
  notes?: string;
};

export type CartItem = {
  productId: string;
  quantity: number;
  name: string;
  isRepair?: boolean;
  isPromo?: boolean;
  isGift?: boolean;
  isCustom?: boolean;
  customPrice?: number;
  customCostPrice?: number;
};

export type HeldSale = {
  id: string;
  name: string;
  createdAt: string;
  items: CartItem[];
};

export type PaymentMethod = 'Efectivo USD' | 'Efectivo Bs' | 'Tarjeta' | 'Pago Móvil' | 'Transferencia';

export type Payment = {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

export type Sale = {
  id?: string;
  items: (CartItem & { price: number })[];
  repairJobId?: string;
  fiadoId?: string; // Vinculación con fiados
  consumedParts?: ReservedPart[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  paymentMethod: string;
  transactionDate: string;
  payments: Payment[];
  status: 'completed' | 'refunded';
  refundedAt?: string;
  refundReason?: string;
  reconciliationId?: string;
  totalChangeInUSD?: number;
  changeGiven?: Payment[];
  actualPaidAmount?: number;
};

export type ReconciliationPaymentMethodSummary = {
  expected: number;
  counted: number;
  difference: number;
};

export type DailyReconciliation = {
  id: string;
  date: string;
  totalSales: number;
  totalTransactions: number;
  closedAt: string;
  paymentMethods: {
    [key in PaymentMethod]?: ReconciliationPaymentMethodSummary;
  };
  totalExpected: number;
  totalCounted: number;
  totalDifference: number;
  totalPaymentsReceived?: number;
  totalChangeGiven?: number;
};

export type Currency = 'USD' | 'Bs';

export type AppSettings = {
    currency: Currency;
    bcvRate: number;
    parallelRate: number;
    profitMargin: number;
    autoUpdateBcv?: boolean;
    lastUpdated?: string;
};

export type UserModule = 'inventory' | 'pos' | 'repairs' | 'reports' | 'analysis' | 'fiados' | 'inventory_aging' | 'payroll';

export type UserProfile = {
  id?: string;
  uid: string;
  email: string;
  businessName?: string;
  businessAddress?: string;
  businessRIF?: string;
  showInfoOnReceipt?: boolean;
  licenseStatus: 'active' | 'expired' | 'trial';
  licenseExpiry: string;
  createdAt: string;
  isAdmin?: boolean;
  lastSessionId?: string;
  updatedAt?: string;
  enabledModules?: UserModule[];
  securityPin?: string;
  isPinRequired?: boolean;
  // Campos de políticas de reparación
  repairWarrantyPolicy?: string;
  repairPickupPolicy?: string;
  repairDisclaimer?: string;
};
