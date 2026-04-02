
"use client";

import type { Product, Sale, RepairJob, UserModule } from "@/lib/types";
import { useMemo, useState, useEffect } from "react";
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
    Flame, 
    Ghost, 
    Zap, 
    ChevronUp,
    ChevronDown,
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
    ChevronRight
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

    // Resetear página al cambiar el rango de fecha
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
                const d = new Date(item.transactionDate || item.createdAt);
                return isAfter(d, start);
            });

        const currentSales = filterByRange(sales, currentStart).filter(s => s.status === 'completed');

        // Cálculo de Ganancia Neta Real (Venta - Costo)
        const currentProfit = currentSales.reduce((acc, s) => {
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

        // Mapeo de salud de inventario y matriz estratégica
        const inventoryHealth = products.map(p => {
            const soldInPeriod = currentSales.reduce((acc, s) => {
                const item = s.items.find(i => i.productId === p.id);
                return acc + (item?.quantity || 0);
            }, 0);

            const velocity = soldInPeriod / daysInPeriod;
            const available = p.stockLevel - (p.reservedStock || 0) - (p.damagedStock || 0);
            const retailPrice = getFinalPrice(p);
            
            // Margen vs Reposición (Costo Actual)
            const margin = p.costPrice > 0 ? ((retailPrice - p.costPrice) / p.costPrice) * 100 : 0;

            // Lógica de Estatus Estratégico
            let status: 'STAR' | 'TRACTION' | 'DORMANT' | 'CRITICAL' | 'STABLE' = 'STABLE';
            if (available < 0) status = 'CRITICAL';
            else if (soldInPeriod > 0 && margin > 50) status = 'STAR';
            else if (soldInPeriod > 2 && margin <= 50) status = 'TRACTION';
            else if (soldInPeriod === 0 && available > 0 && (!p.createdAt || differenceInDays(now, parseISO(p.createdAt)) > 15)) status = 'DORMANT';

            return { ...p, soldInPeriod, velocity, available, margin, status };
        });

        // Artículos para comprar (Agotándose o con alta demanda)
        const toBuy = inventoryHealth.filter(p => (p.velocity > 0 && p.available / p.velocity <= 7) || p.available <= 0)
            .sort((a,b) => b.velocity - a.velocity);

        // Capital en Riesgo: Valor de costo de artículos "Dormidos"
        const capitalAtRisk = inventoryHealth
            .filter(p => p.status === 'DORMANT')
            .reduce((acc, p) => acc + (p.available * p.costPrice), 0);

        const healthScore = products.length > 0 
            ? ((inventoryHealth.filter(p => p.status !== 'DORMANT' && p.status !== 'CRITICAL').length / products.length) * 100)
            : 0;

        // Correlación de Reparaciones (Agrupación Inteligente)
        const recipes: Record<string, { model: string, parts: Record<string, { count: number, stock: number, id: string }> }> = {};
        if (showRepairs) {
            repairJobs.forEach(job => {
                const modelKey = `${job.deviceMake} ${job.deviceModel}`.toUpperCase();
                if (!recipes[modelKey]) recipes[modelKey] = { model: modelKey, parts: {} };
                
                const parts = [...(job.reservedParts || []), ...(job.consumedParts || [])];
                parts.forEach(part => {
                    if (!recipes[modelKey].parts[part.productName]) {
                        const pData = products.find(prod => prod.id === part.productId);
                        recipes[modelKey].parts[part.productName] = { 
                            count: 0, 
                            stock: pData ? (pData.stockLevel - (pData.reservedStock || 0) - (pData.damagedStock || 0)) : 0,
                            id: part.productId
                        };
                    }
                    recipes[modelKey].parts[part.productName].count += part.quantity;
                });
            });
        }

        return { 
            currentProfit, 
            healthScore,
            capitalAtRisk,
            inventoryHealth, 
            toBuy, 
            recipes: Object.values(recipes).sort((a, b) => Object.keys(b.parts).length - Object.keys(a.parts).length).slice(0, 6)
        };
    }, [sales, products, repairJobs, isLoading, dateRange, getFinalPrice]);

    // Filtrar y ordenar antes de paginar
    const performanceItems = useMemo(() => {
        if (!stats) return [];
        return stats.inventoryHealth
            .filter(p => p.status !== 'STABLE')
            .sort((a, b) => b.soldInPeriod - a.soldInPeriod);
    }, [stats]);

    const totalPages = Math.ceil(performanceItems.length / ITEMS_PER_PAGE);
    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return performanceItems.slice(start, start + ITEMS_PER_PAGE);
    }, [performanceItems, currentPage]);

    if (isLoading) return <div className="p-8 text-center"><Skeleton className="h-96 w-full" /></div>;
    if (!stats) return null;

    return (
        <div className="space-y-8 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-slate-800 uppercase">Inteligencia de Inventario</h1>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Transforma datos en órdenes de compra y ajustes de precio</p>
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
                <Card className="border-l-4 border-l-green-600 shadow-md">
                    <CardHeader className="pb-2">
                        <CardDescription className="text-[10px] font-black uppercase text-green-700">Utilidad Operativa (Neto)</CardDescription>
                        <CardTitle className="text-3xl font-black">${formatCurrency(stats.currentProfit)}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-[9px] text-muted-foreground font-bold uppercase">Ganancia real descontando costo de inversión</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-blue-600 shadow-md">
                    <CardHeader className="pb-2">
                        <CardDescription className="text-[10px] font-black uppercase text-blue-700">Salud del Inventario</CardDescription>
                        <CardTitle className="text-3xl font-black">{stats.healthScore.toFixed(0)}%</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Progress value={stats.healthScore} className="h-2 bg-blue-100" />
                        <p className="text-[9px] text-muted-foreground mt-2 font-bold uppercase">Artículos con rotación activa</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-destructive shadow-md">
                    <CardHeader className="pb-2">
                        <CardDescription className="text-[10px] font-black uppercase text-destructive">Capital en Riesgo (Inactivo)</CardDescription>
                        <CardTitle className="text-3xl font-black text-destructive">${formatCurrency(stats.capitalAtRisk)}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-[9px] text-muted-foreground font-bold uppercase">Valor de stock sin ventas en 15+ días</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border-2 border-primary/10 shadow-lg overflow-hidden">
                    <CardHeader className="bg-primary/5 border-b">
                        <div className="flex items-center gap-2 text-primary">
                            <Zap className="w-5 h-5 fill-primary" />
                            <CardTitle className="text-sm font-black uppercase">¿Qué Comprar Hoy? (Reposición)</CardTitle>
                        </div>
                        <CardDescription>Basado en ritmo de venta y quiebre de stock inminente.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-[10px] uppercase">Artículo</TableHead>
                                    <TableHead className="text-center text-[10px] uppercase">Estatus</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {stats.toBuy.slice(0, 6).map(p => (
                                    <TableRow key={p.id}>
                                        <TableCell className="py-3">
                                            <p className="font-bold text-xs uppercase">{p.name}</p>
                                            <p className="text-[9px] text-muted-foreground">Quedan: {p.available} {p.unit === 'unit' ? 'un.' : p.unit}</p>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {p.available <= 0 ? (
                                                <Badge variant="destructive" className="text-[8px] animate-pulse">AGOTADO</Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[8px] border-amber-500 text-amber-600">CRÍTICO</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button 
                                                size="sm" 
                                                className="h-8 text-[10px] font-black uppercase"
                                                onClick={() => setReplenishProduct(p as Product)}
                                            >
                                                <ShoppingCart className="w-3 h-3 mr-1" /> Abastecer
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card className="border-2 border-slate-200 shadow-lg overflow-hidden">
                    <CardHeader className="bg-slate-50 border-b">
                        <div className="flex items-center gap-2 text-slate-600">
                            <Layers className="w-5 h-5" />
                            <CardTitle className="text-sm font-black uppercase">Guía de Modelos vs Repuestos</CardTitle>
                        </div>
                        <CardDescription>Piezas sugeridas según los equipos que más recibes.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {stats.recipes.map((recipe) => (
                                <div key={recipe.model} className="p-3 rounded-lg border bg-white shadow-sm space-y-2">
                                    <p className="text-[10px] font-black text-slate-700 uppercase border-b pb-1">{recipe.model}</p>
                                    <div className="space-y-1.5">
                                        {Object.entries(recipe.parts).slice(0, 2).map(([name, data]) => (
                                            <div key={name} className="flex justify-between items-center text-[9px]">
                                                <span className="text-muted-foreground truncate max-w-[100px]">{name}</span>
                                                <Badge variant={data.stock > 0 ? "secondary" : "destructive"} className="text-[8px] px-1 h-3.5">
                                                    {data.stock > 0 ? `${data.stock} en stock` : 'AGOTADO'}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="shadow-xl border-none">
                <CardHeader className="bg-slate-900 text-white rounded-t-xl">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-green-400"/>
                        <div>
                            <CardTitle className="text-sm font-black uppercase">Matriz de Rendimiento (80/20)</CardTitle>
                            <CardDescription className="text-slate-400 text-[10px]">Análisis enfocado en artículos que generan utilidad real vs capital atrapado.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0 bg-white">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50">
                                <TableHead className="text-[10px] font-black uppercase">Artículo</TableHead>
                                <TableHead className="text-center text-[10px] font-black uppercase">Ventas</TableHead>
                                <TableHead className="text-center text-[10px] font-black uppercase">Margen Real</TableHead>
                                <TableHead className="text-center text-[10px] font-black uppercase">Estatus Estratégico</TableHead>
                                <TableHead className="text-right text-[10px] font-black uppercase">Acción Sugerida</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedItems.map(p => (
                                <TableRow key={p.id} className="group hover:bg-slate-50 transition-colors">
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div>
                                                <p className="font-bold text-xs uppercase">{p.name}</p>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger className="text-[8px] text-muted-foreground font-mono hidden group-hover:block cursor-help">VER SKU</TooltipTrigger>
                                                        <TooltipContent className="text-[10px] font-mono">{p.sku}</TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center font-black text-xs">
                                        {p.soldInPeriod} <span className="text-[9px] font-normal text-muted-foreground">un.</span>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex flex-col items-center">
                                            <span className={cn(
                                                "text-xs font-black",
                                                p.margin < 15 ? "text-destructive" : "text-blue-600"
                                            )}>{p.margin.toFixed(0)}%</span>
                                            {p.margin < 15 && <span className="text-[7px] font-bold text-destructive uppercase">Descapitalizado</span>}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {p.status === 'STAR' && <Badge className="bg-yellow-500 text-black text-[9px] uppercase font-black"><Star className="w-2 h-2 mr-1 fill-black" /> ESTRELLA</Badge>}
                                        {p.status === 'TRACTION' && <Badge className="bg-blue-600 text-white text-[9px] uppercase font-black"><ZapIcon className="w-2 h-2 mr-1" /> TRACCIÓN</Badge>}
                                        {p.status === 'DORMANT' && <Badge variant="outline" className="bg-slate-100 text-slate-500 text-[9px] uppercase font-black"><Ghost className="w-2 h-2 mr-1" /> DORMIDO</Badge>}
                                        {p.status === 'CRITICAL' && <Badge variant="destructive" className="text-[9px] uppercase font-black animate-pulse"><AlertCircle className="w-2 h-2 mr-1" /> CRÍTICO</Badge>}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <p className="text-[9px] font-black uppercase text-slate-600">
                                            {p.status === 'STAR' && 'No permitir quiebre'}
                                            {p.status === 'TRACTION' && 'Ajustar margen +5%'}
                                            {p.status === 'DORMANT' && 'Liquidar / Promo'}
                                            {p.status === 'CRITICAL' && 'Corregir stock'}
                                        </p>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {paginatedItems.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic uppercase font-bold text-xs">
                                        Sin datos significativos para este periodo.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                    
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-4 bg-slate-50 border-t">
                            <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                                Página {currentPage} de {totalPages} ({performanceItems.length} artículos)
                            </p>
                            <div className="flex gap-2">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-8 text-[10px] font-bold uppercase"
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                >
                                    <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Anterior
                                </Button>
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-8 text-[10px] font-bold uppercase"
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                >
                                    Siguiente <ChevronRight className="w-3.5 h-3.5 ml-1" />
                                </Button>
                            </div>
                        </div>
                    )}
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
