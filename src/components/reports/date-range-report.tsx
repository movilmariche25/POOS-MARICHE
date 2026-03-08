
"use client";

import { useState, useMemo } from "react";
import type { Sale, Product, DailyReconciliation, RepairJob, CurrencyExchange } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { DateRange } from "react-day-picker";
import { format, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "../ui/button";
import { CalendarIcon, Landmark, DollarSign, Info, Sigma, TrendingUp, ShoppingBag, Package } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import { Skeleton } from "../ui/skeleton";
import { Separator } from "../ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

type DateRangeReportProps = {
    sales: Sale[];
    products: Product[];
    reconciliations: DailyReconciliation[];
    repairJobs: RepairJob[];
    exchanges: CurrencyExchange[];
    isLoading?: boolean;
};

export function DateRangeReport({ sales, products, reconciliations, repairJobs, exchanges, isLoading }: DateRangeReportProps) {
    const { format: formatCurrency, getSymbol, convert, settings } = useCurrency();
    const [date, setDate] = useState<DateRange | undefined>({
        from: startOfDay(new Date()),
        to: endOfDay(new Date()),
    });

    const stats = useMemo(() => {
        if (!date?.from || !sales || !repairJobs || !products || !settings) {
            return { 
                totalSales: 0, 
                totalProfit: 0, 
                totalReconciliationDifference: 0, 
                adjustedTotalSales: 0, 
                transactionCount: 0, 
                bsBreakdown: {}, 
                usdNet: 0,
                itemsBreakdown: [] 
            };
        }

        const from = startOfDay(date.from);
        const to = endOfDay(date.to || date.from);

        const bsBreakdown: Record<string, number> = { 
            'Efectivo Bs': 0, 
            'Tarjeta / Pago Móvil': 0, 
            'Transferencia': 0 
        };
        let usdNet = 0;

        const filteredSales = sales.filter(s => {
            if (s.status !== 'completed' || !s.transactionDate) return false;
            return isWithinInterval(new Date(s.transactionDate), { start: from, end: to });
        });

        // Consolidamos items para el desglose
        const itemsMap = new Map<string, { 
            name: string, 
            quantity: number, 
            totalCost: number, 
            totalRevenue: number,
            isRepair: boolean 
        }>();

        filteredSales.forEach(s => {
            // Flujo de caja neto
            s.payments.forEach(p => {
                if (p.method === 'Efectivo USD') usdNet += p.amount;
                else if (p.method === 'Efectivo Bs') bsBreakdown['Efectivo Bs'] += p.amount;
                else if (p.method === 'Tarjeta' || p.method === 'Pago Móvil' || p.method === 'Tarjeta / Pago Móvil') {
                    bsBreakdown['Tarjeta / Pago Móvil'] += p.amount;
                } else if (p.method === 'Transferencia') {
                    bsBreakdown['Transferencia'] += p.amount;
                }
            });
            s.changeGiven?.forEach(c => {
                if (c.method === 'Efectivo USD') usdNet -= c.amount;
                else if (c.method === 'Efectivo Bs') bsBreakdown['Efectivo Bs'] -= c.amount;
                else if (c.method === 'Tarjeta' || c.method === 'Pago Móvil' || c.method === 'Tarjeta / Pago Móvil') {
                    bsBreakdown['Tarjeta / Pago Móvil'] -= c.amount;
                } else if (c.method === 'Transferencia') {
                    bsBreakdown['Transferencia'] -= c.amount;
                }
            });

            // Desglose de rentabilidad por item
            const totalCollected = s.actualPaidAmount ?? s.totalAmount;
            const itemsTotalBillable = s.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
            
            // Proporción de pago (para manejar abonos parciales correctamente)
            const paymentRatio = itemsTotalBillable > 0 ? totalCollected / itemsTotalBillable : 1;

            s.items.forEach(item => {
                const itemRevenue = (item.price * item.quantity) * paymentRatio;
                let itemCost = 0;
                let key = item.productId;
                let name = item.name;
                let isRepair = !!item.isRepair;

                if (item.isRepair) {
                    key = `repair-${item.productId}`;
                    const repair = repairJobs.find(rj => rj.id === (s.repairJobId || item.productId));
                    if (repair && repair.reservedParts) {
                        itemCost = repair.reservedParts.reduce((sum, p) => sum + (p.costPrice * p.quantity), 0);
                    }
                } else if (item.isCustom) {
                    key = `custom-${item.name}`;
                    itemCost = (item.customCostPrice || 0) * item.quantity;
                } else {
                    const product = products.find(p => p.id === item.productId);
                    itemCost = (product?.costPrice || 0) * item.quantity;
                }

                const existing = itemsMap.get(key);
                if (existing) {
                    existing.quantity += item.quantity;
                    existing.totalCost += itemCost;
                    existing.totalRevenue += itemRevenue;
                } else {
                    itemsMap.set(key, {
                        name,
                        quantity: item.quantity,
                        totalCost: itemCost,
                        totalRevenue: itemRevenue,
                        isRepair
                    });
                }
            });
        });

        const filteredExchanges = exchanges.filter(e => {
            const eDate = new Date(e.createdAt);
            return isWithinInterval(eDate, { start: from, end: to });
        });

        filteredExchanges.forEach(e => {
            usdNet += e.usdAmount;
            if (e.sourceMethod === 'Tarjeta' || e.sourceMethod === 'Pago Móvil' || e.sourceMethod === 'Tarjeta / Pago Móvil') {
                bsBreakdown['Tarjeta / Pago Móvil'] -= e.bsAmount;
            } else if (bsBreakdown[e.sourceMethod] !== undefined) {
                bsBreakdown[e.sourceMethod] -= e.bsAmount;
            }
        });

        const totalIncomeFromSales = filteredSales.reduce((sum, s) => sum + (s.actualPaidAmount ?? s.totalAmount), 0);
        
        const itemsBreakdown = Array.from(itemsMap.values()).map(item => ({
            ...item,
            profit: item.totalRevenue - item.totalCost
        })).sort((a, b) => b.totalRevenue - a.totalRevenue);

        const totalProductCosts = itemsBreakdown.reduce((sum, i) => sum + i.totalCost, 0);

        const filteredReconciliations = (reconciliations || []).filter(r => {
             const reconDate = new Date(r.date);
             return isWithinInterval(reconDate, { start: from, end: to });
        });

        const totalProfit = itemsBreakdown.reduce((sum, i) => sum + i.profit, 0);
        const totalReconciliationDifference = filteredReconciliations.reduce((sum, r) => sum + r.totalDifference, 0);

        return {
            totalSales: totalIncomeFromSales,
            totalProfit,
            totalReconciliationDifference,
            adjustedTotalSales: totalIncomeFromSales + totalReconciliationDifference,
            transactionCount: filteredSales.length,
            bsBreakdown,
            usdNet,
            itemsBreakdown,
            dateRangeLabel: date.to ? `${format(from, "dd/MM/yy")} al ${format(to, "dd/MM/yy")}` : format(from, "dd/MM/yy")
        };

    }, [date, sales, products, reconciliations, repairJobs, exchanges, settings]);

    if (isLoading) return <div className="p-4 space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;

    return (
        <div className="space-y-6">
            <Card className="shadow-lg border-2 border-primary/5">
                <CardHeader className="bg-primary/5 pb-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <CardTitle className="text-xl font-black text-primary">REPORTE DE FLUJO POR PERIODO</CardTitle>
                            <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Movimiento Neto (Solo rango seleccionado)</CardDescription>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                            <Popover>
                                <PopoverTrigger asChild>
                                <Button variant={"outline"} className={cn("w-full sm:w-[300px] justify-start text-left font-bold bg-white border-2", !date && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {date?.from ? (date.to ? `${format(date.from, "dd/MM/yy")} - ${format(date.to, "dd/MM/yy")}` : format(date.from, "dd/MM/yy")) : "Seleccionar fecha"}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end"><Calendar initialFocus mode="range" selected={date} onSelect={setDate} numberOfMonths={2} locale={es}/></PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-8 pt-6">
                    
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest">Flujo de Periodo (Entradas - Salidas)</h3>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger><Info className="w-3.5 h-3.5 text-muted-foreground" /></TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                        <p className="text-[10px]">Muestra estrictamente cuánto dinero entró y salió en las fechas marcadas, sin sumar el fondo de apertura.</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card className="bg-slate-900 text-white border-none shadow-xl overflow-hidden relative">
                                <div className="absolute right-2 top-2 opacity-10"><DollarSign className="w-16 h-16" /></div>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-[10px] uppercase font-black text-slate-400">Flujo Neto Efectivo USD</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-black">${formatCurrency(stats.usdNet)}</div>
                                    <p className="text-[9px] text-slate-500 uppercase font-bold mt-1">Ingreso neto generado en este periodo</p>
                                </CardContent>
                            </Card>

                            <Card className="bg-white border-2 border-primary/10 shadow-md overflow-hidden relative">
                                <div className="absolute right-2 top-2 opacity-5"><Landmark className="w-16 h-16" /></div>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-[10px] uppercase font-black text-muted-foreground">Flujo Neto Bolívares</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="text-3xl font-black text-primary">Bs {formatCurrency(Object.values(stats.bsBreakdown).reduce((a,b)=>a+b, 0))}</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {Object.entries(stats.bsBreakdown).map(([method, amount]) => (
                                            <div key={method} className="flex justify-between items-center bg-muted/30 p-1.5 rounded text-[9px]">
                                                <span className="font-bold uppercase">{method}:</span>
                                                <span className={cn("font-black", (amount as number) < 0 ? "text-destructive" : "text-slate-700")}>Bs {formatCurrency(amount as number)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    <Separator />

                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest flex items-center gap-2"><Sigma className="w-3.5 h-3.5" /> Rendimiento Operativo</h3>
                            <Badge variant="outline" className="text-[9px] border-primary/20 text-primary">SÓLO MOVIMIENTOS SELECCIONADOS</Badge>
                        </div>
                        
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <div className="p-4 rounded-xl bg-muted border-l-4 border-l-primary">
                                <p className="text-[10px] font-bold uppercase text-muted-foreground">Ventas Brutas ($)</p>
                                <p className="text-2xl font-black">{getSymbol()}{formatCurrency(stats.totalSales)}</p>
                                <p className="text-[9px] text-muted-foreground mt-1">{stats.transactionCount} transacciones</p>
                            </div>
                            <div className="p-4 rounded-xl bg-muted border-l-4 border-l-green-500">
                                <p className="text-[10px] font-bold uppercase text-muted-foreground">Utilidad Est. ($)</p>
                                <p className={cn("text-2xl font-black", stats.totalProfit > 0 ? "text-green-600" : "text-destructive")}>
                                    {getSymbol()}{formatCurrency(stats.totalProfit)}
                                </p>
                                <p className="text-[9px] text-muted-foreground mt-1">Margen sobre costo</p>
                            </div>
                            <div className="p-4 rounded-xl bg-muted border-l-4 border-l-amber-500">
                                <p className="text-[10px] font-bold uppercase text-muted-foreground">Dif. Cierres ($)</p>
                                <p className={cn("text-2xl font-black", stats.totalReconciliationDifference >= 0 ? "text-green-600" : "text-destructive")}>
                                    {stats.totalReconciliationDifference >= 0 ? '+' : ''}{getSymbol()}{formatCurrency(stats.totalReconciliationDifference)}
                                </p>
                                <p className="text-[9px] text-muted-foreground mt-1">Descuadres reportados</p>
                            </div>
                            <div className="p-4 rounded-xl bg-primary text-primary-foreground shadow-lg flex flex-col justify-center border-none">
                                <p className="text-[10px] font-bold uppercase text-primary-foreground/70 tracking-widest">Flujo de Caja Total</p>
                                <p className="text-3xl font-black">{getSymbol()}{formatCurrency(stats.adjustedTotalSales)}</p>
                                <p className="text-[8px] opacity-60 uppercase font-black mt-1">Ingreso neto final del periodo</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-lg border-2 border-primary/5">
                <CardHeader className="bg-slate-50 border-b">
                    <div className="flex items-center gap-2">
                        <ShoppingBag className="w-5 h-5 text-primary" />
                        <div>
                            <CardTitle className="text-sm font-black uppercase">Desglose de Rentabilidad por Artículo</CardTitle>
                            <CardDescription className="text-[10px]">Detalle de costos, ingresos y ganancias por cada producto o servicio vendido.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/30">
                                <TableHead className="text-[10px] font-black uppercase">Producto / Servicio</TableHead>
                                <TableHead className="text-center text-[10px] font-black uppercase">Cant.</TableHead>
                                <TableHead className="text-right text-[10px] font-black uppercase">Costo Total ($)</TableHead>
                                <TableHead className="text-right text-[10px] font-black uppercase">Venta Total ($)</TableHead>
                                <TableHead className="text-right text-[10px] font-black uppercase">Ganancia ($)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {stats.itemsBreakdown.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground italic">
                                        No hay transacciones registradas en este periodo.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                stats.itemsBreakdown.map((item, idx) => (
                                    <TableRow key={idx} className="hover:bg-muted/20">
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {item.isRepair ? <TrendingUp className="w-3 h-3 text-blue-600" /> : <Package className="w-3 h-3 text-slate-400" />}
                                                <span className="font-bold text-xs uppercase">{item.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center font-mono text-xs font-bold">{item.quantity}</TableCell>
                                        <TableCell className="text-right font-mono text-xs text-muted-foreground">${formatCurrency(item.totalCost)}</TableCell>
                                        <TableCell className="text-right font-mono text-xs font-bold text-slate-700">${formatCurrency(item.totalRevenue)}</TableCell>
                                        <TableCell className="text-right">
                                            <Badge className={cn(
                                                "font-mono text-xs",
                                                item.profit > 0 ? "bg-green-600" : "bg-destructive"
                                            )}>
                                                ${formatCurrency(item.profit)}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
