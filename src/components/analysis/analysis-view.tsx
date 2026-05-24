
"use client";

import type { Product, Sale, RepairJob, UserModule } from "@/lib/types";
import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Skeleton } from "../ui/skeleton";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { subDays, startOfMonth, isAfter, differenceInDays, parseISO } from "date-fns";
import { useCurrency } from "@/hooks/use-currency";
import { cn } from "@/lib/utils";
import { 
    TrendingUp, 
    Flame, 
    Ghost, 
    Zap, 
    Layers,
    DollarSign,
    Package,
    Info,
    AlertTriangle,
    Star,
    ZapIcon,
    AlertCircle,
    ShoppingCart,
    ChevronLeft,
    ChevronRight,
    Search,
    ArrowRightCircle,
    History,
    Target,
    ShieldAlert,
    Lightbulb,
    ArrowUpRight
} from "lucide-react";
import { Progress } from "../ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { ReplenishStockDialog } from "../inventory/replenish-stock-dialog";

type AnalysisViewProps = {
    sales: Sale[];
    products: Product[];
    repairJobs: RepairJob[];
    isLoading?: boolean;
    enabledModules?: UserModule[];
    isAdmin?: boolean;
};

type DateRangeFilter = '7d' | '30d' | 'this_month';

const ITEMS_PER_PAGE = 15;

