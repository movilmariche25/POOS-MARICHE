"use client";

import { useState, useMemo } from "react";
import type { Sale, PaymentMethod, DailyReconciliation, ReconciliationPaymentMethodSummary } from "@/lib/types";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { useCurrency } from "@/hooks/use-currency";
import { useFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { collection, doc, writeBatch } from "firebase/firestore";
import { format as formatDate, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { DoorClosed, Loader2, Printer } from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { cn } from "@/lib/utils";
import { ReconciliationTicket, handlePrintReconciliation } from "./reconciliation-ticket";
import { ScrollArea } from "../ui/scroll-area";

type CashReconciliationDialogProps = {
  openSales: Sale[];
};

const paymentMethodsOrder: PaymentMethod[] = ['Efectivo USD', 'Efectivo Bs', 'Tarjeta', 'Pago Móvil', 'Transferencia'];

export function CashReconciliationDialog({ openSales }: CashReconciliationDialogProps) {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();
  const currency = useCurrency();
  const { format: formatCurrency, getSymbol, convert } = currency;
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [completedReconciliation, setCompletedReconciliation] = useState<DailyReconciliation | null>(null);
  const [countedAmounts, setCountedAmounts] = useState<Record<PaymentMethod, number>>({
    'Efectivo USD': 0,
    'Efectivo Bs': 0,
    'Tarjeta': 0,
    'Pago Móvil': 0,
    'Transferencia': 0,
  });

  const {
    expectedAmounts,
    totalPaymentsInUSD,
    totalChangeGivenInUSD,
    netExpectedInUSD
  } = useMemo(() => {
    const totals: Record<PaymentMethod, number> = {
      'Efectivo USD': 0,
      'Efectivo Bs': 0,
      'Tarjeta': 0,
      'Pago Móvil': 0,
      'Transferencia': 0,
    };
    let paymentsUSD = 0;
    let changeUSD = 0;
    
    openSales.forEach(sale => {
      sale.payments.forEach(payment => {
        if (totals[payment.method] !== undefined) {
          totals[payment.method] += payment.amount;
        }
        paymentsUSD += payment.method === 'Efectivo USD' ? payment.amount : convert(payment.amount, 'Bs', 'USD');
      });
      if (sale.changeGiven) {
          sale.changeGiven.forEach(change => {
              if (totals[change.method] !== undefined) {
                  totals[change.method] -= change.amount;
              }
              changeUSD += change.method === 'Efectivo USD' ? change.amount : convert(change.amount, 'Bs', 'USD');
          });
      }
    });

    return { 
      expectedAmounts: totals,
      totalPaymentsInUSD: paymentsUSD,
      totalChangeGivenInUSD: changeUSD,
      netExpectedInUSD: paymentsUSD - changeUSD
    };
  }, [openSales, convert]);

  const differences = useMemo(() => {
    return paymentMethodsOrder.reduce((acc, method) => {
        acc[method] = countedAmounts[method] - expectedAmounts[method];
        return acc;
    }, {} as Record<PaymentMethod, number>);
  }, [countedAmounts, expectedAmounts]);

  const totalSalesValue = openSales.reduce((sum, sale) => sum + sale.totalAmount, 0);
  
  const totalCountedInUSD = useMemo(() => {
     return Object.entries(countedAmounts).reduce((acc, [method, amount]) => {
        const typedMethod = method as PaymentMethod;
        if (typedMethod === 'Efectivo USD') {
            return acc + amount;
        }
        return acc + convert(amount, 'Bs', 'USD');
     }, 0)
  }, [countedAmounts, convert]);

  const totalDifference = totalCountedInUSD - netExpectedInUSD;
  const transactionCount = openSales.length;

  const handleAmountChange = (method: PaymentMethod, value: string) => {
    setCountedAmounts(prev => ({ ...prev, [method]: parseFloat(value) || 0 }));
  };

  const handleFinishAndReset = () => {
    setIsOpen(false);
    setCompletedReconciliation(null);
    setCountedAmounts({
      'Efectivo USD': 0,
      'Efectivo Bs': 0,
      'Tarjeta': 0,
      'Pago Móvil': 0,
      'Transferencia': 0,
    });
  };
  
  const onPrint = () => {
    if (!completedReconciliation) return;
    handlePrintReconciliation({ reconciliation: completedReconciliation, currency }, (error) => {
      toast({ variant: "destructive", title: "Error de Impresión", description: error });
    });
  };

  const handleCloseDay = async () => {
    if (!firestore || !user || transactionCount === 0) return;
    setIsClosing(true);

    const todayStr = formatDate(new Date(), 'yyyy-MM-dd');
    const reconciliationId = `RECON-${todayStr}-${Date.now()}`;
    
    const batch = writeBatch(firestore);
    const reconciliationRef = doc(firestore, 'users', user.uid, 'daily_reconciliations', reconciliationId);
    
    const paymentMethodDetails = paymentMethodsOrder.reduce((acc, method) => {
        if (expectedAmounts[method] > 0 || countedAmounts[method] > 0) {
            acc[method] = {
                expected: expectedAmounts[method],
                counted: countedAmounts[method],
                difference: differences[method],
            };
        }
        return acc;
    }, {} as { [key in PaymentMethod]?: ReconciliationPaymentMethodSummary });

    const newReconciliation: DailyReconciliation = {
      id: reconciliationId,
      date: todayStr,
      totalSales: totalSalesValue,
      totalTransactions: transactionCount,
      closedAt: new Date().toISOString(),
      paymentMethods: paymentMethodDetails,
      totalExpected: netExpectedInUSD,
      totalCounted: totalCountedInUSD,
      totalDifference: totalDifference,
      totalPaymentsReceived: totalPaymentsInUSD,
      totalChangeGiven: totalChangeGivenInUSD,
    };
    batch.set(reconciliationRef, newReconciliation);

    openSales.forEach(sale => {
      const saleRef = doc(firestore, 'users', user.uid, 'sale_transactions', sale.id!);
      batch.update(saleRef, { reconciliationId: reconciliationId });
    });

    try {
      await batch.commit();
      toast({ title: "Día Cerrado Exitosamente", description: `Se han cerrado ${transactionCount} ventas.` });
      setCompletedReconciliation(newReconciliation);
    } catch (error) {
      toast({ variant: "destructive", title: "Error al Cerrar el Día", description: "Inténtalo de nuevo." });
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(val) => !val ? handleFinishAndReset() : setIsOpen(true)}>
      <Card>
        <CardHeader><CardTitle>Cierre de Ventas del Día</CardTitle></CardHeader>
        <CardContent className="space-y-3">
           <div className="p-3 rounded-lg bg-muted space-y-2">
                 <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">Ventas abiertas hoy</p>
                    <p className="text-lg font-bold">{transactionCount}</p>
                </div>
                <div className="flex items-center justify-between font-bold text-base border-t pt-2 mt-2">
                    <p>Neto Esperado en Caja</p>
                    <p>{getSymbol()}{formatCurrency(netExpectedInUSD)}</p>
                </div>
            </div>
          <DialogTrigger asChild>
            <Button className="w-full mt-2" disabled={transactionCount === 0}>
              <DoorClosed className="mr-2 h-4 w-4" />
              Realizar Cierre de Caja
            </Button>
          </DialogTrigger>
        </CardContent>
      </Card>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        {completedReconciliation ? (
            <>
                <DialogHeader><DialogTitle>Cierre Completado</DialogTitle></DialogHeader>
                <ScrollArea className="flex-1 pr-4 py-4">
                    <ReconciliationTicket reconciliation={completedReconciliation} currency={currency} />
                </ScrollArea>
                <DialogFooter className="mt-4">
                    <Button onClick={onPrint} variant="outline"><Printer className="mr-2 h-4 w-4" /> Imprimir</Button>
                    <Button onClick={handleFinishAndReset}>Finalizar</Button>
                </DialogFooter>
            </>
        ) : (
            <>
                <DialogHeader>
                    <DialogTitle>Cuadre de Caja - {formatDate(new Date(), "PPP", { locale: es })}</DialogTitle>
                    <DialogDescription>Ingresa los montos físicos para verificar que todo cuadre correctamente.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 pr-4 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h3 className="font-black text-xs uppercase tracking-widest text-muted-foreground">Montos Contados</h3>
                            {paymentMethodsOrder.map(method => (
                                <div key={method} className="space-y-1">
                                    <Label htmlFor={`counted-${method}`} className="text-[10px] font-bold uppercase">{method}</Label>
                                    <Input 
                                        id={`counted-${method}`} 
                                        type="number" 
                                        step="any"
                                        value={countedAmounts[method] || ''} 
                                        onChange={(e) => handleAmountChange(method, e.target.value)} 
                                        className="h-10 font-bold" 
                                        placeholder="0.00"
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="space-y-4 p-4 bg-muted/50 rounded-xl border">
                            <h3 className="font-black text-xs uppercase tracking-widest text-muted-foreground">Resumen del Cuadre</h3>
                            <div className="space-y-2">
                                {paymentMethodsOrder.map(method => {
                                    if (expectedAmounts[method] === 0 && countedAmounts[method] === 0) return null;
                                    const symbol = getSymbol(method === 'Efectivo USD' ? 'USD' : 'Bs');
                                    return (
                                        <div key={method} className="p-3 bg-background rounded-lg flex justify-between items-center text-xs border shadow-sm">
                                            <span className="font-bold text-muted-foreground uppercase">{method}:</span>
                                            <span className={cn("font-black", differences[method] < 0 ? 'text-destructive' : 'text-green-600')}>
                                                {differences[method] >= 0 ? '+' : ''}{symbol}{formatCurrency(differences[method])}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="border-t pt-4 mt-4 flex justify-between items-center">
                                <span className="font-black text-xs uppercase text-slate-600">Diferencia Total ($):</span>
                                <span className={cn("text-xl font-black", totalDifference < 0 ? 'text-destructive' : 'text-green-600')}>
                                    {totalDifference >= 0 ? '+' : ''}${formatCurrency(totalDifference)}
                                </span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
                <DialogFooter className="mt-4 border-t pt-4">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
                    <Button onClick={handleCloseDay} disabled={isClosing} className="min-w-[120px]">
                        {isClosing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirmar Cierre'}
                    </Button>
                </DialogFooter>
            </>
        )}
      </DialogContent>
    </Dialog>
  );
}