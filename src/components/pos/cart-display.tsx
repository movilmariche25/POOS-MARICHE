
"use client";

import type { CartItem, Payment, Product, Sale, RepairJob } from "@/lib/types";
import { Button } from "../ui/button";
import { Trash2, TicketPercent, Gift } from "lucide-react";
import { useState } from "react";
import { CheckoutDialog } from "./checkout-dialog";
import { useCurrency } from "@/hooks/use-currency";
import { ScrollArea } from "../ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useFirebase, useDoc, useMemoFirebase } from "@/firebase";
import { doc, runTransaction } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { cn } from "@/lib/utils";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

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
  const { format: formatCurrency, getFinalPrice, getSymbol, convert } = useCurrency();
  const [discount] = useState(0);
  
  const repairJobRef = useMemoFirebase(() => 
    (repairJobId && firestore && user) ? doc(firestore, 'users', user.uid, 'repair_jobs', repairJobId) : null,
    [repairJobId, firestore, user?.uid]
  );
  const { data: activeRepairJob } = useDoc<RepairJob>(repairJobRef);

  const getPrice = (item: CartItem) => {
    if (item.isGift) return 0;
    
    if (item.isRepair) {
        if (!activeRepairJob) return 0;
        const basePending = Math.max(0, activeRepairJob.estimatedCost - (activeRepairJob.amountPaid || 0));
        
        if (item.isPromo && activeRepairJob.reservedParts?.[0]) {
            const partId = activeRepairJob.reservedParts[0].productId;
            const product = allProducts.find(p => p.id === partId);
            if (product && product.promoPrice && product.promoPrice > 0) {
                const retailPriceOfPart = getFinalPrice(product);
                const discountAmount = Math.max(0, retailPriceOfPart - product.promoPrice);
                return Math.max(0, basePending - discountAmount);
            }
        }
        return basePending;
    }
    
    if (item.isCustom) return item.customPrice || 0;
    
    const product = allProducts.find(p => p.id === item.productId);
    if (!product) return 0;
    
    return (item.isPromo && typeof product.promoPrice === 'number' && product.promoPrice > 0) 
        ? product.promoPrice 
        : getFinalPrice(product);
  };
  
  const subtotal = cart.reduce((acc, item) => acc + getPrice(item) * item.quantity, 0);
  const total = subtotal - discount;

  const handleCheckout = async (payments: Payment[], changeGiven: Payment[], totalChangeInUSD: number): Promise<Sale | null> => {
      if (!firestore || !user) return null;

      const saleId = generateSaleId();
      const cartWithPrices = cart.map(item => ({ ...item, price: getPrice(item) }));

      const totalPaidInUSD = payments.reduce((acc, p) => {
          return acc + (p.method === 'Efectivo USD' ? p.amount : convert(p.amount, 'Bs', 'USD'));
      }, 0);
      const actualNetPaidInUSD = totalPaidInUSD - totalChangeInUSD;

      try {
        await runTransaction(firestore, async (transaction) => {
            const currentRepairJob = repairJobId && activeRepairJob ? (await transaction.get(repairJobRef!)).data() as RepairJob : null;
            
            for (const item of cartWithPrices) {
                if (item.isCustom || item.productId.startsWith('abono-')) continue;

                if (item.isRepair && currentRepairJob?.reservedParts && !currentRepairJob.partsConsumed) {
                    // Solo descontamos stock si NO ha sido descontado antes (evita duplicados por abonos)
                    for (const part of currentRepairJob.reservedParts) {
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
                } else if (!item.isRepair) {
                    const pRef = doc(firestore, 'users', user.uid, 'products', item.productId);
                    const pDoc = await transaction.get(pRef);
                    if (pDoc.exists()) {
                        const data = pDoc.data() as Product;
                        transaction.update(pRef, { stockLevel: data.stockLevel - item.quantity });
                    }
                }
            }

            if (repairJobId && currentRepairJob) {
                const jobRef = doc(firestore, 'users', user.uid, 'repair_jobs', repairJobId);
                const otherItemsTotal = cartWithPrices
                    .filter(i => !i.isRepair)
                    .reduce((sum, i) => sum + (i.price * i.quantity), 0);
                
                const paidToRepair = Math.max(0, actualNetPaidInUSD - otherItemsTotal);
                
                let discountToApply = 0;
                const repairItem = cartWithPrices.find(i => i.isRepair);
                if (repairItem?.isPromo && currentRepairJob.reservedParts?.[0]) {
                    const partId = currentRepairJob.reservedParts[0].productId;
                    const product = allProducts.find(p => p.id === partId);
                    if (product && product.promoPrice && product.promoPrice > 0) {
                        const retailPriceOfPart = getFinalPrice(product);
                        discountToApply = Math.max(0, retailPriceOfPart - product.promoPrice);
                    }
                }

                const newEstimatedCost = currentRepairJob.estimatedCost - discountToApply;
                const newPaidTotal = (currentRepairJob.amountPaid || 0) + paidToRepair;
                const isFullyPaid = newPaidTotal >= (newEstimatedCost - 0.01);

                transaction.update(jobRef, { 
                    estimatedCost: Number(newEstimatedCost.toFixed(2)),
                    amountPaid: Number(newPaidTotal.toFixed(2)), 
                    isPaid: isFullyPaid,
                    status: isFullyPaid ? 'Pagado' : currentRepairJob.status,
                    partsConsumed: true // Marcamos que las piezas ya salieron del stock
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
                repairJobId: repairJobId || null,
                ...(changeGiven.length > 0 && { changeGiven, totalChangeInUSD }),
                actualPaidAmount: actualNetPaidInUSD
            });
        });

        toast({ title: totalPaidInUSD < total - 0.01 ? "Abono Registrado" : "Venta Completada" });
        return { 
            id: saleId, 
            items: cartWithPrices, 
            subtotal, 
            discount, 
            totalAmount: total, 
            payments, 
            transactionDate: new Date().toISOString(), 
            status: 'completed',
            changeGiven,
            totalChangeInUSD,
            repairJobId: repairJobId || null
        } as Sale;
      } catch (e: any) {
        toast({ variant: "destructive", title: "Error", description: e.message });
        return null;
      }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
        <div className="p-4 border-b bg-white">
            <h2 className="text-lg font-semibold">Carrito de Ventas</h2>
        </div>
      <ScrollArea className="flex-1 bg-white">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-[50%] text-[10px] uppercase">PRODUCTO</TableHead>
                    <TableHead className="text-center text-[10px] uppercase">CANT</TableHead>
                    <TableHead className="text-right text-[10px] uppercase">TOTAL</TableHead>
                    <TableHead className="w-[100px] text-right text-[10px] uppercase">ACCIONES</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {cart.map((item) => {
                    const productData = allProducts.find(p => p.id === item.productId);
                    
                    let hasPromoAvailable = false;
                    if (item.isRepair) {
                        const partId = activeRepairJob?.reservedParts?.[0]?.productId;
                        if (partId) {
                            const partProduct = allProducts.find(p => p.id === partId);
                            hasPromoAvailable = !!(partProduct?.promoPrice && partProduct.promoPrice > 0);
                        }
                    } else {
                        hasPromoAvailable = !!(productData?.promoPrice && productData.promoPrice > 0);
                    }

                    return (
                        <TableRow key={item.productId} className={cn(
                            item.isGift && "bg-green-50/50",
                            item.isPromo && "bg-blue-50/50"
                        )}>
                            <TableCell className="font-medium text-xs py-3">
                                <div className="flex flex-col gap-1">
                                    <span className={cn(item.isGift && "line-through text-muted-foreground")}>{item.name}</span>
                                    <div className="flex flex-wrap gap-1">
                                        {item.isPromo && <Badge className="bg-blue-600 text-white text-[9px] h-4 px-1">OFERTA EFECTIVO</Badge>}
                                        {item.isGift && <Badge className="bg-green-600 text-white text-[9px] h-4 px-1">OBSEQUIO</Badge>}
                                        {item.isRepair && <Badge variant="outline" className="text-[9px] h-4 px-1">REPARACIÓN</Badge>}
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell className="text-center">
                                <input 
                                    type="number" 
                                    value={item.quantity} 
                                    onChange={(e) => onUpdateQuantity(item.productId, Math.max(1, parseInt(e.target.value) || 1))} 
                                    className="w-10 border rounded text-center text-xs h-7" 
                                    disabled={item.isRepair} 
                                />
                            </TableCell>
                            <TableCell className="text-right font-bold text-xs">
                                {getSymbol()}{formatCurrency(getPrice(item) * item.quantity)}
                            </TableCell>
                            <TableCell className="text-right">
                                <div className="flex justify-end items-center gap-0.5">
                                    <TooltipProvider>
                                        {hasPromoAvailable && !item.isCustom && (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className={cn("h-7 w-7", item.isPromo ? "text-blue-600 bg-blue-100" : "text-muted-foreground")}
                                                        onClick={() => onTogglePromo(item.productId)}
                                                    >
                                                        <TicketPercent className="h-3.5 w-3.5" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent><p>Activar Precio Oferta</p></TooltipContent>
                                            </Tooltip>
                                        )}
                                        
                                        {!item.isRepair && (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className={cn("h-7 w-7", item.isGift ? "text-green-600 bg-green-100" : "text-muted-foreground")}
                                                        onClick={() => onToggleGift(item.productId)}
                                                    >
                                                        <Gift className="h-3.5 w-3.5" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent><p>Marcar como Obsequio</p></TooltipContent>
                                            </Tooltip>
                                        )}

                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-7 w-7 text-destructive hover:bg-destructive/10" 
                                                    onClick={() => onRemoveItem(item.productId)}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent><p>Quitar del carrito</p></TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                            </TableCell>
                        </TableRow>
                    );
                })}
                {cart.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={4} className="h-32 text-center text-muted-foreground italic">
                            El carrito está vacío
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </Table>
      </ScrollArea>
      <div className="p-4 border-t bg-gray-50 space-y-3">
        <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground font-medium uppercase tracking-tight">Total a Pagar:</span>
            <div className="text-right flex flex-col items-end">
                <span className="font-black text-2xl text-primary leading-none">
                    {getSymbol('USD')}{formatCurrency(total, 'USD')}
                </span>
                <span className="text-sm font-bold text-muted-foreground mt-1">
                    Bs {formatCurrency(convert(total, 'USD', 'Bs'), 'Bs')}
                </span>
            </div>
        </div>
        <CheckoutDialog cart={cart} allProducts={allProducts} total={total} onCheckout={handleCheckout} onClearCart={onClearCart} isRepairSale={!!repairJobId}>
            <Button size="lg" className="w-full h-12 text-lg font-black shadow-lg" disabled={cart.length === 0}>
                PAGAR COMPRA
            </Button>
        </CheckoutDialog>
        <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground h-7" onClick={onClearCart} disabled={cart.length === 0}>
            Vaciar Carrito
        </Button>
      </div>
    </div>
  );
}
