"use client";

import type { CartItem, Payment, Product, Sale, RepairJob, ReservedPart } from "@/lib/types";
import { Button } from "../ui/button";
import { Trash2, TicketPercent, Gift, ParkingSquare, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { CheckoutDialog } from "./checkout-dialog";
import { useCurrency } from "@/hooks/use-currency";
import { ScrollArea } from "../ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useFirebase, useDoc, useMemoFirebase } from "@/firebase";
import { doc, runTransaction, type DocumentSnapshot } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { format } from 'date-fns';
import { cn } from "@/lib/utils";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { HoldSaleDialog } from "./hold-sale-dialog";

type CartDisplayProps = {
  cart: CartItem[];
  allProducts: Product[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string, isRepair?: boolean) => void;
  onClearCart: () => void;
  onTogglePromo: (productId: string) => void;
  onToggleGift: (productId: string) => void;
  onToggleWarranty: (productId: string) => void;
  onHoldSale?: (name: string) => void;
  repairJobId?: string;
};

function generateSaleId() {
    const date = new Date();
    return `S-${format(date, "yyMMdd")}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function CartDisplay({ cart, allProducts, onUpdateQuantity, onRemoveItem, onClearCart, repairJobId, onTogglePromo, onToggleGift, onToggleWarranty, onHoldSale }: CartDisplayProps) {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();
  const { format: formatCurrency, getFinalPrice, getSymbol, convert, bcvRate, parallelRate } = useCurrency();
  const [discount] = useState(0);
  
  const repairJobRef = useMemoFirebase(() => 
    (repairJobId && firestore && user) ? doc(firestore, 'users', user.uid, 'repair_jobs', repairJobId) : null,
    [repairJobId, firestore, user?.uid]
  );
  const { data: activeRepairJob } = useDoc<RepairJob>(repairJobRef);

  const getPrice = (item: CartItem) => {
    if (item.isGift || item.isWarranty) return 0;
    
    if (item.isRepair) {
        if (!activeRepairJob) return 0;
        const basePending = Math.max(0, activeRepairJob.estimatedCost - (activeRepairJob.amountPaid || 0));
        
        if (item.isPromo && activeRepairJob.reservedParts && activeRepairJob.reservedParts.length > 0) {
            let totalAdditionalDiscount = 0;
            activeRepairJob.reservedParts.forEach(part => {
                if (!part.isPromo) {
                    const product = allProducts.find(p => p.id === part.productId);
                    if (product && product.promoPrice && product.promoPrice > 0) {
                        const retailPriceOfPart = getFinalPrice(product);
                        const diff = Math.max(0, retailPriceOfPart - product.promoPrice);
                        totalAdditionalDiscount += diff * part.quantity;
                    }
                }
            });
            return Math.max(0, basePending - totalAdditionalDiscount);
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

  // Solo usamos tasa de reposición si hay al menos un artículo en promoción
  const hasPromo = cart.some(i => i.isPromo);

  const handleCheckout = async (payments: Payment[], changeGiven: Payment[], totalChangeInUSD: number): Promise<Sale | null> => {
      if (!firestore || !user) return null;

      const saleId = generateSaleId();
      const cartWithPrices = cart.map(item => ({ ...item, price: getPrice(item) }));
      const hasRepairInCart = cartWithPrices.some(i => i.isRepair);

      const totalPaidInUSD = payments.reduce((acc, p) => {
          // CRITICAL: Usamos tasa de reposición (Parallel) SOLO si hay promociones involucradas
          return acc + (p.method === 'Efectivo USD' ? p.amount : convert(p.amount, 'Bs', 'USD', hasPromo));
      }, 0);
      const actualNetPaidInUSD = totalPaidInUSD - totalChangeInUSD;

      try {
        await runTransaction(firestore, async (transaction) => {
            const productIdsToGet = new Set<string>();
            const currentRepairJobSnap = (repairJobId && hasRepairInCart) ? await transaction.get(repairJobRef!) : null;
            const currentRepairJob = currentRepairJobSnap?.exists() ? currentRepairJobSnap.data() as RepairJob : null;

            if (currentRepairJob?.reservedParts && hasRepairInCart) {
                currentRepairJob.reservedParts.forEach(p => { if(!p.isManual) productIdsToGet.add(p.productId) });
            }
            cartWithPrices.filter(i => !i.isRepair && !i.isCustom).forEach(i => productIdsToGet.add(i.productId));

            const productSnapshots = new Map<string, DocumentSnapshot>();
            for (const id of Array.from(productIdsToGet)) {
                const snap = await transaction.get(doc(firestore, 'users', user.uid, 'products', id));
                productSnapshots.set(id, snap);
            }

            const stockDeductions = new Map<string, { stock: number, reserved: number }>();

            if (currentRepairJob?.reservedParts && hasRepairInCart) {
                for (const part of currentRepairJob.reservedParts) {
                    if (part.isManual) continue;
                    const current = stockDeductions.get(part.productId) || { stock: 0, reserved: 0 };
                    stockDeductions.set(part.productId, { 
                        stock: current.stock + part.quantity, 
                        reserved: current.reserved + part.quantity 
                    });
                }
            }

            for (const item of cartWithPrices) {
                if (item.isRepair || item.isCustom) continue;
                const current = stockDeductions.get(item.productId) || { stock: 0, reserved: 0 };
                stockDeductions.set(item.productId, { 
                    stock: current.stock + item.quantity, 
                    reserved: current.reserved 
                });
            }

            for (const [pid, ded] of Array.from(stockDeductions.entries())) {
                const pSnap = productSnapshots.get(pid);
                if (pSnap?.exists()) {
                    const data = pSnap.data() as Product;
                    if (data.stockLevel < ded.stock) {
                        throw new Error(`¡Inventario Bloqueado! Solo quedan ${data.stockLevel} ${data.unit || 'un.'} de "${data.name}".`);
                    }

                    transaction.update(pSnap.ref, { 
                        stockLevel: data.stockLevel - ded.stock,
                        reservedStock: Math.max(0, (data.reservedStock || 0) - ded.reserved)
                    });
                }
            }

            if (repairJobId && currentRepairJob && hasRepairInCart) {
                const jobRef = doc(firestore, 'users', user.uid, 'repair_jobs', repairJobId);
                const otherItemsTotal = cartWithPrices
                    .filter(i => !i.isRepair)
                    .reduce((sum, i) => sum + (i.price * i.quantity), 0);
                
                const paidToRepair = Math.max(0, actualNetPaidInUSD - otherItemsTotal);
                
                let additionalDiscountToApply = 0;
                const repairItem = cartWithPrices.find(i => i.isRepair);
                if (repairItem?.isPromo && currentRepairJob.reservedParts) {
                    currentRepairJob.reservedParts.forEach(part => {
                        if (!part.isPromo) {
                            const product = allProducts.find(p => p.id === part.productId);
                            if (product && product.promoPrice && product.promoPrice > 0) {
                                additionalDiscountToApply += (getFinalPrice(product) - product.promoPrice) * part.quantity;
                            }
                        }
                    });
                }

                const newEstimatedCost = currentRepairJob.estimatedCost - additionalDiscountToApply;
                const newPaidTotal = (currentRepairJob.amountPaid || 0) + paidToRepair;
                const isFullyPaid = newPaidTotal >= (newEstimatedCost - 0.01);

                transaction.update(jobRef, { 
                    estimatedCost: Number(newEstimatedCost.toFixed(2)),
                    amountPaid: Number(newPaidTotal.toFixed(2)), 
                    isPaid: isFullyPaid,
                    status: isFullyPaid ? 'Pagado' : currentRepairJob.status,
                    partsConsumed: true,
                    consumedParts: [...(currentRepairJob.consumedParts || []), ...(currentRepairJob.reservedParts || [])],
                    reservedParts: []
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
                repairJobId: (repairJobId && hasRepairInCart) ? repairJobId : null,
                ...(changeGiven.length > 0 && { changeGiven, totalChangeInUSD }),
                actualPaidAmount: actualNetPaidInUSD,
                bcvRateAtTime: bcvRate,
                parallelRateAtTime: parallelRate
            });
        });

        toast({ title: totalPaidInUSD < total - 0.01 ? "Abono Registrado Correctamente" : "Venta Completada con Éxito" });
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
            repairJobId: (repairJobId && hasRepairInCart) ? repairJobId : null,
            bcvRateAtTime: bcvRate,
            parallelRateAtTime: parallelRate
        } as Sale;
      } catch (e: any) {
        console.error("Transacción mixta fallida:", e);
        toast({ 
            variant: "destructive", 
            title: "Error de Sincronización", 
            description: e.message || "No se pudo completar la operación." 
        });
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
                    <TableHead className="text-center text-[10px] uppercase">CANT/PESO</TableHead>
                    <TableHead className="text-right text-[10px] uppercase">TOTAL</TableHead>
                    <TableHead className="w-[100px] text-right text-[10px] uppercase">ACCIONES</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {cart.map((item) => {
                    const productData = allProducts.find(p => p.id === item.productId);
                    const unitLabel = productData?.unit && productData.unit !== 'unit' ? productData.unit : '';
                    
                    let hasPromoAvailable = false;
                    if (item.isRepair) {
                        hasPromoAvailable = !!activeRepairJob?.reservedParts?.some(part => {
                            const p = allProducts.find(prod => prod.id === part.productId);
                            return p && p.promoPrice && p.promoPrice > 0 && !part.isPromo;
                        });
                    } else {
                        hasPromoAvailable = !!(productData?.promoPrice && productData.promoPrice > 0);
                    }

                    return (
                        <TableRow key={item.productId + (item.isRepair ? '-rep' : '')} className={cn(
                            item.isGift && "bg-green-50/50",
                            item.isWarranty && "bg-orange-50/50",
                            item.isPromo && "bg-blue-50/50"
                        )}>
                            <TableCell className="font-medium text-xs py-3">
                                <div className="flex flex-col gap-1">
                                    <span className={cn((item.isGift || item.isWarranty) && "line-through text-muted-foreground")}>{item.name}</span>
                                    <div className="flex flex-wrap gap-1">
                                        {item.isPromo && <Badge className="bg-blue-600 text-white text-[9px] h-4 px-1">OFERTA</Badge>}
                                        {item.isGift && <Badge className="bg-green-600 text-white text-[9px] h-4 px-1">OBSEQUIO</Badge>}
                                        {item.isWarranty && <Badge className="bg-orange-600 text-white text-[9px] h-4 px-1">GARANTÍA</Badge>}
                                        {item.isRepair && <Badge variant="outline" className="text-[9px] h-4 px-1">REPARACIÓN</Badge>}
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell className="text-center">
                                <div className="flex flex-col items-center gap-0.5">
                                    <input 
                                        type="number" 
                                        step="any"
                                        value={item.quantity} 
                                        onChange={(e) => onUpdateQuantity(item.productId, Math.max(0.001, parseFloat(e.target.value) || 0))} 
                                        className="w-16 border rounded text-center text-xs h-7" 
                                        disabled={item.isRepair} 
                                    />
                                    {unitLabel && <span className="text-[8px] font-bold text-muted-foreground uppercase">{unitLabel}</span>}
                                </div>
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
                                                        type="button"
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
                                            <>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button 
                                                            type="button" 
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
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button 
                                                            type="button" 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className={cn("h-7 w-7", item.isWarranty ? "text-orange-600 bg-orange-100" : "text-muted-foreground")}
                                                            onClick={() => onToggleWarranty(item.productId)}
                                                        >
                                                            <ShieldAlert className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent><p>Reemplazo por Garantía ($0)</p></TooltipContent>
                                                </Tooltip>
                                            </>
                                        )}

                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button 
                                                    type="button"
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-7 w-7 text-destructive hover:bg-destructive/10" 
                                                    onClick={() => onRemoveItem(item.productId, item.isRepair)}
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
                    Bs {formatCurrency(convert(total, 'USD', 'Bs', hasPromo), 'Bs')}
                </span>
            </div>
        </div>
        <CheckoutDialog cart={cart} allProducts={allProducts} total={total} onCheckout={handleCheckout} onClearCart={onClearCart} isRepairSale={!!repairJobId && cart.some(i => i.isRepair)} repairData={activeRepairJob}>
            <Button size="lg" className="w-full h-12 text-lg font-black shadow-lg" disabled={cart.length === 0}>
                PAGAR COMPRA
            </Button>
        </CheckoutDialog>
        
        <div className="grid grid-cols-2 gap-2">
            {onHoldSale && (
                <HoldSaleDialog onHoldSale={onHoldSale} disabled={cart.length === 0 || cart.some(c => c.isRepair)}>
                    <Button variant="outline" size="sm" className="w-full text-xs h-8">
                        <ParkingSquare className="mr-2 h-3.5 w-3.5" /> Aparcar Venta
                    </Button>
                </HoldSaleDialog>
            )}
            <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground h-8" onClick={onClearCart} disabled={cart.length === 0}>
                Vaciar Carrito
            </Button>
        </div>
      </div>
    </div>
  );
}