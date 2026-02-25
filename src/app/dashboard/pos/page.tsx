
"use client";

import { ProductGrid } from "@/components/pos/product-grid";
import { Suspense, useEffect, useState } from "react";
import type { CartItem, Product, RepairJob, HeldSale } from "@/lib/types";
import { CartDisplay } from "@/components/pos/cart-display";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useRouter } from "next/navigation";
import { useCollection, useFirebase, useMemoFirebase, deleteDocumentNonBlocking, setDocumentNonBlocking } from "@/firebase";
import { collection, doc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { ParkingSquare, Calculator } from "lucide-react";
import { HoldSaleDialog } from "@/components/pos/hold-sale-dialog";
import { HeldSalesSheet } from "@/components/pos/held-sales-sheet";
import { PriceCalculatorDialog } from "@/components/tools/price-calculator-dialog";
import { CustomItemDialog } from "@/components/pos/custom-item-dialog";

function POSContent() {
    const { firestore, user, isUserLoading } = useFirebase();
    const { toast } = useToast();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [cart, setCart] = useState<CartItem[]>([]);
    const [activeRepairJob, setActiveRepairJob] = useState<RepairJob | null>(null);

    const productsCollection = useMemoFirebase(() => 
        (firestore && user) ? collection(firestore, 'users', user.uid, 'products') : null,
        [firestore, user?.uid]
    );
    const { data: products, isLoading: productsLoading } = useCollection<Product>(productsCollection);
    
    const heldSalesCollection = useMemoFirebase(() => 
        (firestore && user) ? collection(firestore, 'users', user.uid, 'held_sales') : null,
        [firestore, user?.uid]
    );
    const { data: heldSales } = useCollection<HeldSale>(heldSalesCollection);

    useEffect(() => {
        if (!user || isUserLoading) return;

        const repairJobData = searchParams.get('repairJob');
        const restoredSaleId = searchParams.get('restoredSaleId');
        const restoredCartItems = searchParams.get('items');
       
        if (restoredCartItems && products) {
            try {
                const itemsToRestore: CartItem[] = JSON.parse(decodeURIComponent(restoredCartItems));
                const restoredCart = itemsToRestore.map(item => {
                    if (item.isCustom) return item;
                    const product = products.find(p => p.id === item.productId);
                    if (!product) return null;
                    return { ...item, name: product.name };
                }).filter((item): item is CartItem => item !== null);

                setCart(restoredCart);
                if (restoredSaleId && firestore) {
                    deleteDocumentNonBlocking(doc(firestore, 'users', user.uid, 'held_sales', restoredSaleId));
                }
                router.replace('/dashboard/pos');
            } catch(e) {
                toast({ variant: "destructive", title: "Error", description: "No se pudo restaurar la venta." });
            }
        } else if (repairJobData) {
            try {
                const job: RepairJob = JSON.parse(decodeURIComponent(repairJobData));
                setActiveRepairJob(job);
                setCart([{ productId: job.id!, name: `Reparación: ${job.deviceMake} ${job.deviceModel}`, quantity: 1, isRepair: true }]);
            } catch (error) {
                router.push('/dashboard/repairs');
            }
        }
    }, [searchParams, user, isUserLoading, products, firestore]);

    const handleProductSelect = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(i => i.productId === product.id && !i.isRepair && !i.isCustom);
            if (existing) return prev.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
            return [...prev, { productId: product.id!, name: product.name, quantity: 1 }];
        });
    };

    const handleAddCustomItem = (name: string, price: number, costPrice: number) => {
        setCart(prev => [...prev, { productId: `custom-${Date.now()}`, name, quantity: 1, isCustom: true, customPrice: price, customCostPrice: costPrice }]);
    };

    const handleHoldSale = async (name: string) => {
        if (!firestore || !user || cart.length === 0) return;
        const ref = doc(collection(firestore, 'users', user.uid, 'held_sales'));
        setDocumentNonBlocking(ref, { id: ref.id, name, items: cart, createdAt: new Date().toISOString() });
        setCart([]);
    };

    const handleRemoveItem = (id: string, isRepair?: boolean) => {
        setCart(prev => prev.filter(i => {
            if (isRepair) return !(i.productId === id && i.isRepair);
            return !(i.productId === id && !i.isRepair);
        }));
    };

    return (
        <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
             <header className="bg-white flex h-14 items-center gap-4 border-b px-4 sm:h-16 sm:px-6">
                <div className="flex items-center gap-2">
                    <SidebarTrigger />
                    <h1 className="text-lg font-semibold">Punto de Venta</h1>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <PriceCalculatorDialog><Button variant="outline" size="icon"><Calculator className="h-4 w-4" /></Button></PriceCalculatorDialog>
                    <CustomItemDialog onAddCustomItem={handleAddCustomItem} />
                    <HeldSalesSheet heldSales={heldSales || []} />
                    <HoldSaleDialog onHoldSale={handleHoldSale} disabled={cart.length === 0 || cart.some(c => c.isRepair)}>
                        <Button variant="outline"><ParkingSquare className="mr-2 h-4 w-4" /> Aparcar</Button>
                    </HoldSaleDialog>
                </div>
            </header>
            <main className="flex-1 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 overflow-hidden">
                <div className="col-span-1 md:col-span-1 lg:col-span-2 bg-white border-r flex flex-col">
                    <CartDisplay 
                        cart={cart}
                        allProducts={products || []}
                        onUpdateQuantity={(id, q) => setCart(prev => prev.map(i => i.productId === id ? { ...i, quantity: q } : i))}
                        onRemoveItem={handleRemoveItem}
                        onClearCart={() => setCart([])}
                        onTogglePromo={(id) => setCart(prev => prev.map(i => i.productId === id ? { ...i, isPromo: !i.isPromo } : i))}
                        onToggleGift={(id) => setCart(prev => prev.map(i => i.productId === id ? { ...i, isGift: !i.isGift } : i))}
                        repairJobId={activeRepairJob?.id}
                    />
                </div>
                <div className="col-span-1 md:col-span-2 lg:col-span-3 p-4 overflow-hidden">
                     <ProductGrid products={products || []} onProductSelect={handleProductSelect} isLoading={productsLoading} />
                </div>
            </main>
        </div>
    )
}

export default function POSPage() {
    return <Suspense fallback={<div>Cargando...</div>}><POSContent /></Suspense>
}
