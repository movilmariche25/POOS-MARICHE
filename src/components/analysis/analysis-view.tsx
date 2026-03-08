
"use client";

import type { Product, Sale, RepairJob, UserModule } from "@/lib/types";
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Skeleton } from "../ui/skeleton";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { subDays, startOfMonth, isAfter, isBefore, differenceInDays, parseISO } from "date-fns";
import { useCurrency } from "@/hooks/use-currency";
import { cn } from "@/lib/utils";
import { 
    TrendingUp, 
    AlertTriangle, 
    ShoppingCart, 
    Flame, 
    Ghost, 
    Zap, 
    Clock, 
    ArrowRightLeft,
    ChevronUp,
    ChevronDown,
    Layers,
    DollarSign
} from "lucide-react";
import { Progress } from "../ui/progress";

type AnalysisViewProps = {
    sales: Sale[];
    products: Product[];
    repairJobs: RepairJob[];
    isLoading?: boolean;
    enabledModules?: UserModule[];
    isAdmin?: boolean;
};

type DateRangeFilter = '7d' | '30d' | 'this_month';

export function AnalysisView({ sales, products, repairJobs, isLoading, enabledModules, isAdmin }: AnalysisViewProps) {
    const [dateRange, setDateRange] = useState<DateRangeFilter>('30d');
    const { format: formatCurrency, getSymbol, getFinalPrice } = useCurrency();

    const stats = useMemo(() => {
        if (isLoading || !sales || !products || !repairJobs) return null;

        const now = new Date();
        let currentStart: Date;
        let prevStart: Date;
        let daysInPeriod: number;

        switch (dateRange) {
            case '7d':
                currentStart = subDays(now, 7);
                prevStart = subDays(now, 14);
                daysInPeriod = 7;
                break;
            case 'this_month':
                currentStart = startOfMonth(now);
                prevStart = startOfMonth(subDays(currentStart, 1));
                daysInPeriod = differenceInDays(now, currentStart) || 1;
                break;
            case '30d':
            default:
                currentStart = subDays(now, 30);
                prevStart = subDays(now, 60);
                daysInPeriod = 30;
                break;
        }

        const filterByRange = (items: any[], start: Date, end: Date) => 
            items.filter(item => {
                const d = new Date(item.transactionDate || item.createdAt);
                return isAfter(d, start) && isBefore(d, end);
            });

        const currentSales = filterByRange(sales, currentStart, now).filter(s => s.status === 'completed');
        const prevSales = filterByRange(sales, prevStart, currentStart).filter(s => s.status === 'completed');

        const calcProfit = (salesList: Sale[]) => salesList.reduce((acc, s) => {
            const income = s.actualPaidAmount ?? s.totalAmount;
            let cost = 0;
            s.items.forEach(item => {
                if (item.isCustom) cost += (item.customCostPrice || 0) * item.quantity;
                else {
                    const p = products.find(prod => prod.id === item.productId);
                    cost += (p?.costPrice || 0) * item.quantity;
                }
            });
            return acc + (income - cost);
        }, 0);

        const currentProfit = calcProfit(currentSales);
        const prevProfit = calcProfit(prevSales);
        const profitGrowth = prevProfit > 0 ? ((currentProfit - prevProfit) / prevProfit) * 100 : 0;

        const inventoryHealth = products.map(p => {
            const soldInPeriod = currentSales.reduce((acc, s) => {
                const item = s.items.find(i => i.productId === p.id);
                return acc + (item?.quantity || 0);
            }, 0);

            const velocity = soldInPeriod / daysInPeriod;
            const available = p.stockLevel - (p.reservedStock || 0) - (p.damagedStock || 0);
            const daysRemaining = velocity > 0 ? Math.floor(available / velocity) : Infinity;
            
            const retailPrice = getFinalPrice(p);
            const margin = p.costPrice > 0 ? ((retailPrice - p.costPrice) / p.costPrice) * 100 : 0;

            return { ...p, soldInPeriod, velocity, available, daysRemaining, margin };
        });

        const toBuy = inventoryHealth.filter(p => p.daysRemaining <= 7 && p.velocity > 0).sort((a,b) => a.daysRemaining - b.daysRemaining);
        const deadStock = inventoryHealth.filter(p => p.soldInPeriod === 0 && p.available > 0 && (!p.createdAt || differenceInDays(now, parseISO(p.createdAt)) > 30));

        const modelCorrelation: Record<string, Record<string, number>> = {};
        repairJobs.forEach(job => {
            const model = `${job.deviceMake} ${job.deviceModel}`.toUpperCase();
            if (!modelCorrelation[model]) modelCorrelation[model] = {};
            job.reservedParts?.forEach(part => {
                modelCorrelation[model][part.productName] = (modelCorrelation[model][part.productName] || 0) + part.quantity;
            });
        });

        return { 
            currentProfit, 
            profitGrowth, 
            inventoryHealth, 
            toBuy, 
            deadStock, 
            modelCorrelation,
            avgMargin: inventoryHealth.length > 0 ? inventoryHealth.reduce((acc, p) => acc + p.margin, 0) / products.length : 0
        };
    }, [sales, products, repairJobs, isLoading, dateRange, getFinalPrice]);

    if (isLoading) return <div className="p-8 text-center"><Skeleton className="h-96 w-full" /></div>;
    if (!stats) return null;

    return (
        <div className="space-y-8 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-slate-800">PANEL DE DECISIONES ESTRATÉGICAS</h1>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Inteligencia de Datos para Maximizar Capital</p>
                </div>
                <Select value={dateRange} onValueChange={(v: any) => setDateRange(v)}>
                    <SelectTrigger className="w-[220px] bg-white shadow-sm border-2">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="7d">Últimos 7 días</SelectItem>
                        <SelectItem value="30d">Últimos 30 días</SelectItem>
                        <SelectItem value="this_month">Mes Actual</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-l-4 border-l-blue-600 shadow-md">
                    <CardHeader className="pb-2">
                        <CardDescription className="text-[10px] font-black uppercase">Ganancia Neta Estimada</CardDescription>
                        <CardTitle className="text-3xl font-black">${formatCurrency(stats.currentProfit)}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={cn("flex items-center gap-1 text-sm font-bold", stats.profitGrowth >= 0 ? "text-green-600" : "text-destructive")}>
                            {stats.profitGrowth >= 0 ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                            {Math.abs(stats.profitGrowth).toFixed(1)}% vs periodo anterior
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-green-600 shadow-md">
                    <CardHeader className="pb-2">
                        <CardDescription className="text-[10px] font-black uppercase">Margen de Ganancia Promedio</CardDescription>
                        <CardTitle className="text-3xl font-black">{stats.avgMargin.toFixed(1)}%</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Progress value={stats.avgMargin} className="h-2 bg-green-100" />
                        <p className="text-[9px] text-muted-foreground mt-2 font-bold uppercase">Rentabilidad sobre costo de reposición</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-amber-500 shadow-md">
                    <CardHeader className="pb-2">
                        <CardDescription className="text-[10px] font-black uppercase">Salud del Inventario</CardDescription>
                        <CardTitle className="text-3xl font-black">{products.length > 0 ? ((stats.inventoryHealth.filter(p => p.daysRemaining > 15).length / products.length) * 100).toFixed(0) : 0}%</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] bg-amber-50">{stats.toBuy.length} Por Agotarse</Badge>
                            <Badge variant="outline" className="text-[10px] bg-slate-50">{stats.deadStock.length} Sin Movimiento</Badge>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border-2 border-primary/10 shadow-lg overflow-hidden">
                    <CardHeader className="bg-primary/5 border-b">
                        <div className="flex items-center gap-2 text-primary">
                            <Zap className="w-5 h-5 fill-primary" />
                            <CardTitle className="text-sm font-black uppercase">¿Qué Comprar Hoy? (Alta Velocidad)</CardTitle>
                        </div>
                        <CardDescription>Productos que se agotarán en menos de 7 días según ritmo de venta.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-[10px] uppercase">Producto</TableHead>
                                    <TableHead className="text-center text-[10px] uppercase">Vendido</TableHead>
                                    <TableHead className="text-center text-[10px] uppercase">Quedan</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {stats.toBuy.slice(0, 5).map(p => (
                                    <TableRow key={p.id}>
                                        <TableCell className="font-bold text-xs">{p.name}</TableCell>
                                        <TableCell className="text-center font-bold text-blue-600">{p.soldInPeriod} {p.unit === 'unit' ? 'un.' : p.unit}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="destructive" className="animate-pulse">{p.daysRemaining} días</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button size="sm" variant="outline" className="h-7 text-[10px] font-black uppercase">Reabastecer</Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {stats.toBuy.length === 0 && (
                                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground italic text-xs">No hay riesgos de quiebre de stock detectados.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card className="border-2 border-slate-200 shadow-lg overflow-hidden">
                    <CardHeader className="bg-slate-50 border-b">
                        <div className="flex items-center gap-2 text-slate-600">
                            <Ghost className="w-5 h-5" />
                            <CardTitle className="text-sm font-black uppercase">Stock Muerto (Baja Rotación)</CardTitle>
                        </div>
                        <CardDescription>Items en estante hace +30 días sin una sola venta.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-[10px] uppercase">Producto</TableHead>
                                    <TableHead className="text-center text-[10px] uppercase">En Estante</TableHead>
                                    <TableHead className="text-center text-[10px] uppercase">Costo Atascado</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase">Recomendación</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {stats.deadStock.slice(0, 5).map(p => (
                                    <TableRow key={p.id}>
                                        <TableCell className="font-bold text-xs">{p.name}</TableCell>
                                        <TableCell className="text-center text-xs font-medium">{p.available} {p.unit === 'unit' ? 'un.' : p.unit}</TableCell>
                                        <TableCell className="text-center font-bold text-destructive">${formatCurrency(p.available * p.costPrice)}</TableCell>
                                        <TableCell className="text-right">
                                            <Badge className="bg-amber-500 text-black text-[9px] uppercase font-black">Liquidar / Promo</Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {stats.deadStock.length === 0 && (
                                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground italic text-xs">¡Excelente! Todo tu inventario tiene movimiento.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            <Card className="shadow-lg border-2 border-blue-100">
                <CardHeader className="bg-blue-50/50 border-b">
                    <div className="flex items-center gap-2 text-blue-700">
                        <ArrowRightLeft className="w-5 h-5" />
                        <CardTitle className="text-sm font-black uppercase">Correlación: Modelos vs Insumos</CardTitle>
                    </div>
                    <CardDescription>Piezas más demandadas por cada modelo de equipo que entra al taller.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(stats.modelCorrelation).slice(0, 6).map(([model, parts]) => (
                            <div key={model} className="p-4 rounded-xl border bg-white shadow-sm space-y-3">
                                <div className="flex items-center justify-between border-b pb-2">
                                    <span className="text-xs font-black text-slate-700 truncate max-w-[150px]">{model}</span>
                                    <Badge variant="secondary" className="text-[9px] uppercase font-bold">{Object.values(parts).reduce((a,b)=>a+b, 0)} Usos</Badge>
                                </div>
                                <div className="space-y-1">
                                    {Object.entries(parts).sort((a,b)=>b[1]-a[1]).slice(0, 3).map(([part, count]) => (
                                        <div key={part} className="flex justify-between text-[10px] items-center">
                                            <span className="text-muted-foreground">{part}</span>
                                            <span className="font-black text-primary">x{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-xl">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Layers className="w-5 h-5 text-primary"/> Inteligencia de Productos</CardTitle>
                    <CardDescription>Análisis profundo de márgenes porcentuales y días de inventario restante.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-[10px] uppercase">Producto</TableHead>
                                <TableHead className="text-right text-[10px] uppercase">Margen %</TableHead>
                                <TableHead className="text-right text-[10px] uppercase">Velocidad (Venta/Día)</TableHead>
                                <TableHead className="text-right text-[10px] uppercase">Días de Stock</TableHead>
                                <TableHead className="text-center text-[10px] uppercase">Estatus Estratégico</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {stats.inventoryHealth.sort((a,b) => b.soldInPeriod - a.soldInPeriod).slice(0, 15).map(p => (
                                <TableRow key={p.id}>
                                    <TableCell>
                                        <p className="font-bold text-xs">{p.name}</p>
                                        <p className="text-[9px] text-muted-foreground font-mono">{p.sku}</p>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Badge variant="outline" className={cn("text-xs font-black", p.margin > 100 ? "text-green-600 border-green-200 bg-green-50" : "text-blue-600")}>
                                            {p.margin.toFixed(0)}%
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs font-bold">
                                        {p.velocity.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex flex-col items-end">
                                            <span className={cn("text-xs font-black", p.daysRemaining < 10 ? "text-destructive" : "text-slate-700")}>
                                                {p.daysRemaining === Infinity ? '∞' : `${p.daysRemaining} días`}
                                            </span>
                                            <div className="w-16">
                                                <Progress value={Math.min(100, (p.daysRemaining / 30) * 100)} className="h-1 mt-1" />
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {p.velocity > 0.5 ? (
                                            <Badge className="bg-orange-500 text-white text-[9px] uppercase"><Flame className="w-2 h-2 mr-1"/> Super Venta</Badge>
                                        ) : p.margin > 150 ? (
                                            <Badge className="bg-purple-600 text-white text-[9px] uppercase"><DollarSign className="w-2 h-2 mr-1"/> Alta Utilidad</Badge>
                                        ) : (
                                            <Badge variant="secondary" className="text-[9px] uppercase">Estable</Badge>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
