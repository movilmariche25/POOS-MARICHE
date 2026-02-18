"use client";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { MonthlyActivityOverview } from "@/components/dashboard/monthly-activity-overview";
import { useCollection, useFirebase, useMemoFirebase } from "@/firebase";
import { collection } from "firebase/firestore";
import type { Sale, RepairJob } from "@/lib/types";
import { useMemo } from "react";
import { Wrench, ShoppingCart } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";
import { isToday } from "date-fns";

export default function DashboardPage() {
    const { firestore, user } = useFirebase();
    const { format: formatCurrency, getSymbol, isLoading: currencyIsLoading } = useCurrency();

    const salesCollection = useMemoFirebase(() => 
        (firestore && user) ? collection(firestore, "users", user.uid, "sale_transactions") : null, 
        [firestore, user?.uid]
    );
    const { data: sales, isLoading: salesLoading } = useCollection<Sale>(salesCollection);

    const repairJobsCollection = useMemoFirebase(() =>
        (firestore && user) ? collection(firestore, "users", user.uid, "repair_jobs") : null,
        [firestore, user?.uid]
    );
    const { data: repairJobs, isLoading: repairsLoading } = useCollection<RepairJob>(repairJobsCollection);

    const stats = useMemo(() => {
        if (!sales || !repairJobs) {
            return { todaySalesCount: 0, todaySalesTotal: 0, todayRepairsCount: 0 };
        }
        const todaySales = sales.filter(s => s.transactionDate && isToday(new Date(s.transactionDate)) && s.status !== 'refunded');
        const todayRepairs = repairJobs.filter(r => r.createdAt && isToday(new Date(r.createdAt)));
        const todaySalesTotal = todaySales.reduce((acc, s) => acc + s.totalAmount, 0);
        return { todaySalesCount: todaySales.length, todaySalesTotal, todayRepairsCount: todayRepairs.length };
    }, [sales, repairJobs]);

    const isLoading = salesLoading || repairsLoading || currencyIsLoading;

    return (
        <>
            <PageHeader title="Panel de Control" />
            <main className="flex-1 p-4 sm:p-6 space-y-6">
                 <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <StatCard 
                        title="Ventas de Hoy"
                        value={`${getSymbol()}${formatCurrency(stats.todaySalesTotal)}`}
                        description={`${stats.todaySalesCount} transacciones`}
                        icon={<ShoppingCart />}
                        href="/dashboard/reports"
                        isLoading={isLoading}
                    />
                     <StatCard 
                        title="Reparaciones Hoy"
                        value={stats.todayRepairsCount}
                        description="Nuevos trabajos registrados"
                        icon={<Wrench />}
                        href="/dashboard/repairs"
                        isLoading={isLoading}
                    />
                </div>
                <div className="grid grid-cols-1">
                    <MonthlyActivityOverview 
                        sales={sales || []} 
                        repairJobs={repairJobs || []} 
                        isLoading={isLoading}
                    />
                </div>
            </main>
        </>
    );
}