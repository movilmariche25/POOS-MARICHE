
"use client"

import type { Sale, Payment, Product, CartItem, RepairJob, UserProfile, PaymentMethod } from "@/lib/types";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { useCurrency } from "@/hooks/use-currency";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { ReceiptView, handlePrintReceipt } from "../pos/receipt-view";
import { Button } from "../ui/button";
import { Printer, Undo2, AlertTriangle, Calendar as CalendarIcon, Search, X as ClearIcon, Filter } from "lucide-react";
import React, { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "../ui/skeleton";
import { AdminAuthDialog } from "../admin-auth-dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { useFirebase, useDoc, useMemoFirebase } from "@/firebase";
import { doc, runTransaction, type DocumentSnapshot } from "firebase/firestore";
import { Badge } from "../ui/badge";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

type TransactionListProps = {
    sales: Sale[];
    isLoading?: boolean;
};

const PAYMENT_METHODS: (PaymentMethod | 'ALL')[] = [
    'ALL',
    'Efectivo USD',
    'Efectivo Bs',
    'Tarjeta',
    'Pago Móvil',
    'Transferencia'
];

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
                // 1. LECTURAS PRIMERO
                const repairJobSnap = sale.repairJobId ? await transaction.get(doc(firestore, 'users', user.uid, 'repair_jobs', sale.repairJobId)) : null;
                
                const productIds = Array.from(new Set(sale.items.filter(i => !i.isCustom).map(i => i.productId)));
                const productSnapshots = new Map<string, DocumentSnapshot>();
                for(const id of productIds) {
                    const snap = await transaction.get(doc(firestore, 'users', user.uid, 'products', id));
                    productSnapshots.set(id, snap);
                }

                // 2. ESCRITURAS DESPUÉS
                if (repairJobSnap?.exists()) {
                    transaction.update(repairJobSnap.ref, { 
                        status: 'Pendiente', 
                        isPaid: false, 
                        amountPaid: 0,
                        partsConsumed: false
                    });
                }

                for (const item of sale.items) {
                    if (item.isCustom) continue;
                    const pSnap = productSnapshots.get(item.productId);
                    if (pSnap?.exists()) {
                        const data = pSnap.data() as Product;
                        const newStock = data.stockLevel + item.quantity;
                        const newDamaged = stockAction === 'damage' ? (data.damagedStock || 0) + item.quantity : data.damagedStock;
                        transaction.update(pSnap.ref, { stockLevel: newStock, damagedStock: newDamaged });
                    }
                }

                const saleRef = doc(firestore, 'users', user.uid, 'sale_transactions', sale.id!);
                transaction.update(saleRef, { status: 'refunded', refundedAt: new Date().toISOString(), refundReason });
            });

            toast({ title: "Reembolso Completado" });
        } catch (error) {
            console.error("Refund Error:", error);
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
                        <div className="space-y-2">
                            <Label>Motivo de la devolución</Label>
                            <Textarea 
                                placeholder="Ej: Cliente desistió de la compra..." 
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

    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [methodFilter, setMethodFilter] = useState<PaymentMethod | 'ALL'>('ALL');
    const [searchRef, setSearchRef] = useState("");

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
            toast({ variant: "destructive", title: "Error de Impresión", description: error });
        });
    };

    const filteredSales = useMemo(() => {
        if (!sales) return [];
        
        return sales.filter(sale => {
            if (dateRange?.from) {
                const saleDate = parseISO(sale.transactionDate);
                const start = startOfDay(dateRange.from);
                const end = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
                if (!isWithinInterval(saleDate, { start, end })) return false;
            }

            if (methodFilter !== 'ALL') {
                const hasMethod = sale.payments.some(p => p.method === methodFilter);
                if (!hasMethod) return false;
            }

            if (searchRef.trim()) {
                const term = searchRef.toLowerCase();
                const matchesRef = sale.payments.some(p => p.reference?.toLowerCase().includes(term));
                const matchesId = sale.id?.toLowerCase().includes(term);
                if (!matchesRef && !matchesId) return false;
            }

            return true;
        }).sort((a, b) => {
            const dateA = a.transactionDate ? new Date(a.transactionDate).getTime() : 0;
            const dateB = b.transactionDate ? new Date(b.transactionDate).getTime() : 0;
            return dateB - dateA;
        });
    }, [sales, dateRange, methodFilter, searchRef]);

    const resetFilters = () => {
        setDateRange(undefined);
        setMethodFilter('ALL');
        setSearchRef("");
    };

    if (isLoading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/20 rounded-lg border">
                <div className="space-y-1.5">
                    <Label className="text-xs uppercase font-bold text-muted-foreground">Filtrar Fecha</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (
                                    dateRange.to ? (
                                        `${format(dateRange.from, "dd/MM/yy")} - ${format(dateRange.to, "dd/MM/yy")}`
                                    ) : format(dateRange.from, "dd/MM/yy")
                                ) : "Seleccionar fecha"}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="range" selected={dateRange} onSelect={setDateRange} locale={es} />
                        </PopoverContent>
                    </Popover>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs uppercase font-bold text-muted-foreground">Método de Pago</Label>
                    <Select value={methodFilter} onValueChange={(v: any) => setMethodFilter(v)}>
                        <SelectTrigger>
                            <SelectValue placeholder="Todos los métodos" />
                        </SelectTrigger>
                        <SelectContent>
                            {PAYMENT_METHODS.map(m => (
                                <SelectItem key={m} value={m}>{m === 'ALL' ? 'Todos los métodos' : m}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs uppercase font-bold text-muted-foreground">Buscar Referencia / ID</Label>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Ej: 1234, S-2401..." 
                            className="pl-8" 
                            value={searchRef}
                            onChange={(e) => setSearchRef(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex items-end">
                    <Button variant="ghost" onClick={resetFilters} className="w-full text-muted-foreground hover:text-primary">
                        <ClearIcon className="mr-2 h-4 w-4" /> Limpiar Filtros
                    </Button>
                </div>
            </div>

            {filteredSales.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-xl space-y-2">
                    <Filter className="w-12 h-12 text-muted-foreground/30 mx-auto" />
                    <p className="text-muted-foreground font-medium">No se encontraron transacciones.</p>
                    <Button variant="link" onClick={resetFilters}>Ver todo el registro</Button>
                </div>
            ) : (
                <Accordion type="single" collapsible className="w-full">
                    {filteredSales.map((sale) => (
                        <AccordionItem value={sale.id!} key={sale.id}>
                            <AccordionTrigger className="hover:no-underline">
                                <div className="flex justify-between w-full pr-4">
                                    <div className="text-left">
                                        <p className="font-semibold">{sale.transactionDate ? format(parseISO(sale.transactionDate), "dd/MM/yy hh:mm a", { locale: es }) : 'Sin fecha'}</p>
                                        <p className="text-xs text-muted-foreground font-mono">{sale.id}</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        {sale.reconciliationId && <Badge variant="outline" className="border-green-600 text-green-600">Cerrada</Badge>}
                                        {sale.status === 'refunded' && <Badge variant="destructive">Reembolsado</Badge>}
                                        <div className="text-right">
                                            <p className="font-black text-lg leading-none">{getSymbol()}{formatCurrency(sale.totalAmount)}</p>
                                        </div>
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
                                                    <TableCell className="font-medium text-xs">
                                                        {item.name}
                                                        {item.isPromo && <Badge variant="outline" className="ml-2 text-[9px] h-4 border-blue-200 text-blue-600">OFERTA</Badge>}
                                                    </TableCell>
                                                    <TableCell className="text-center">{item.quantity}</TableCell>
                                                    <TableCell className="text-right">${formatCurrency(item.price)}</TableCell>
                                                    <TableCell className="text-right font-bold">${formatCurrency(item.price * item.quantity)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            )}
        </div>
    )
}
