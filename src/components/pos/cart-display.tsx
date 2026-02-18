"use client";

import type { CartItem, Payment, Product, Sale, RepairJob } from "@/lib/types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Trash2, TicketPercent, Gift } from "lucide-react";
import { useState } from "react";
import { CheckoutDialog } from "./checkout-dialog";
import { useCurrency } from "@/hooks/use-currency";
import { ScrollArea } from "../ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useFirebase, useDoc, useMemoFirebase } from "@/firebase";
import { doc, writeBatch, runTransaction } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { cn } from "@/lib/utils";

type CartDisplayProps = {
  cart: CartItem[];
  allProducts: Product[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onTogglePromo: (productId: string) => void;
  onToggleGift: (productId: string) => void;
  repairJobId?: string;
};

function generateSaleId() {
    const date = new Date();
    return `S-${format(date, "yyMMdd")}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function CartDisplay({ cart, allProducts, onUpdateQuantity, onRemoveItem, onClearCart, repairJobId, onTogglePromo, onToggleGift }: CartDisplayProps) {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();
  const { format: formatCurrency, convert, getFinalPrice, getSymbol } = useCurrency();
  const [discount, setDiscount] = useState(0);
  
  const repairJobRef = useMemoFirebase(() => 
    (repairJobId && firestore && user) ? doc(firestore, 'users', user.uid, 'repair_jobs', repairJobId) : null,
    [repairJobId, firestore, user?.uid]
  );
  const { data: activeRepairJob } = useDoc<RepairJob>(repairJobRef);

  const getPrice = (item: CartItem) => {
    if (item.isGift) return 0;
    if (item.isRepair) return activeRepairJob ? Math.max(0, activeRepairJob.estimatedCost - (activeRepairJob.amountPaid || 0)) : 0;
    if (item.isCustom) return item.customPrice || 0;
    const product = allProducts.find(p => p.id === item.productId);
    if (!product) return 0;
    return (item.isPromo && product.promoPrice) ? product.promoPrice : getFinalPrice(product);
  };
  
  const subtotal = cart.reduce((acc, item) => acc + getPrice(item) * item.quantity, 0);
  const total = subtotal - discount;

  const handleCheckout = async (payments: Payment[], changeGiven: Payment[], totalChangeInUSD: number): Promise<Sale | null> => {
      if (!firestore || !user) return null;

      const saleId = generateSaleId();
      const cartWithPrices = cart.map(item => ({ ...item, price: getPrice(item) }));

      try {
        await runTransaction(firestore, async (transaction) => {
            for (const item of cartWithPrices) {
                if (item.isCustom || item.productId.startsWith('abono-')) continue;

                if (item.isRepair && activeRepairJob?.reservedParts) {
                    for (const part of activeRepairJob.reservedParts) {
                        const pRef = doc(firestore, 'users', user.uid, 'products', part.productId);
                        const pDoc = await transaction.get(pRef);
                        if (pDoc.exists()) {
                            const data = pDoc.data() as Product;
                            transaction.update(pRef, { 
                                stockLevel: data.stockLevel - part.quantity,
                                reservedStock: Math.max(0, (data.reservedStock || 0) - part.quantity)
                            });
                        }
                    }
                } else {
                    const pRef = doc(firestore, 'users', user.uid, 'products', item.productId);
                    const pDoc = await transaction.get(pRef);
                    if (pDoc.exists()) {
                        const data = pDoc.data() as Product;
                        transaction.update(pRef, { stockLevel: data.stockLevel - item.quantity });
                    }
                }
            }

            if (repairJobId && activeRepairJob) {
                const jobRef = doc(firestore, 'users', user.uid, 'repair_jobs', repairJobId);
                const paidNow = cartWithPrices.find(i => i.isRepair)?.price || 0;
                const newPaid = (activeRepairJob.amountPaid || 0) + paidNow;
                transaction.update(jobRef, { 
                    amountPaid: newPaid, 
                    isPaid: newPaid >= activeRepairJob.estimatedCost,
                    status: newPaid >= activeRepairJob.estimatedCost ? 'Pagado' : activeRepairJob.status
                });
            }

            const saleRef = doc(firestore, 'users', user.uid, 'sale_transactions', saleId);
            transaction.set(saleRef, {
                id: saleId,
                items: cartWithPrices,
                subtotal, discount, totalAmount: total,
                paymentMethod: payments.map(p => p.method).join(', '),
                transactionDate: new Date().toISOString(),
                payments, status: 'completed',
                ...(changeGiven.length > 0 && { changeGiven, totalChangeInUSD })
            });
        });

        toast({ title: "Venta Completada" });
        return { id: saleId, items: cartWithPrices, subtotal, discount, totalAmount: total, payments, transactionDate: new Date().toISOString(), status: 'completed' } as Sale;
      } catch (e: any) {
        toast({ variant: "destructive", title: "Error", description: e.message });
        return null;
      }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
        <div className="p-4 border-b bg-white">
            <h2 className="text-lg font-semibold">Ticket de Venta</h2>
        </div>
      <ScrollArea className="flex-1 bg-white">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>PRODUCTO</TableHead>
                    <TableHead className="text-center">CANT</TableHead>
                    <TableHead className="text-right">TOTAL</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {cart.map((item) => (
                    <TableRow key={item.productId} className={cn(item.isGift && "bg-green-50")}>
                        <TableCell className="font-medium text-xs">
                            {item.name}
                            {item.isPromo && <Badge variant="outline" className="ml-1 text-[10px]">Oferta</Badge>}
                        </TableCell>
                        <TableCell className="text-center">
                            <input type="number" value={item.quantity} onChange={(e) => onUpdateQuantity(item.productId, parseInt(e.target.value) || 0)} className="w-10 border rounded text-center" disabled={item.isRepair} />
                        </TableCell>
                        <TableCell className="text-right font-bold">
                            ${formatCurrency(getPrice(item) * item.quantity)}
                        </TableCell>
                        <TableCell>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemoveItem(item.productId)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
      </ScrollArea>
      <div className="p-4 border-t bg-gray-50 space-y-3">
        <div className="flex justify-between text-sm"><span>Total:</span><span className="font-bold text-lg">{getSymbol()}{formatCurrency(total)}</span></div>
        <CheckoutDialog cart={cart} allProducts={allProducts} total={total} onCheckout={handleCheckout} onClearCart={onClearCart} isRepairSale={!!repairJobId}>
            <Button size="lg" className="w-full h-12 text-lg font-bold" disabled={cart.length === 0}>PAGAR</Button>
        </CheckoutDialog>
      </div>
    </div>
  );
}