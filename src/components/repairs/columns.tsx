
"use client"

import type { ColumnDef } from "@tanstack/react-table"
import type { RepairJob, RepairStatus, UserProfile, Product, ReservedPart } from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal, Edit, Trash2, DollarSign, Printer, Eye, ArrowUpDown, Tag, Files, ShieldCheck, RefreshCcw, Loader2 } from "lucide-react"
import { Badge } from "../ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { format, parseISO, addDays, isAfter, differenceInDays } from "date-fns"
import { es } from "date-fns/locale"
import { useCurrency } from "@/hooks/use-currency"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { useFirebase, updateDocumentNonBlocking, useDoc, useMemoFirebase } from "@/firebase"
import { doc, runTransaction, type DocumentSnapshot } from "firebase/firestore"
import { handlePrintCustomerTicket, handlePrintInternalTicket, handlePrintStickerTicket, handlePrintAllTickets } from "./repair-ticket"
import { AdminAuthDialog } from "../admin-auth-dialog"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { RepairFormDialog } from "./repair-form-dialog"

const repairStatuses: RepairStatus[] = ['Pendiente', 'Pagado', 'Completado', 'Garantía'];

const ActionsCell = ({ repairJob }: { repairJob: RepairJob }) => {
    const { toast } = useToast();
    const { firestore, user } = useFirebase();
    const router = useRouter();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const { bcvRate, parallelRate } = useCurrency();
    
    const profileRef = useMemoFirebase(() => 
        (firestore && user) ? doc(firestore, 'users', user.uid) : null,
        [firestore, user?.uid]
    );
    const { data: profile } = useDoc<UserProfile>(profileRef);

    const estimatedCost = repairJob.estimatedCost || 0;
    const amountPaid = repairJob.amountPaid || 0;
    const remainingBalance = estimatedCost - amountPaid;
    const isCompleted = repairJob.status === 'Completado';
    const isCompletedAndPaid = isCompleted && repairJob.isPaid;

    const handlePay = () => {
        const repairData = encodeURIComponent(JSON.stringify(repairJob));
        router.push(`/dashboard/pos?repairJob=${repairData}`);
    };

    const handleReenterForWarranty = () => {
        if (!firestore || !user || !repairJob.id) return;
        const jobRef = doc(firestore, 'users', user.uid, 'repair_jobs', repairJob.id);
        updateDocumentNonBlocking(jobRef, {
            status: 'Garantía',
            completedAt: null,
            warrantyEndDate: null,
        });
        toast({ 
            title: "Reingreso por Garantía", 
            description: "El trabajo ha sido reactivado para revisión técnica.",
        });
    };

    const handleDelete = async () => {
        if (!firestore || !repairJob.id || !user) return;
        
        try {
            await runTransaction(firestore, async (transaction) => {
                const jobRef = doc(firestore, 'users', user.uid, 'repair_jobs', repairJob.id!);
                const jobSnap = await transaction.get(jobRef);
                if (!jobSnap.exists()) return;
                const data = jobSnap.data() as RepairJob;

                const reservedParts = data.reservedParts || [];
                const consumedParts = data.consumedParts || [];
                
                const productIds = Array.from(new Set([
                    ...reservedParts.map(p => p.productId),
                    ...consumedParts.map(p => p.productId)
                ]));

                const productSnapshots = new Map<string, DocumentSnapshot>();
                for (const pid of productIds) {
                    const productRef = doc(firestore, 'users', user.uid, 'products', pid);
                    const snap = await transaction.get(productRef);
                    productSnapshots.set(pid, snap);
                }

                for (const part of reservedParts) {
                    if (part.isManual) continue;
                    const pSnap = productSnapshots.get(part.productId);
                    if (pSnap?.exists()) {
                        const pData = pSnap.data() as Product;
                        transaction.update(pSnap.ref, { 
                            reservedStock: Math.max(0, (pData.reservedStock || 0) - part.quantity) 
                        });
                    }
                }

                for (const part of consumedParts) {
                    if (part.isManual) continue;
                    const pSnap = productSnapshots.get(part.productId);
                    if (pSnap?.exists()) {
                        const pData = pSnap.data() as Product;
                        transaction.update(pSnap.ref, { 
                            stockLevel: (pData.stockLevel || 0) + part.quantity 
                        });
                    }
                }
                
                transaction.delete(jobRef);
            });

            toast({
                title: "Trabajo Eliminado",
                description: `El registro de ${repairJob.customerName} ha sido borrado.`,
                variant: "destructive"
            });

        } catch (error: any) {
             console.error("Delete Error:", error);
             toast({ title: "Error", description: "No se pudo eliminar.", variant: "destructive" });
        } finally {
            setIsDeleteDialogOpen(false);
        }
    }
    
    const onPrintCustomer = () => {
        handlePrintCustomerTicket({ repairJob, businessName: profile?.businessName, profile, bcvRate, parallelRate }, (error) => {
             toast({ variant: "destructive", title: "Error", description: error })
        });
    }

    const onPrintInternal = () => {
        handlePrintInternalTicket({ repairJob, businessName: profile?.businessName, profile, bcvRate, parallelRate }, (error) => {
             toast({ variant: "destructive", title: "Error", description: error })
        });
    }

    const onPrintSticker = () => {
        handlePrintStickerTicket({ repairJob, profile }, (error) => {
             toast({ variant: "destructive", title: "Error", description: error })
        });
    }

    const onPrintAll = () => {
        handlePrintAllTickets({ repairJob, businessName: profile?.businessName, profile, bcvRate, parallelRate }, (error) => {
             toast({ variant: "destructive", title: "Error", description: error })
        });
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                    <span className="sr-only">Abrir menú</span>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                    
                    {remainingBalance > 0.001 && !repairJob.isPaid && (
                         <DropdownMenuItem onSelect={handlePay} className="text-green-600 focus:text-green-700">
                            <DollarSign className="mr-2 h-4 w-4" />
                            Cobrar
                        </DropdownMenuItem>
                    )}

                    {isCompleted && (
                        <DropdownMenuItem onSelect={handleReenterForWarranty} className="text-amber-600 focus:text-amber-700">
                            <RefreshCcw className="mr-2 h-4 w-4" />
                            Reingresar por Garantía
                        </DropdownMenuItem>
                    )}
                    
                    <RepairFormDialog repairJob={repairJob}>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                             {isCompletedAndPaid ? <Eye className="mr-2 h-4 w-4" /> : <Edit className="mr-2 h-4 w-4" />}
                            {isCompletedAndPaid ? 'Ver Detalles' : 'Editar / Ver Detalles'}
                        </DropdownMenuItem>
                    </RepairFormDialog>
                    
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={onPrintAll}>
                        <Files className="mr-2 h-4 w-4" />
                        Imprimir Todo (3 tickets)
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={onPrintCustomer}>
                        <Printer className="mr-2 h-4 w-4" />
                        Imprimir Nota Cliente
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={onPrintInternal}>
                        <Printer className="mr-2 h-4 w-4" />
                        Imprimir Control Interno
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={onPrintSticker}>
                        <Tag className="mr-2 h-4 w-4" />
                        Imprimir Etiqueta
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />
                    <AdminAuthDialog onAuthorized={() => setIsDeleteDialogOpen(true)}>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={(e) => { e.preventDefault(); }}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar
                        </DropdownMenuItem>
                    </AdminAuthDialog>
                </DropdownMenuContent>
            </DropdownMenu>

             <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                    <AlertDialogDescription>Esto eliminará el trabajo y devolverá las piezas al stock.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Eliminar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
             </AlertDialog>
        </>
    )
}

