"use client";

import { PageHeader } from "@/components/page-header";
import { AnalysisView } from "@/components/analysis/analysis-view";
import { useCollection, useFirebase, useMemoFirebase } from "@/firebase";
import type { Product, Sale, RepairJob } from "@/lib/types";
import { collection } from "firebase/firestore";

export default function AnalysisPage() {
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

    return (
        <>
            <PageHeader title="Análisis de Negocio" />
            <main className="flex-1 p-4 sm:p-6">
                <AnalysisView 
                    sales={sales || []} 
                    products={products || []} 
                    repairJobs={repairJobs || []}
                    isLoading={salesLoading || productsLoading || repairsLoading}
                />
            </main>
        </>
    )
}