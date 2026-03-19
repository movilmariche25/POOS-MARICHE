
"use client";

import React, { Suspense, useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { PlusCircle, Trash2, Calculator, Clock } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { columns } from "@/components/inventory/columns";
import type { Product, UserProfile } from '@/lib/types';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCollection, useFirebase, useMemoFirebase, useDoc } from '@/firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';
import type { Table as TanstackTable, FilterFn } from '@tanstack/react-table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { PrintLabelsButton } from '@/components/inventory/print-labels-button';
import { PriceCalculatorDialog } from '@/components/tools/price-calculator-dialog';
import { ProductFormDialog } from '@/components/inventory/product-form-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { differenceInDays, parseISO } from 'date-fns';
import { cn } from "@/lib/utils";
import { SecurityGate } from "@/components/security-gate";

const productFilterFn: FilterFn<Product> = (row, columnId, value) => {
    const term = String(value).toLowerCase();
    const p = row.original;
    const name = (p.name || "").toLowerCase();
    const sku = (p.sku || "").toLowerCase();
    const cat = (p.category || "").toLowerCase();
    const models = (p.compatibleModels || []).join(" ").toLowerCase();
    
    return name.includes(term) || sku.includes(term) || cat.includes(term) || models.includes(term);
};

function BulkDeleteButton({ table }: { table: TanstackTable<Product> }) {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const selectedRows = table.getSelectedRowModel().rows;

    const handleDelete = async () => {
        if (!firestore || !user || selectedRows.length === 0) return;

        const batch = writeBatch(firestore);
        selectedRows.forEach(row => {
            const productRef = doc(firestore, 'users', user.uid, 'products', row.original.id!);
            batch.delete(productRef);
        });

        try {
            await batch.commit();
            toast({
                title: "Productos Eliminados",
                description: `${selectedRows.length} productos han sido eliminados.`,
            });
            table.resetRowSelection();
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Error al Eliminar",
                description: "No se pudieron eliminar los productos.",
            });
        } finally {
            setIsConfirmOpen(false);
        }
    };

    return (
        <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={selectedRows.length === 0}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar ({selectedRows.length})
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                    <AlertDialogDescription>Esta acción eliminará permanentemente {selectedRows.length} producto(s).</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive">Sí, eliminar</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function InventoryContent() {
    const { firestore, user } = useFirebase();
    
    const profileRef = useMemoFirebase(() => 
        (firestore && user) ? doc(firestore, 'users', user.uid) : null,
        [firestore, user?.uid]
    );
    const { data: profile } = useDoc<UserProfile>(profileRef);
    
    const productsCollection = useMemoFirebase(() =>
        (firestore && user) ? collection(firestore, 'users', user.uid, 'products') : null,
        [firestore, user?.uid]
    );
    const { data: products, isLoading } = useCollection<Product>(productsCollection);

    const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out' | 'old'>('all');
    const [categoryFilter, setCategoryFilter] = useState('all');

    const showAging = profile?.enabledModules?.includes('inventory_aging') ?? false;
    const showRepairs = profile?.enabledModules?.includes('repairs') ?? true;

    // Filtramos las columnas dinámicamente para que la cabecera desaparezca por completo si el módulo no está activo
    const tableColumns = useMemo(() => {
        return columns.filter(column => {
            if (column.id === 'age') return showAging;
            return true;
        });
    }, [showAging]);

    const categories = useMemo(() => {
        if (!products) return [];
        const uniqueCategories = [...new Set(products.map(p => p.category).filter(Boolean))] as string[];
        uniqueCategories.sort((a, b) => a.localeCompare(b));
        return ['all', ...uniqueCategories];
    }, [products]);

    const filteredProducts = useMemo(() => {
        if (!products) return [];
        let temp = products;
        if (categoryFilter !== 'all') temp = temp.filter(p => p.category === categoryFilter);
        
        if (stockFilter === 'low') temp = temp.filter(p => {
            const available = p.stockLevel - (p.reservedStock || 0) - (p.damagedStock || 0);
            return available > 0 && available <= p.lowStockThreshold;
        });
        
        if (stockFilter === 'out') temp = temp.filter(p => {
            const available = p.stockLevel - (p.reservedStock || 0) - (p.damagedStock || 0);
            return available <= 0;
        });

        if (stockFilter === 'old' && showAging) temp = temp.filter(p => {
            if (!p.createdAt) return false;
            return differenceInDays(new Date(), parseISO(p.createdAt)) > 15;
        });

        return temp;
    }, [products, stockFilter, categoryFilter, showAging]);

    return (
        <>
            <PageHeader title="Inventario">
                <PriceCalculatorDialog><Button variant="outline" size="icon"><Calculator className="h-4 w-4" /></Button></PriceCalculatorDialog>
                <ProductFormDialog productCount={products?.length || 0}>
                    <Button><PlusCircle className="mr-2 h-4 w-4" /> Añadir Producto</Button>
                </ProductFormDialog>
            </PageHeader>
            <main className="flex-1 p-4 sm:p-6">
                <Tabs value={stockFilter} onValueChange={(v) => setStockFilter(v as any)} className="mb-4">
                    <TabsList className={cn(
                        "grid w-full md:w-[600px]",
                        showAging ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-3"
                    )}>
                        <TabsTrigger value="all">Todos</TabsTrigger>
                        <TabsTrigger value="low">Stock Bajo</TabsTrigger>
                        <TabsTrigger value="out">Sin Stock</TabsTrigger>
                        {showAging && (
                            <TabsTrigger value="old" className="text-amber-600 font-bold">
                                <Clock className="w-3.5 h-3.5 mr-1.5" /> Antiguos (+15d)
                            </TabsTrigger>
                        )}
                    </TabsList>
                </Tabs>
                <DataTable 
                    columns={tableColumns} 
                    data={filteredProducts}
                    isLoading={isLoading}
                    filterPlaceholder="Buscar productos o descripción..."
                    meta={{ allProducts: products || [], showAging, showRepairs }}
                    globalFilterFn={productFilterFn}
                >
                    {(table) => (
                        <div className="flex flex-wrap items-center gap-2">
                             <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Categoría" /></SelectTrigger>
                                <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c === 'all' ? 'Todas las Categorías' : c}</SelectItem>)}</SelectContent>
                            </Select>
                            <PrintLabelsButton table={table} />
                            <BulkDeleteButton table={table} />
                        </div>
                    )}
                </DataTable>
            </main>
        </>
    );
}

export default function Page() {
  return (
    <SecurityGate module="inventory">
        <Suspense fallback={<div>Cargando...</div>}>
            <InventoryContent />
        </Suspense>
    </SecurityGate>
  );
}
