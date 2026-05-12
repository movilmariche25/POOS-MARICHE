
"use client"

import type { Product, Sale, DailyReconciliation, RepairJob, CurrencyExchange, Fiado } from "@/lib/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { TransactionList } from "./transaction-list"
import { useCurrency } from "@/hooks/use-currency"
import { useCollection, useFirebase, useMemoFirebase } from "@/firebase"
import { useMemo } from "react"
import { collection, query, orderBy } from "firebase/firestore"
import { CashReconciliationDialog } from "./cash-reconciliation-dialog"
import { ReconciliationHistory } from "./reconciliation-history"
import { DateRangeReport } from "./date-range-report"
import { ExportSalesButton } from "./export-sales-button"

type ReportsViewProps = {
    sales: Sale[];
    products: Product[];
    repairJobs: RepairJob[];
    exchanges: CurrencyExchange[];
    fiados: Fiado[];
    isLoading?: boolean;
}

export function ReportsView({ sales, products, repairJobs, exchanges, fiados, isLoading }: ReportsViewProps) {
    const { firestore, user } = useFirebase();

    const reconciliationsCollection = useMemoFirebase(() => 
        (firestore && user) ? query(collection(firestore, "users", user.uid, "daily_reconciliations"), orderBy("closedAt", "desc")) : null,
        [firestore, user?.uid]
    );
    const { data: reconciliations, isLoading: reconciliationsLoading } = useCollection<DailyReconciliation>(reconciliationsCollection);

    // Seleccionamos todas las ventas que NO han sido incluidas en un cierre de caja aún
    const openSales = useMemo(() => {
        if (!sales) return [];
        // Filtramos ventas completadas que no tengan reconciliationId
        return sales.filter(s => s.status === 'completed' && !s.reconciliationId);
    }, [sales]);


    return (
        <Tabs defaultValue="summary">
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="summary">Resumen y Cierre</TabsTrigger>
                <TabsTrigger value="history">Historial de Cierres</TabsTrigger>
                <TabsTrigger value="log">Registro de Transacciones</TabsTrigger>
            </TabsList>
            <TabsContent value="summary" className="space-y-4 mt-4">
                 <CashReconciliationDialog openSales={openSales} />
                 
                 <DateRangeReport 
                    sales={sales || []} 
                    products={products || []} 
                    repairJobs={repairJobs || []}
                    fiados={fiados || []}
                    reconciliations={reconciliations || []}
                    exchanges={exchanges || []}
                    isLoading={isLoading || reconciliationsLoading}
                 />
                 
                 <Card>
                    <CardHeader>
                        <CardTitle>Exportar Ventas</CardTitle>
                        <CardDescription>Exporta un registro de ventas en formato Excel para un rango de fechas seleccionado.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ExportSalesButton 
                            sales={sales || []} 
                            products={products || []} 
                            repairJobs={repairJobs || []} 
                            fiados={fiados || []}
                        />
                    </CardContent>
                 </Card>
            </TabsContent>
            <TabsContent value="history">
                 < ReconciliationHistory reconciliations={reconciliations || []} isLoading={reconciliationsLoading} />
            </TabsContent>
            <TabsContent value="log">
                <Card>
                    <CardHeader>
                        <CardTitle>Todas las Transacciones</CardTitle>
                        <CardDescription>Un registro completo de todas las ventas, incluyendo las cerradas y reembolsadas.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <TransactionList sales={sales || []} isLoading={isLoading} />
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    )
}