export function AnalysisView({ sales, products, repairJobs, isLoading, enabledModules, isAdmin }: AnalysisViewProps) {
    const [dateRange, setDateRange] = useState<DateRangeFilter>('30d');
    const [replenishProduct, setReplenishProduct] = useState<Product | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const { format: formatCurrency, getFinalPrice, parallelRate, bcvRate } = useCurrency();

    const showRepairs = enabledModules?.includes('repairs') ?? true;

    useEffect(() => {
        setCurrentPage(1);
    }, [dateRange]);

    const stats = useMemo(() => {
        if (isLoading || !sales || !products || !repairJobs) return null;

        const now = new Date();
        let currentStart: Date;
        let daysInPeriod: number;

        switch (dateRange) {
            case '7d':
                currentStart = subDays(now, 7);
                daysInPeriod = 7;
                break;
            case 'this_month':
                currentStart = startOfMonth(now);
                daysInPeriod = Math.max(1, differenceInDays(now, currentStart));
                break;
            case '30d':
            default:
                currentStart = subDays(now, 30);
                daysInPeriod = 30;
                break;
        }

        const filterByRange = (items: any[], start: Date) => 
            items.filter(item => {
                const dateStr = item.transactionDate || item.createdAt;
                if (!dateStr) return false;
                return isAfter(parseISO(dateStr), start);
            });

        const currentSales = filterByRange(sales, currentStart).filter(s => s.status === 'completed');

        // GANANCIA REAL (Ajustada a Tasa de Reposición)
        const currentProfit = currentSales.reduce((acc, s) => {
            const nominalIncome = s.actualPaidAmount ?? s.totalAmount;
            const saleBcv = s.bcvRateAtTime || bcvRate;
            const saleParallel = s.parallelRateAtTime || parallelRate;
            const isSalePromo = s.items.some(i => i.isPromo);
            const rateFactor = isSalePromo ? 1 : (saleBcv / saleParallel);
            const realIncome = nominalIncome * rateFactor;

            let cost = 0;
            s.items.forEach(item => {
                if (item.isCustom) cost += (item.customCostPrice || 0) * item.quantity;
                else {
                    const p = products.find(prod => prod.id === item.productId);
                    cost += (p?.costPrice || 0) * item.quantity;
                }
            });
            const itemsTotalBillable = s.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
            const paymentRatio = itemsTotalBillable > 0 ? nominalIncome / itemsTotalBillable : 1;
            
            return acc + (realIncome - (cost * paymentRatio));
        }, 0);

        // SALUD DE INVENTARIO CON FILTRO ANTI-RUIDO
        const inventoryHealth = products
            .filter(p => !((p.stockLevel <= 0) && (currentSales.reduce((acc, s) => acc + (s.items.find(i => i.productId === p.id)?.quantity || 0), 0) === 0)))
            .map(p => {
                const soldInPeriod = currentSales.reduce((acc, s) => {
                    const item = s.items.find(i => i.productId === p.id);
                    return acc + (item?.quantity || 0);
                }, 0);

                const velocity = soldInPeriod / daysInPeriod;
                const available = p.stockLevel - (p.reservedStock || 0) - (p.damagedStock || 0);
                
                const nominalRetailPrice = getFinalPrice(p);
                const isProductPromo = !!(p.promoPrice && p.promoPrice > 0);
                const realRetailPrice = isProductPromo ? (p.promoPrice || nominalRetailPrice) : (nominalRetailPrice * (bcvRate / parallelRate));
                
                const margin = p.costPrice > 0 ? ((realRetailPrice - p.costPrice) / p.costPrice) * 100 : 0;

                let status: 'STAR' | 'TRACTION' | 'DORMANT' | 'CRITICAL' | 'STABLE' = 'STABLE';
                if (available < 0) status = 'CRITICAL';
                else if (soldInPeriod > 0 && margin > 40) status = 'STAR';
                else if (soldInPeriod > 1 && margin <= 40) status = 'TRACTION';
                else if (soldInPeriod === 0 && available > 0 && (!p.createdAt || differenceInDays(now, parseISO(p.createdAt)) > 15)) status = 'DORMANT';

                return { ...p, soldInPeriod, velocity, available, margin, status, realRetailPrice };
            });

        // PRIORIDAD #1: TALLER (Faltantes)
        const workshopMissing: { model: string, part: string, count: number, id: string }[] = [];
        if (showRepairs) {
            repairJobs.filter(j => j.status !== 'Completado').forEach(job => {
                const parts = job.reservedParts || [];
                parts.forEach(part => {
                    const pData = products.find(prod => prod.id === part.productId);
                    const available = pData ? (pData.stockLevel - (pData.reservedStock || 0) - (pData.damagedStock || 0)) : 0;
                    if (available < 0) {
                        workshopMissing.push({
                            model: `${job.deviceMake} ${job.deviceModel}`,
                            part: part.productName,
                            count: Math.abs(available),
                            id: part.productId
                        });
                    }
                });
            });
        }

        // PRIORIDAD #2: STOCK ALTO RITMO
        const highVelocityShortage = inventoryHealth
            .filter(p => p.velocity > 0 && (p.available <= (p.lowStockThreshold || 1)))
            .sort((a, b) => b.velocity - a.velocity)
            .slice(0, 3);

        const stagnantCapital = inventoryHealth
            .filter(p => p.status === 'DORMANT')
            .reduce((acc, p) => acc + (p.available * p.costPrice), 0);

        const healthScore = products.length > 0 
            ? ((inventoryHealth.filter(p => p.status !== 'DORMANT' && p.status !== 'CRITICAL').length / inventoryHealth.length) * 100)
            : 0;

        const dormantCategories = Array.from(new Set(inventoryHealth.filter(p => p.status === 'DORMANT').map(p => p.category)));

        return { 
            currentProfit, 
            healthScore,
            stagnantCapital,
            inventoryHealth, 
            workshopMissing: workshopMissing.slice(0, 2),
            highVelocityShortage,
            dormantCategories: dormantCategories.slice(0, 3)
        };
    }, [sales, products, repairJobs, isLoading, dateRange, getFinalPrice, bcvRate, parallelRate, showRepairs]);

    const paginatedItems = useMemo(() => {
        if (!stats) return [];
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return stats.inventoryHealth.slice(start, start + ITEMS_PER_PAGE);
    }, [stats, currentPage]);

    const totalPages = stats ? Math.ceil(stats.inventoryHealth.length / ITEMS_PER_PAGE) : 0;

    if (isLoading) return <div className="p-10 space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-64 w-full" /></div>;
    if (!stats) return null;

    const efficiencyDiag = stats.healthScore > 80 ? "Sólida Rotación" : stats.healthScore > 50 ? "Riesgo de Estancamiento" : "Crítica Descapitalización";

    return (
        <div className="space-y-6 max-w-5xl mx-auto w-full pb-20">
            <div className="flex justify-between items-center bg-slate-900 text-white p-4 rounded-xl shadow-lg border-b-4 border-primary">
                <div className="flex items-center gap-3">
                    <Target className="w-6 h-6 text-primary" />
                    <h1 className="text-lg font-black uppercase tracking-tighter">Motor de Inteligencia Comercial</h1>
                </div>
                <Select value={dateRange} onValueChange={(v: any) => setDateRange(v)}>
                    <SelectTrigger className="w-[180px] h-9 text-[10px] font-black uppercase bg-white/10 border-white/20">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="7d">Últimos 7 días</SelectItem>
                        <SelectItem value="30d">Últimos 30 días</SelectItem>
                        <SelectItem value="this_month">Mes actual</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-2 border-primary/20 bg-primary/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2">
                            <TrendingUp className="w-3.5 h-3.5" /> 📊 Finanzas Express
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div>
                            <p className="text-[9px] font-bold text-muted-foreground uppercase">Utilidad Real (Reposición):</p>
                            <p className="text-2xl font-black text-slate-800">${formatCurrency(stats.currentProfit)}</p>
                        </div>
                        <div className="pt-2 border-t border-primary/10">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[9px] font-bold text-muted-foreground uppercase">Eficiencia:</span>
                                <span className="text-[10px] font-black text-primary">{stats.healthScore.toFixed(0)}%</span>
                            </div>
                            <p className="text-[10px] font-black uppercase text-slate-600">{efficiencyDiag}</p>
                        </div>
                        <div className="pt-2 border-t border-primary/10">
                            <p className="text-[9px] font-bold text-muted-foreground uppercase">Capital Estancado (&gt;15 días):</p>
                            <p className="text-lg font-black text-destructive">${formatCurrency(stats.stagnantCapital)}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-2 border-amber-200 bg-amber-50 md:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase text-amber-700 tracking-widest flex items-center gap-2">
                            <ShieldAlert className="w-3.5 h-3.5" /> 🚨 Acciones Críticas (Máx. 4)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {stats.workshopMissing.length === 0 && stats.highVelocityShortage.length === 0 && (
                            <div className="h-24 flex items-center justify-center text-xs font-bold text-amber-600/50 uppercase italic">Sin alertas críticas pendientes</div>
                        )}
                        
                        {stats.workshopMissing.map((m, i) => (
                            <div key={`wm-${i}`} className="flex items-center justify-between p-3 bg-white rounded-lg border border-amber-300 shadow-sm animate-pulse">
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-amber-100 rounded text-amber-700"><Layers className="w-4 h-4"/></div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-amber-800">[TALLER] Pieza faltante para {m.model}</p>
                                        <p className="text-xs font-bold">Comprar {m.count}un. de {m.part}</p>
                                    </div>
                                </div>
                                <Button size="sm" variant="ghost" className="h-8 text-amber-700 hover:bg-amber-100" onClick={() => setReplenishProduct(products.find(p => p.id === m.id) || null)}>
                                    <ArrowUpRight className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}

                        {stats.highVelocityShortage.map((p, i) => (
                            <div key={`hv-${i}`} className="flex items-center justify-between p-3 bg-white rounded-lg border border-primary/20 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-primary/10 rounded text-primary"><Zap className="w-4 h-4 fill-primary"/></div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-slate-500">[STOCK ALTO RITMO] Reponer {p.name}</p>
                                        <p className="text-xs font-bold">Ritmo: {p.soldInPeriod}un/mes | Margen: {p.margin.toFixed(0)}%</p>
                                    </div>
                                </div>
                                <Button size="sm" variant="ghost" className="h-8 text-primary hover:bg-primary/10" onClick={() => setReplenishProduct(p as Product)}>
                                    <ShoppingCart className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>

            <Card className="border-2 border-blue-100 bg-blue-50/30">
                <CardHeader className="pb-2">
                    <CardTitle className="text-[10px] font-black uppercase text-blue-700 tracking-widest flex items-center gap-2">
                        <Lightbulb className="w-3.5 h-3.5" /> 💡 Estrategia de Liquidez
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                    <div className="space-y-1">
                        <p className="text-xs font-bold text-blue-900 uppercase">
                            Liquidar {stats.dormantCategories.length > 0 ? stats.dormantCategories.join(", ") : "mercancía lenta"}
                        </p>
                        <p className="text-[10px] font-medium text-blue-700 uppercase tracking-tighter">
                            0 ventas en los últimos 30 días. Sugerencia: Pack de accesorios o promoción rápida en divisa.
                        </p>
                    </div>
                    <Badge className="bg-blue-600 text-white text-[10px] font-black px-3 py-1 uppercase">Liberar ${formatCurrency(stats.stagnantCapital)}</Badge>
                </CardContent>
            </Card>

            <Card className="shadow-xl border-none overflow-hidden rounded-xl">
                <CardHeader className="bg-slate-50 border-b py-4">
                    <CardTitle className="text-xs font-black uppercase text-slate-500 tracking-widest">Matriz de Rendimiento Táctico (Pareto)</CardTitle>
                </CardHeader>
                <CardContent className="p-0 bg-white">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50/50">
                                <TableHead className="text-[10px] font-black uppercase py-4">Artículo Estratégico</TableHead>
                                <TableHead className="text-center text-[10px] font-black uppercase">Ventas</TableHead>
                                <TableHead className="text-center text-[10px] font-black uppercase">Rentabilidad Real</TableHead>
                                <TableHead className="text-center text-[10px] font-black uppercase">Estatus Gemini</TableHead>
                                <TableHead className="text-right text-[10px] font-black uppercase pr-6">Acción Recomendada</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedItems.map(p => (
                                <TableRow key={p.id} className="group hover:bg-slate-50/80 transition-colors">
                                    <TableCell className="py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center font-black text-[10px] text-muted-foreground uppercase">{p.category.slice(0,2)}</div>
                                            <div>
                                                <p className="font-black text-xs uppercase text-slate-800">{p.name}</p>
                                                <p className="text-[8px] text-muted-foreground font-mono uppercase">DISP: {p.available} {p.unit}</p>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center font-black text-sm">{p.soldInPeriod}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant="outline" className={cn(
                                            "font-mono text-[10px] border-none px-2",
                                            p.margin < 15 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                                        )}>{p.margin.toFixed(0)}%</Badge>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {p.status === 'STAR' && <Badge className="bg-yellow-400 text-slate-900 text-[8px] font-black uppercase">ESTRELLA</Badge>}
                                        {p.status === 'TRACTION' && <Badge className="bg-blue-600 text-white text-[8px] font-black uppercase">TRACCIÓN</Badge>}
                                        {p.status === 'DORMANT' && <Badge variant="outline" className="text-slate-500 border-slate-300 text-[8px] font-black uppercase">DORMIDO</Badge>}
                                        {p.status === 'CRITICAL' && <Badge variant="destructive" className="text-[8px] font-black uppercase animate-pulse">CRÍTICO</Badge>}
                                    </TableCell>
                                    <TableCell className="text-right pr-6">
                                        <span className="text-[9px] font-black text-slate-700 uppercase tracking-tighter">
                                            {p.status === 'STAR' && 'No permitir quiebre de stock'}
                                            {p.status === 'TRACTION' && 'Evaluar ajuste de margen +5%'}
                                            {p.status === 'DORMANT' && 'Liquidar / Promoción en divisa'}
                                            {p.status === 'CRITICAL' && 'Ajuste manual de inventario'}
                                            {p.status === 'STABLE' && 'Mantener flujo actual'}
                                        </span>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    
                    <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t">
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">
                            Mostrando {paginatedItems.length} de {stats.inventoryHealth.length} activos estratégicos
                        </p>
                        <div className="flex items-center gap-4">
                            <span className="text-[10px] font-black text-slate-400 uppercase">PÁG. {currentPage} / {totalPages}</span>
                            <div className="flex gap-1">
                                <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-2" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1}>
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-2" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages}>
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {replenishProduct && (
                <ReplenishStockDialog
                    product={replenishProduct}
                    isOpen={!!replenishProduct}
                    onOpenChange={(open) => !open && setReplenishProduct(null)}
                />
            )}
        </div>
    );
}
