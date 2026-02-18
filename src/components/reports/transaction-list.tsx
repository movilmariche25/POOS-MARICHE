
"use client"

import type { Sale, Payment, Product, CartItem, RepairJob } from "@/lib/types";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useCurrency } from "@/hooks/use-currency";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { ReceiptView, handlePrintReceipt } from "../pos/receipt-view";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Printer, Undo2, CheckCircle2 } from "lucide-react";
import React, { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "../ui/skeleton";
import { AdminAuthDialog } from "../admin-auth-dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { useFirebase } from "@/firebase";
import { doc, runTransaction } from "firebase/firestore";
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";
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
                        transaction.update(repairJobRef, { status: 'Pendiente', isPaid: false, amountPaid: 0 });
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
    if (sale.reconciliationId) return <Badge variant="outline">Cerrada</Badge>;
    
    return (
        <>
            <AdminAuthDialog onAuthorized={() => setIsConfirmOpen(true)}>
                <Button variant="outline" size="sm"><Undo2 className="mr-2 h-4 w-4" /> Reembolsar</Button>
            </AdminAuthDialog>
            <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>¿Confirmar Reembolso?</AlertDialogTitle></AlertDialogHeader>
                    <div className="py-4 space-y-4">
                        <Label>Motivo</Label>
                        <Textarea value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
                        <RadioGroup value={stockAction} onValueChange={(v: any) => setStockAction(v)}>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="return" id="r1" /><Label htmlFor="r1">Devolver a stock</Label></div>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="damage" id="r2" /><Label htmlFor="r2">Mover a dañado</Label></div>
                        </RadioGroup>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRefund} disabled={!refundReason.trim()} className="bg-destructive">Confirmar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};

export function TransactionList({ sales, isLoading }: TransactionListProps) {
    const { format: formatCurrency, getSymbol } = useCurrency();
    if (isLoading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
    if (sales.length === 0) return <p className="text-muted-foreground text-center">No hay transacciones.</p>
    const sortedSales = [...sales].sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());

    return (
        <Accordion type="single" collapsible className="w-full">
            {sortedSales.map((sale) => (
                <AccordionItem value={sale.id!} key={sale.id}>
                    <AccordionTrigger>
                        <div className="flex justify-between w-full pr-4">
                            <div className="text-left">
                                <p className="font-semibold">{format(parseISO(sale.transactionDate), "dd/MM/yy", { locale: es })}</p>
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
                        <div className="flex justify-end mb-2"><RefundButton sale={sale} /></div>
                        <Table>
                            <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {sale.items.map(item => (
                                    <TableRow key={item.productId}><TableCell>{item.name}</TableCell><TableCell className="text-right">${formatCurrency(item.price * item.quantity)}</TableCell></TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </AccordionContent>
                </AccordionItem>
            ))}
        </Accordion>
    )
}
