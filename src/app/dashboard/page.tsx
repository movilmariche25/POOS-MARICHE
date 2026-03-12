"use client";

import { PageHeader } from "@/components/page-header";
import MonthlyActivityOverview from "@/components/dashboard/monthly-activity-overview";
import { useCollection, useFirebase, useMemoFirebase } from "@/firebase";
import { collection } from "firebase/firestore";
import type { Sale, RepairJob } from "@/lib/types";

export default function DashboardPage() {
    const { firestore, user } = useFirebase();

    // VENTAS
    const salesCollection = useMemoFirebase(() => 
        (firestore && user) ? collection(firestore, "users", user.uid, "sale_transactions") : null, 
        [firestore, user?.uid]
    );
    const { data: sales, isLoading: salesLoading } = useCollection<Sale>(salesCollection);

    // REPARACIONES
    const repairJobsCollection = useMemoFirebase(() =>
        (firestore && user) ? collection(firestore, "users", user.uid, "repair_jobs") : null,
        [firestore, user?.uid]
    );
    const { data: repairJobs, isLoading: repairsLoading } = useCollection<RepairJob>(repairJobsCollection);

    const isLoading = salesLoading || repairsLoading;

    return (
        <>
            <PageHeader title="Panel de Control" />
            <main className="flex-1 p-4 sm:p-6">
                <MonthlyActivityOverview 
                    sales={sales || []} 
                    repairJobs={repairJobs || []} 
                    isLoading={isLoading}
                />
            </main>
        </>
    );
}
