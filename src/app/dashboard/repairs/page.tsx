"use client";

import { useState, useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { PlusCircle, CalendarIcon, X as ClearIcon } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { columns } from "@/components/repairs/columns";
import { useCollection, useFirebase, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy } from "firebase/firestore";
import type { RepairJob } from "@/lib/types";
import { format, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { RepairFormDialog } from "@/components/repairs/repair-form-dialog";

export default function RepairsPage() {
    const { firestore, user } = useFirebase();
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

    const repairJobsQuery = useMemoFirebase(() =>
        (firestore && user) 
            ? query(collection(firestore, 'users', user.uid, 'repair_jobs'), orderBy('createdAt', 'desc')) 
            : null,
        [firestore, user?.uid]
    );
    const { data: repairJobs, isLoading } = useCollection<RepairJob>(repairJobsQuery);

    const filteredRepairJobs = useMemo(() => {
        if (!repairJobs) return [];
        if (!dateRange?.from) return repairJobs;
        const from = startOfDay(dateRange.from);
        const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
        return repairJobs.filter(job => job.createdAt && isWithinInterval(new Date(job.createdAt), { start: from, end: to }));
    }, [repairJobs, dateRange]);

    return (
        <>
            <PageHeader title="Trabajos de Reparación">
                <RepairFormDialog>
                    <Button><PlusCircle className="mr-2 h-4 w-4" /> Registrar Reparación</Button>
                </RepairFormDialog>
            </PageHeader>
            <main className="flex-1 p-4 sm:p-6">
                <DataTable 
                    columns={columns} 
                    data={filteredRepairJobs || []}
                    isLoading={isLoading}
                    filterPlaceholder="Buscar cliente o teléfono..."
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