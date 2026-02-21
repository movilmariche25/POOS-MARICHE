
"use client";

import { useState, useMemo } from "react";
import type { Sale, Product, DailyReconciliation, RepairJob } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { DateRange } from "react-day-picker";
import { format, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "../ui/button";
import { CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import { Skeleton } from "../ui/skeleton";

type DateRangeReportProps = {
    sales: Sale[];
    products: Product[];
    reconciliations: DailyReconciliation[];
    repairJobs: RepairJob[];
    isLoading?: boolean;
};

export function DateRangeReport({ sales, products, reconciliations, repairJobs, isLoading }: DateRangeReportProps) {
    const { format: formatCurrency, getSymbol } = useCurrency();
    const [date, setDate] = useState<DateRange | undefined>({
        from: startOfDay(new Date()),
        to: endOfDay(new Date()),
    });

    const stats = useMemo(() => {
        if (!date?.from || !sales || !repairJobs || !products) {
            return { totalSales: 0, totalProfit: 0, totalReconciliationDifference: 0, adjustedTotalSales: 0, transactionCount: 0 };
        }

        const from = startOfDay(date.from);
        const to = date.to ? endOfDay(date.to) : endOfDay(date.from);

        const filteredSales = sales.filter(s => {
            if (s.status !== 'completed' || !s.transactionDate) return false;
            const saleDate = new Date(s.transactionDate);
            return isWithinInterval(saleDate, { start: from, end: to });
        });
        
        const filteredReconciliations = (reconciliations || []).filter(r => {
             const reconDate = new Date(r.date);
             return reconDate >= from && reconDate <= to;
        });

        const totalIncome = filteredSales.reduce((sum, s) => sum + (s.actualPaidAmount ?? s.totalAmount), 0);

        let totalProductCosts = 0;
        const involvedRepairs = new Set<string>();

        filteredSales.forEach(sale => {
            sale.items.forEach(item => {
                if (item.isRepair || sale.repairJobId) {
                    involvedRepairs.add(sale.repairJobId || item.productId);
                } else if (item.isCustom) {
                    totalProductCosts += (item.customCostPrice || 0) * item.quantity;
                } else {
                    const product = products.find(p => p.id === item.productId);
                    totalProductCosts += (product?.costPrice || 0) * item.quantity;
                }
            });
        });

        let totalRepairPartCosts = 0;
        involvedRepairs.forEach(rid => {
            const repair = repairJobs.find(rj => rj.id === rid);
            if (repair && repair.reservedParts) {
                totalRepairPartCosts += repair.reservedParts.reduce((sum, p) => sum + (p.costPrice * p.quantity), 0);
            }
        });

        const totalProfit = totalIncome - totalProductCosts - totalRepairPartCosts;
        const totalReconciliationDifference = filteredReconciliations.reduce((sum, r) => sum + r.totalDifference, 0);

        return {
            totalSales: totalIncome,
            totalProfit,
            totalReconciliationDifference,
            adjustedTotalSales: totalIncome + totalReconciliationDifference,
            transactionCount: filteredSales.length,
        };

    }, [date, sales, products, reconciliations, repairJobs]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Reporte Financiero Consolidado</CardTitle>
                <CardDescription>
                    Resumen de ingresos y ganancias. Las reparaciones se agrupan por equipo para mayor precisión.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                    <Popover>
                        <PopoverTrigger asChild>
                        <Button
                            id="date"
                            variant={"outline"}
                            className={cn(
                            "w-full sm:w-[300px] justify-start text-left font-normal",
                            !date && "text-muted-foreground"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date?.from ? (
                            date.to ? (
                                <>
                                {format(date.from, "LLL dd, y", { locale: es })} -{" "}
                                {format(date.to, "LLL dd, y", { locale: es })}
                                </>
                            ) : (
                                format(date.from, "LLL dd, y", { locale: es })
                            )
                            ) : (
                            <span>Selecciona una fecha</span>
                            )}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={date?.from}
                            selected={date}
                            onSelect={setDate}
                            numberOfMonths={2}
                            locale={es}
                        />
                        </PopoverContent>
                    </Popover>
                    <p className="text-sm text-muted-foreground">{stats.transactionCount} transacciones en el período.</p>
                </div>
                
                {isLoading ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                         <div className="p-4 rounded-lg bg-muted border-l-4 border-primary">
                            <p className="text-[10px] font-bold uppercase text-muted-foreground">Ingresos en Caja ($)</p>
                            <p className="text-2xl font-black">{getSymbol()}{formatCurrency(stats.totalSales)}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-muted border-l-4 border-green-500">
                            <p className="text-[10px] font-bold uppercase text-muted-foreground">Ganancia Est. ($)</p>
                            <p className={cn("text-2xl font-black", stats.totalProfit > 0 ? "text-green-600" : "text-destructive")}>
                                {getSymbol()}{formatCurrency(stats.totalProfit)}
                            </p>
                        </div>
                        <div className="p-4 rounded-lg bg-muted border-l-4 border-amber-500">
                            <p className="text-[10px] font-bold uppercase text-muted-foreground">Dif. Cierres ($)</p>
                            <p className={cn("text-2xl font-black", stats.totalReconciliationDifference >= 0 ? "text-green-600" : "text-destructive")}>
                                {stats.totalReconciliationDifference >= 0 ? '+' : ''}{getSymbol()}{formatCurrency(stats.totalReconciliationDifference)}
                            </p>
                        </div>
                        <div className="p-4 rounded-lg bg-primary text-primary-foreground shadow-md">
                            <p className="text-[10px] font-bold uppercase text-primary-foreground/70 tracking-widest">Resultado Neto</p>
                             <p className="text-2xl font-black">{getSymbol()}{formatCurrency(stats.adjustedTotalSales)}</p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
