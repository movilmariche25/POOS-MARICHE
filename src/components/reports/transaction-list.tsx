
"use client"

import type { Sale, Payment, Product, CartItem, RepairJob, UserProfile } from "@/lib/types";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useCurrency } from "@/hooks/use-currency";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { ReceiptView, handlePrintReceipt } from "../pos/receipt-view";
import { Button } from "../ui/button";
import { Printer, Undo2, AlertTriangle } from "lucide-react";
import React, { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "../ui/skeleton";
import { AdminAuthDialog } from "../admin-auth-dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { useFirebase, useDoc, useMemoFirebase } from "@/firebase";
import { doc, runTransaction } from "firebase/firestore";
import { Badge } from "../ui/badge";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";

type TransactionListProps = {
    sales: Sale[];
    isLoading?: boolean;
};

const RefundButton = ({ sale }: { sale: Sale }) => {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [refundReason, setRefundReason] = useState("");
    const [stockAction, setStockAction] = useState<'return' | 'damage'>('return');
    
    const handleRefund = async () => {
        if (!firestore || !user || !sale.id || !refundReason.trim()) return;
        
        try {
            await runTransaction(firestore, async (transaction) => {
                if (sale.repairJobId) {
                    const repairJobRef = doc(firestore, 'users', user.uid, 'repair_jobs', sale.repairJobId);
                    const repairJobDoc = await transaction.get(repairJobRef);
                    if (repairJobDoc.exists()) {
                        transaction.update(repairJobRef, { 
                            status: 'Pendiente', 
                            isPaid: false, 
                            amountPaid: 0,
                            partsConsumed: false // Permitimos que vuelvan a deducirse si se vuelve a pagar
                        });
                    }
                }

                for (const item of sale.items) {
                    if (item.isCustom) continue;
                    const productRef = doc(firestore, 'users', user.uid, 'products', item.productId);
                    const productDoc = await transaction.get(productRef);
                    if (productDoc.exists()) {
                        const data = productDoc.data() as Product;
                        const newStock = data.stockLevel + item.quantity;
                        const newDamaged = stockAction === 'damage' ? (data.damagedStock || 0) + item.quantity : data.damagedStock;
                        transaction.update(productRef, { stockLevel: newStock, damagedStock: newDamaged });
                    }
                }

                const saleRef = doc(firestore, 'users', user.uid, 'sale_transactions', sale.id!);
                transaction.update(saleRef, { status: 'refunded', refundedAt: new Date().toISOString(), refundReason });
            });

            toast({ title: "Reembolso Completado" });
        } catch (error) {
            toast({ variant: "destructive", title: "Error en el Reembolso" });
        } finally {
            setIsConfirmOpen(false);
        }
    };
    
    if (sale.status === 'refunded') return <Badge variant="secondary">Reembolsado</Badge>;
    
    return (
        <div className="flex items-center gap-2">
            {sale.reconciliationId && <Badge variant="outline" className="border-green-600 text-green-600">Cerrada</Badge>}
            <AdminAuthDialog onAuthorized={() => setIsConfirmOpen(true)}>
                <Button variant="outline" size="sm" className="h-8"><Undo2 className="mr-2 h-4 w-4" /> Reembolsar</Button>
            </AdminAuthDialog>
            <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Confirmar Reembolso?</AlertDialogTitle>
                    </AlertDialogHeader>
                    <div className="py-4 space-y-4">
                        {sale.reconciliationId && (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-800 leading-tight">
                                    Esta venta ya fue parte de un cierre de caja. El reembolso afectará el inventario pero no modificará el monto histórico del reporte de cierre ya impreso.
                                </p>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>Motivo de la devolución</Label>
                            <Textarea 
                                placeholder="Ej: Cliente desistió de la compra, equipo incompatible..." 
                                value={refundReason} 
                                onChange={(e) => setRefundReason(e.target.value)} 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Acción sobre el inventario</Label>
                            <RadioGroup value={stockAction} onValueChange={(v: any) => setStockAction(v)}>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="return" id="r1" />
                                    <Label htmlFor="r1" className="font-normal">Devolver a stock (Disponible)</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="damage" id="r2" />
                                    <Label htmlFor="r2" className="font-normal">Mover a dañado/garantía</Label>
                                </div>
                            </RadioGroup>
                        </div>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRefund} disabled={!refundReason.trim()} className="bg-destructive">Confirmar Reembolso</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export function TransactionList({ sales, isLoading }: TransactionListProps) {
    const { firestore, user } = useFirebase();
    const { format: formatCurrency, getSymbol, convert } = useCurrency();
    const { toast } = useToast();

    const profileRef = useMemoFirebase(() => 
        (firestore && user) ? doc(firestore, 'users', user.uid) : null,
        [firestore, user?.uid]
    );
    const { data: profile } = useDoc<UserProfile>(profileRef);

    const onReprint = (sale: Sale) => {
        handlePrintReceipt({
            sale,
            currency: { format: formatCurrency, getSymbol, convert },
            businessName: profile?.businessName
        }, (error) => {
            toast({
                variant: "destructive",
                title: "Error de Impresión",
                description: error
            });
        });
    };

    if (isLoading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
    if (sales.length === 0) return <p className="text-muted-foreground text-center">No hay transacciones.</p>
    
    const sortedSales = [...sales].sort((a, b) => {
        const dateA = a.transactionDate ? new Date(a.transactionDate).getTime() : 0;
        const dateB = b.transactionDate ? new Date(b.transactionDate).getTime() : 0;
        return dateB - dateA;
    });

    return (
        <Accordion type="single" collapsible className="w-full">
            {sortedSales.map((sale) => (
                <AccordionItem value={sale.id!} key={sale.id}>
                    <AccordionTrigger className="hover:no-underline">
                        <div className="flex justify-between w-full pr-4">
                            <div className="text-left">
                                <p className="font-semibold">{sale.transactionDate ? format(parseISO(sale.transactionDate), "dd/MM/yy hh:mm a", { locale: es }) : 'Sin fecha'}</p>
                                <p className="text-xs text-muted-foreground">{sale.id}</p>
                            </div>
                            <div className="flex items-center gap-4">
                                {sale.reconciliationId && <Badge variant="outline" className="border-green-600 text-green-600">Cerrada</Badge>}
                                {sale.status === 'refunded' && <Badge variant="destructive">Reembolsado</Badge>}
                                <p className="font-semibold text-lg">{getSymbol()}{formatCurrency(sale.totalAmount)}</p>
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent>
                        <div className="p-4 bg-muted/30 rounded-lg space-y-4">
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" className="h-8" onClick={() => onReprint(sale)}>
                                    <Printer className="mr-2 h-4 w-4" /> Reimprimir Ticket
                                </Button>
                                <RefundButton sale={sale} />
                            </div>
                            
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Producto / Servicio</TableHead>
                                        <TableHead className="text-center">Cant.</TableHead>
                                        <TableHead className="text-right">Precio</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sale.items.map((item, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell className="font-medium text-xs">{item.name}</TableCell>
                                            <TableCell className="text-center">{item.quantity}</TableCell>
                                            <TableCell className="text-right">${formatCurrency(item.price)}</TableCell>
                                            <TableCell className="text-right font-bold">${formatCurrency(item.price * item.quantity)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>

                            <div className="border-t pt-2 space-y-1 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Método(s) de Pago:</span>
                                    <span className="font-medium uppercase">{sale.paymentMethod}</span>
                                </div>
                                {sale.payments.map((p, i) => (
                                    <div key={i} className="flex justify-between text-xs pl-4">
                                        <span>- {p.method} {p.reference ? `(${p.reference})` : ''}</span>
                                        <span>{p.method === 'Efectivo USD' ? '$' : 'Bs '}{formatCurrency(p.amount)}</span>
                                    </div>
                                ))}
                                
                                {sale.changeGiven && sale.changeGiven.length > 0 && (
                                    <div className="pt-2">
                                        <span className="text-muted-foreground font-bold">Vuelto Entregado:</span>
                                        {sale.changeGiven.map((c, i) => (
                                            <div key={i} className="flex justify-between text-xs pl-4 text-destructive">
                                                <span>- {c.method}</span>
                                                <span>{c.method === 'Efectivo USD' ? '$' : 'Bs '}{formatCurrency(c.amount)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </AccordionContent>
                </AccordionItem>
            ))}
        </Accordion>
    )
}
