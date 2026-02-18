
"use client";

import React, { Suspense, useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { PlusCircle, Trash2, Calculator } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { columns } from "@/components/inventory/columns";
import { ProductFormDialog } from "@/components/inventory/product-form-dialog";
import type { Product } from '@/lib/types';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCollection, useFirebase, useMemoFirebase } from '@/firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { useSearchParams } from 'next/navigation';
import type { Table as TanstackTable } from '@tanstack/react-table';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
    const productsCollection = useMemoFirebase(() =>
        (firestore && user) ? collection(firestore, 'users', user.uid, 'products') : null,
        [firestore, user?.uid]
    );
    const { data: products, isLoading } = useCollection<Product>(productsCollection);

    const searchParams = useSearchParams();
    const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
    const [categoryFilter, setCategoryFilter] = useState('all');

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
        if (stockFilter === 'low') temp = temp.filter(p => (p.stockLevel - (p.reservedStock || 0)) > 0 && (p.stockLevel - (p.reservedStock || 0)) <= p.lowStockThreshold);
        if (stockFilter === 'out') temp = temp.filter(p => (p.stockLevel - (p.reservedStock || 0)) <= 0);
        return temp;
    }, [products, stockFilter, categoryFilter]);

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
                    <TabsList><TabsTrigger value="all">Todos</TabsTrigger><TabsTrigger value="low">Stock Bajo</TabsTrigger><TabsTrigger value="out">Sin Stock</TabsTrigger></TabsList>
                </Tabs>
                <DataTable 
                    columns={columns} 
                    data={filteredProducts}
                    isLoading={isLoading}
                    filterPlaceholder="Buscar productos..."
                    meta={{ allProducts: products || [] }}
                >
                    {(table) => (
                        <div className="flex items-center gap-2">
                             <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Categoría" /></SelectTrigger>
                                <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c === 'all' ? 'Todas' : c}</SelectItem>)}</SelectContent>
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
  return <Suspense fallback={<div>Cargando...</div>}><InventoryContent /></Suspense>;
}
