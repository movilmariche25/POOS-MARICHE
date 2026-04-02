"use client";

import { PageHeader } from "@/components/page-header";
import { ReportsView } from "@/components/reports/reports-view";
import { useCollection, useFirebase, useMemoFirebase } from "@/firebase";
import type { Product, Sale, RepairJob, CurrencyExchange, Fiado } from "@/lib/types";
import { collection } from "firebase/firestore";
import { SecurityGate } from "@/components/security-gate";

export default function ReportsPage() {
    return (
        <SecurityGate module="reports">
            <ReportsContent />
        </SecurityGate>
    );
}

function ReportsContent() {
    const { firestore, user } = useFirebase();
    
    const salesCollection = useMemoFirebase(() => 
        (firestore && user) ? collection(firestore, "users", user.uid, "sale_transactions") : null, 
        [firestore, user?.uid]
    );
    const { data: sales, isLoading: salesLoading } = useCollection<Sale>(salesCollection);

    const productsCollection = useMemoFirebase(() => 
        (firestore && user) ? collection(firestore, "users", user.uid, "products") : null,
        [firestore, user?.uid]
    );
    const { data: products, isLoading: productsLoading } = useCollection<Product>(productsCollection);

    const repairJobsCollection = useMemoFirebase(() =>
        (firestore && user) ? collection(firestore, "users", user.uid, "repair_jobs") : null,
        [firestore, user?.uid]
    );
    const { data: repairJobs, isLoading: repairsLoading } = useCollection<RepairJob>(repairJobsCollection);

    const exchangeCollection = useMemoFirebase(() => 
        (firestore && user) ? collection(firestore, "users", user.uid, "currency_exchanges") : null,
        [firestore, user?.uid]
    );
    const { data: exchanges, isLoading: exchangesLoading } = useCollection<CurrencyExchange>(exchangeCollection);

    const fiadosCollection = useMemoFirebase(() => 
        (firestore && user) ? collection(firestore, "users", user.uid, "fiados") : null,
        [firestore, user?.uid]
    );
    const { data: fiados, isLoading: fiadosLoading } = useCollection<Fiado>(fiadosCollection);

    return (
        <>
            <PageHeader title="Reportes" />
            <main className="flex-1 p-4 sm:p-6">
                <ReportsView 
                    sales={sales || []} 
                    products={products || []} 
                    repairJobs={repairJobs || []}
                    exchanges={exchanges || []}
                    fiados={fiados || []}
                    isLoading={salesLoading || productsLoading || repairsLoading || exchangesLoading || fiadosLoading}
                />
            </main>
        </>
    )
}