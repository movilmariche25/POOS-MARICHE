
"use client";

import type { Product, Sale, RepairJob, UserModule } from "@/lib/types";
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Skeleton } from "../ui/skeleton";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { subDays, startOfMonth, isAfter } from "date-fns";
import { useCurrency } from "@/hooks/use-currency";
import { cn } from "@/lib/utils";

type AnalysisViewProps = {
    sales: Sale[];
    products: Product[];
    repairJobs: RepairJob[];
    isLoading?: boolean;
    enabledModules?: UserModule[];
    isAdmin?: boolean;
};

type ProductSaleInfo = {
    productId: string;
    name: string;
    sku: string;
    quantitySold: number;
    totalProfit: number;
    stockLevel: number;
    lowStockThreshold: number;
};

type PartUsageInfo = {
    productId: string;
    name: string;
    quantityUsed: number;
};

type DeviceRepairInfo = {
    device: string;
    count: number;
};

type DateRangeFilter = '7d' | '30d' | 'this_month' | 'all';

export function AnalysisView({ sales, products, repairJobs, isLoading, enabledModules, isAdmin }: AnalysisViewProps) {
    const [dateRange, setDateRange] = useState<DateRangeFilter>('30d');
    const { format: formatCurrency, getSymbol } = useCurrency();

    // Verificamos qué secciones mostrar basándonos en los módulos activos
    // Se quita el "isAdmin ||" para que el admin vea la interfaz tal cual la configuró
    const showRepairsAnalysis = (enabledModules?.includes('repairs') ?? true);
    const showInventoryAnalysis = (enabledModules?.includes('inventory') ?? true);
    const showSalesAnalysis = (enabledModules?.includes('pos') ?? true);

    const { topProfitableProducts, topSellingProducts, topUsedParts, topRepairedDevices } = useMemo(() => {
        if (isLoading || !sales || !products || !repairJobs) {
            return { topProfitableProducts: [], topSellingProducts: [], topUsedParts: [], topRepairedDevices: [] };
        }
        
        const now = new Date();
        let startDate: Date | null = null;
        switch (dateRange) {
            case '7d':
                startDate = subDays(now, 7);
                break;
            case '30d':
                startDate = subDays(now, 30);
                break;
            case 'this_month':
                startDate = startOfMonth(now);
                break;
            case 'all':
            default:
                startDate = null;
                break;
        }

        const filteredSales = startDate 
            ? sales.filter(s => s.transactionDate && isAfter(new Date(s.transactionDate), startDate!)) 
            : sales;
            
        const filteredRepairJobs = startDate
            ? repairJobs.filter(j => j.createdAt && isAfter(new Date(j.createdAt), startDate!))
            : repairJobs;


        // 1. Top Profitable Products from POS / Ventas
        const productSalesMap = new Map<string, ProductSaleInfo>();
        filteredSales
            .filter(s => s.status === 'completed')
            .forEach(sale => {
                sale.items.forEach(item => {
                    if (!item.isRepair) {
                        const product = products.find(p => p.id === item.productId);
                        if (product) {
                            const profit = (item.price - product.costPrice) * item.quantity;
                            const existing = productSalesMap.get(item.productId);
                            if (existing) {
                                existing.quantitySold += item.quantity;
                                existing.totalProfit += profit;
                            } else {
                                productSalesMap.set(item.productId, {
                                    productId: product.id!,
                                    name: product.name,
                                    sku: product.sku,
                                    quantitySold: item.quantity,
                                    totalProfit: profit,
                                    stockLevel: product.stockLevel,
                                    lowStockThreshold: product.lowStockThreshold
                                });
                            }
                        } else if (item.isCustom) {
                            // Análisis para artículos manuales sin inventario
                            const profit = (item.customPrice! - (item.customCostPrice || 0)) * item.quantity;
                            const existing = productSalesMap.get(item.productId);
                            if (existing) {
                                existing.quantitySold += item.quantity;
                                existing.totalProfit += profit;
                            } else {
                                productSalesMap.set(item.productId, {
                                    productId: item.productId,
                                    name: item.name,
                                    sku: 'MANUAL',
                                    quantitySold: item.quantity,
                                    totalProfit: profit,
                                    stockLevel: 0,
                                    lowStockThreshold: 0
                                });
                            }
                        }
                    }
                });
            });
        
        const topProfitableProducts = Array.from(productSalesMap.values()).sort((a, b) => b.totalProfit - a.totalProfit).slice(0, 15);
        const topSellingProducts = Array.from(productSalesMap.values()).sort((a,b) => b.quantitySold - a.quantitySold).slice(0, 10);


        // 2. Top Used Parts in all repairs (Si el módulo está activo)
        const topUsedParts: PartUsageInfo[] = [];
        if (showRepairsAnalysis) {
            const partUsageMap = new Map<string, PartUsageInfo>();
            filteredRepairJobs
                .forEach(job => {
                    job.reservedParts?.forEach(part => {
                        const existing = partUsageMap.get(part.productId);
                        if (existing) {
                            existing.quantityUsed += part.quantity;
                        } else {
                            partUsageMap.set(part.productId, {
                                productId: part.productId,
                                name: part.productName,
                                quantityUsed: part.quantity,
                            });
                        }
                    });
                });
            topUsedParts.push(...Array.from(partUsageMap.values()).sort((a, b) => b.quantityUsed - a.quantityUsed).slice(0, 10));
        }

        // 3. Top Repaired Device Models (Si el módulo está activo)
        const topRepairedDevices: DeviceRepairInfo[] = [];
        if (showRepairsAnalysis) {
            const deviceRepairMap = new Map<string, DeviceRepairInfo>();
            filteredRepairJobs.forEach(job => {
                const deviceName = `${job.deviceMake} ${job.deviceModel}`.trim();
                if (deviceName) {
                    const existing = deviceRepairMap.get(deviceName);
                    if (existing) {
                        existing.count += 1;
                    } else {
                        deviceRepairMap.set(deviceName, {
                            device: deviceName,
                            count: 1,
                        });
                    }
                }
            });
            topRepairedDevices.push(...Array.from(deviceRepairMap.values()).sort((a, b) => b.count - a.count).slice(0, 10));
        }

        return { topProfitableProducts, topSellingProducts, topUsedParts, topRepairedDevices };

    }, [sales, products, repairJobs, isLoading, dateRange, showRepairsAnalysis]);

    const getStockBadge = (stock: number, threshold: number, sku: string) => {
        if (sku === 'MANUAL') return <Badge variant="outline">N/A</Badge>;
        if (stock <= 0) return <Badge variant="destructive">Agotado</Badge>;
        if (stock <= threshold) return <Badge className="bg-yellow-500 text-black">Bajo</Badge>;
        return <Badge className="bg-green-500 text-white">Saludable</Badge>;
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                    {isAdmin ? "Vista de Administrador Global" : "Análisis Personalizado para tu Negocio"}
                </h2>
                <Select value={dateRange} onValueChange={(value) => setDateRange(value as DateRangeFilter)}>
                    <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Seleccionar rango de fechas" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="7d">Últimos 7 días</SelectItem>
                        <SelectItem value="30d">Últimos 30 días</SelectItem>
                        <SelectItem value="this_month">Este Mes</SelectItem>
                        <SelectItem value="all">Todo el Histórico</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 {/* SIEMPRE VISIBLE: Rentabilidad de Ventas */}
                 <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Rentabilidad por Producto / Servicio</CardTitle>
                        <CardDescription>Items que generan mayor margen de ganancia neta en tu negocio.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <AnalysisTable
                            headers={["Producto / Concepto", "Cant. Vendida", "Ganancia Total Est.", "Estado Stock"]}
                            data={topProfitableProducts}
                            renderRow={(item: ProductSaleInfo) => (
                                <TableRow key={item.productId}>
                                    <TableCell>
                                        <div className="font-medium">{item.name}</div>
                                        <div className="text-[10px] text-muted-foreground font-mono uppercase">{item.sku}</div>
                                    </TableCell>
                                     <TableCell className="text-center">{item.quantitySold}</TableCell>
                                    <TableCell className="text-right font-bold text-green-600">
                                        {getSymbol()}{formatCurrency(item.totalProfit)}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {getStockBadge(item.stockLevel, item.lowStockThreshold, item.sku)}
                                    </TableCell>
                                </TableRow>
                            )}
                            isLoading={isLoading}
                            emptyMessage="No hay datos de ventas registrados para este período."
                        />
                    </CardContent>
                </Card>

                {/* CONDICIONAL: Solo si usa el módulo de Reparaciones */}
                {showRepairsAnalysis && (
                    <Card className="lg:col-span-1">
                        <CardHeader>
                            <CardTitle>Insumos más Utilizados</CardTitle>
                            <CardDescription>Repuestos o materiales con mayor rotación en el área técnica.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <AnalysisTable
                                headers={["Insumo / Repuesto", "Uso (Cant.)"]}
                                data={topUsedParts}
                                renderRow={(item: PartUsageInfo) => (
                                    <TableRow key={item.productId}>
                                        <TableCell className="font-medium">{item.name}</TableCell>
                                        <TableCell className="text-right">
                                            <Badge variant="secondary" className="font-bold">{item.quantityUsed}</Badge>
                                        </TableCell>
                                    </TableRow>
                                )}
                                isLoading={isLoading}
                                emptyMessage="No hay registros de repuestos usados."
                            />
                        </CardContent>
                    </Card>
                )}

                <div className={cn("space-y-6 flex flex-col", showRepairsAnalysis ? "lg:col-span-1" : "lg:col-span-2")}>
                    {/* SIEMPRE VISIBLE: Rotación de Inventario */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Productos con Mayor Rotación</CardTitle>
                            <CardDescription>Items que salen más rápido de tu inventario.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <AnalysisTable
                                headers={["Producto", "Cantidad"]}
                                data={topSellingProducts}
                                renderRow={(item: ProductSaleInfo) => (
                                    <TableRow key={item.productId}>
                                        <TableCell className="font-medium">{item.name}</TableCell>
                                        <TableCell className="text-right">
                                            <Badge className="bg-primary">{item.quantitySold}</Badge>
                                        </TableCell>
                                    </TableRow>
                                )}
                                isLoading={isLoading}
                                emptyMessage="Sin datos de rotación."
                            />
                        </CardContent>
                    </Card>

                    {/* CONDICIONAL: Solo si usa el módulo de Reparaciones */}
                    {showRepairsAnalysis && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Frecuencia de Modelos</CardTitle>
                                <CardDescription>Modelos de equipos que más ingresan a tu taller.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <AnalysisTable
                                    headers={["Modelo de Equipo", "Casos"]}
                                    data={topRepairedDevices}
                                    renderRow={(item: DeviceRepairInfo) => (
                                        <TableRow key={item.device}>
                                            <TableCell className="font-medium">{item.device}</TableCell>
                                            <TableCell className="text-right">
                                                <Badge variant="outline" className="font-bold">{item.count}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    isLoading={isLoading}
                                    emptyMessage="Sin historial técnico aún."
                                />
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}

type AnalysisTableProps<T> = {
    headers: string[];
    data: T[];
    renderRow: (item: T) => React.ReactNode;
    isLoading?: boolean;
    emptyMessage?: string;
};

function AnalysisTable<T>({ headers, data, renderRow, isLoading, emptyMessage = "No hay datos." }: AnalysisTableProps<T>) {
    if (isLoading) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                     <TableRow key={`loading-row-${i}`}>
                        {headers.map((_, j) => (
                            <TableCell key={`loading-cell-${i}-${j}`}>
                               <Skeleton className="h-5 w-full" />
                            </TableCell>
                        ))}
                    </TableRow>
                ))}
            </div>
        );
    }
    
    if (data.length === 0) {
        return <p className="text-sm text-muted-foreground text-center py-4">{emptyMessage}</p>;
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    {headers.map((header, index) => (
                        <TableHead key={header} className={cn(
                            (header.includes("Cant") || header.includes("Stock")) && "text-center",
                            (header.includes("Ganancia") || header.includes("Uso") || header.includes("Casos") || header.includes("Cantidad")) && "text-right"
                        )}>{header}</TableHead>
                    ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.map(renderRow)}
            </TableBody>
        </Table>
    );
}