const StatusCell = ({ repairJob }: { repairJob: RepairJob }) => {
    const { toast } = useToast();
    const { firestore, user } = useFirebase();
    const [isUpdating, setIsUpdating] = useState(false);

    const handleStatusChange = async (newStatus: RepairStatus) => {
        if (!firestore || !user || !repairJob.id || repairJob.status === 'Completado' || isUpdating) return;
        
        setIsUpdating(true);
        try {
            await runTransaction(firestore, async (transaction) => {
                const jobRef = doc(firestore, 'users', user.uid, 'repair_jobs', repairJob.id!);
                const jobSnap = await transaction.get(jobRef);
                if (!jobSnap.exists()) return;
                const jobData = jobSnap.data() as RepairJob;

                const reservedParts = jobData.reservedParts || [];
                const currentConsumed = jobData.consumedParts || [];

                const productIds = Array.from(new Set(reservedParts.map(p => p.productId)));
                const productSnaps = new Map<string, DocumentSnapshot>();
                
                if (newStatus === 'Completado' && reservedParts.length > 0) {
                    for (const pid of productIds) {
                        const productRef = doc(firestore, 'users', user.uid, 'products', pid);
                        const pSnap = await transaction.get(productRef);
                        productSnaps.set(pid, pSnap);
                    }
                }

                let updateData: Partial<RepairJob> = { status: newStatus };

                if (newStatus === 'Completado') {
                    for (const part of reservedParts) {
                        if (part.isManual) continue;
                        const pSnap = productSnaps.get(part.productId);
                        if (pSnap?.exists()) {
                            const pData = pSnap.data() as Product;
                            transaction.update(pSnap.ref, {
                                stockLevel: (pData.stockLevel || 0) - part.quantity,
                                reservedStock: Math.max(0, (pData.reservedStock || 0) - part.quantity)
                            });
                        }
                    }
                    
                    const completionDate = new Date();
                    updateData.completedAt = completionDate.toISOString();
                    updateData.warrantyEndDate = addDays(completionDate, 4).toISOString();
                    updateData.partsConsumed = true;
                    updateData.consumedParts = [...currentConsumed, ...reservedParts];
                    updateData.reservedParts = [];
                }

                transaction.update(jobRef, updateData);
            });

            toast({ title: 'Estado Actualizado' });
        } catch (e: any) {
            console.error("Status Change Error:", e);
            toast({ variant: "destructive", title: "Error", description: e.message });
        } finally {
            setIsUpdating(false);
        }
    }

    const status: RepairStatus = repairJob.status;
    let badgeVariant: "default" | "secondary" | "destructive" | "outline" = 'secondary';
    let badgeClassName = '';

    if (status === 'Completado') {
        badgeVariant = 'secondary';
        badgeClassName = 'bg-green-500 text-white hover:bg-green-600';
    } else if (status === 'Pagado') {
        badgeVariant = 'default';
        badgeClassName = 'bg-blue-500 text-white hover:bg-blue-600';
    } else if (status === 'Garantía') {
        badgeVariant = 'destructive';
        badgeClassName = 'bg-orange-600 text-white animate-pulse';
    } else { 
        badgeVariant = 'destructive';
    }
    
    if (status === 'Completado') {
        return (
            <div className="flex flex-col items-center gap-1">
                <Badge variant={badgeVariant} className={cn(badgeClassName)}>{repairJob.isPaid ? 'Entregado y Pagado' : 'Entregado'}</Badge>
                {repairJob.warrantyEndDate && isAfter(parseISO(repairJob.warrantyEndDate), new Date()) && (
                    <Badge variant="outline" className="text-[9px] border-blue-200 text-blue-600 bg-blue-50 py-0 flex items-center gap-1 font-black">
                        <ShieldCheck className="w-2.5 h-2.5" />
                        GARANTÍA: {differenceInDays(parseISO(repairJob.warrantyEndDate), new Date())}D
                    </Badge>
                )}
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            {isUpdating && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            <Select value={repairJob.status} onValueChange={handleStatusChange} disabled={repairJob.status === 'Completado' || isUpdating}>
                <SelectTrigger className="w-48 border-0 bg-transparent shadow-none focus:ring-0">
                    <SelectValue asChild>
                         <Badge variant={badgeVariant} className={cn(badgeClassName, "cursor-pointer")}>{repairJob.status === 'Garantía' ? 'REINGRESO GARANTÍA' : repairJob.status}</Badge>
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    {repairStatuses.map(s => (
                        <SelectItem key={s} value={s}>{s === 'Garantía' ? 'REINGRESO POR GARANTÍA' : s}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
}

export const columns: ColumnDef<RepairJob>[] = [
  {
    accessorKey: "id",
    header: "ID de Trabajo",
    cell: ({ row }) => <div className="font-mono text-xs text-muted-foreground">{row.original.id}</div>,
  },
  {
    accessorKey: "customerName",
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        Cliente
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => <div className="font-medium uppercase">{row.getValue("customerName")}</div>
  },
  {
    accessorKey: "device",
    header: "Dispositivo",
    cell: ({ row }) => <span className="uppercase">{row.original.deviceMake} {row.original.deviceModel}</span>,
  },
  {
    accessorKey: "status",
    header: "Estado",
    cell: ({ row }) => <StatusCell repairJob={row.original} />,
  },
  {
    accessorKey: "createdAt",
    header: "Fecha de Registro",
    cell: ({ row }) => {
        if (!row.getValue("createdAt")) return null;
        const date = parseISO(row.getValue("createdAt") as string);
        return <div>{format(date, 'MMM d, yyyy', { locale: es })}</div>
    }
  },
  {
    accessorKey: "estimatedCost",
    header: () => <div className="text-right">Costo Estimado</div>,
    cell: function Cell({ row }) {
      const { format, getSymbol } = useCurrency();
      const amount = parseFloat(row.getValue("estimatedCost"))
      return <div className="text-right font-medium">{getSymbol()}{format(amount)}</div>
    },
  },
   {
    accessorKey: "amountPaid",
    header: () => <div className="text-right">Pagado</div>,
    cell: function Cell({ row }) {
      const { format, getSymbol } = useCurrency();
      const amount = parseFloat(row.getValue("amountPaid") || 0)
      return <div className="text-right font-medium text-green-600">{getSymbol()}{format(amount)}</div>
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <ActionsCell repairJob={row.original} />,
  },
]
