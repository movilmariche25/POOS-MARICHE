
"use client";

import { PageHeader } from "@/components/page-header";
import { AnalysisView } from "@/components/analysis/analysis-view";
import { useCollection, useFirebase, useMemoFirebase, useDoc } from "@/firebase";
import type { Product, Sale, RepairJob, UserProfile } from "@/lib/types";
import { collection, doc } from "firebase/firestore";
import { SecurityGate } from "@/components/security-gate";

export default function AnalysisPage() {
    return (
        <SecurityGate module="analysis">
            <AnalysisContent />
        </SecurityGate>
    );
}

function AnalysisContent() {
    const { firestore, user } = useFirebase();
    
    const profileRef = useMemoFirebase(() => 
        (firestore && user) ? doc(firestore, 'users', user.uid) : null,
        [firestore, user?.uid]
    );
    const { data: profile } = useDoc<UserProfile>(profileRef);

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
                    enabledModules={profile?.enabledModules}
                    isAdmin={profile?.isAdmin}
                />
            </main>
        </>
    )
}
