"use client";

import { useState, useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { PlusCircle, CalendarIcon, X as ClearIcon, Clock, DollarSign, LayoutGrid, ShieldCheck } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { columns } from "@/components/repairs/columns";
import { useCollection, useFirebase, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy } from "firebase/firestore";
import type { RepairJob } from "@/lib/types";
import { format, isWithinInterval, startOfDay, endOfDay, isAfter, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { RepairFormDialog } from "@/components/repairs/repair-form-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FilterFn } from "@tanstack/react-table";
import { SecurityGate } from "@/components/security-gate";

// Filtro personalizado para reparaciones
const repairFilterFn: FilterFn<RepairJob> = (row, columnId, value) => {
    const term = String(value).toLowerCase();
    const r = row.original;
    return (
        (r.customerName || "").toLowerCase().includes(term) ||
        (r.customerPhone || "").toLowerCase().includes(term) ||
        (r.customerID || "").toLowerCase().includes(term) ||
        (r.deviceMake || "").toLowerCase().includes(term) ||
        (r.deviceModel || "").toLowerCase().includes(term) ||
        (r.reportedIssue || "").toLowerCase().includes(term) ||
        (r.id || "").toLowerCase().includes(term)
    );
};

type StatusFilter = 'all' | 'unpaid' | 'undelivered' | 'warranty';

export default function RepairsPage() {
    return (
        <SecurityGate module="repairs">
            <RepairsContent />
        </SecurityGate>
    );
}

function RepairsContent() {
    const { firestore, user } = useFirebase();
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

    const repairJobsQuery = useMemoFirebase(() =>
        (firestore && user) 
            ? query(collection(firestore, 'users', user.uid, 'repair_jobs'), orderBy('createdAt', 'desc')) 
            : null,
        [firestore, user?.uid]
    );
    const { data: repairJobs, isLoading } = useCollection<RepairJob>(repairJobsQuery);

    const filteredRepairJobs = useMemo(() => {
        if (!repairJobs) return [];
        let temp = repairJobs;

        // Filtro de Fecha
        if (dateRange?.from) {
            const from = startOfDay(dateRange.from);
            const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
            temp = temp.filter(job => job.createdAt && isWithinInterval(new Date(job.createdAt), { start: from, end: to }));
        }

        // Filtros de Estado
        if (statusFilter === 'unpaid') {
            temp = temp.filter(job => !job.isPaid);
        } else if (statusFilter === 'undelivered') {
            temp = temp.filter(job => job.status !== 'Completado');
        } else if (statusFilter === 'warranty') {
            const now = new Date();
            temp = temp.filter(job => {
                if (job.status !== 'Completado' || !job.warrantyEndDate) return false;
                return isAfter(parseISO(job.warrantyEndDate), now);
            });
        }

        return temp;
    }, [repairJobs, dateRange, statusFilter]);

    return (
        <>
            <PageHeader title="Trabajos de Reparación">
                <RepairFormDialog>
                    <Button><PlusCircle className="mr-2 h-4 w-4" /> Registrar Reparación</Button>
                </RepairFormDialog>
            </PageHeader>
            <main className="flex-1 p-4 sm:p-6 space-y-4">
                <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)} className="w-full">
                    <TabsList className="grid w-full grid-cols-4 max-w-[800px]">
                        <TabsTrigger value="all" className="flex items-center gap-2">
                            <LayoutGrid className="w-3.5 h-3.5" /> Todas
                        </TabsTrigger>
                        <TabsTrigger value="unpaid" className="flex items-center gap-2 text-destructive font-bold">
                            <DollarSign className="w-3.5 h-3.5" /> Por Cobrar
                        </TabsTrigger>
                        <TabsTrigger value="undelivered" className="flex items-center gap-2 text-amber-600 font-bold">
                            <Clock className="w-3.5 h-3.5" /> Por Entregar
                        </TabsTrigger>
                        <TabsTrigger value="warranty" className="flex items-center gap-2 text-blue-600 font-bold">
                            <ShieldCheck className="w-3.5 h-3.5" /> En Garantía
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                <DataTable 
                    columns={columns} 
                    data={filteredRepairJobs || []}
                    isLoading={isLoading}
                    filterPlaceholder="Buscar cliente, equipo, falla o ID..."
                    globalFilterFn={repairFilterFn}
                >
                    {(table) => (
                        <div className="flex items-center gap-2">
                             <Popover>
                                <PopoverTrigger asChild>
                                <Button variant="outline" className={cn("w-[280px] justify-start", !dateRange && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "P", { locale: es })} - ${format(dateRange.to, "P", { locale: es })}` : format(dateRange.from, "P", { locale: es })) : "Filtrar por fecha"}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="range" selected={dateRange} onSelect={setDateRange} locale={es} />
                                </PopoverContent>
                            </Popover>
                            {dateRange && <Button variant="ghost" size="icon" onClick={() => setDateRange(undefined)}><ClearIcon className="h-4 w-4" /></Button>}
                        </div>
                    )}
                </DataTable>
            </main>
        </>
    )
}
