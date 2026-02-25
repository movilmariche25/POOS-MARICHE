
"use client";

import { PageHeader } from "@/components/page-header";
import { useCollection, useFirebase, useMemoFirebase, setDocumentNonBlocking, deleteDocumentNonBlocking } from "@/firebase";
import { collection, doc, query, orderBy } from "firebase/firestore";
import type { PayrollPayment, Worker } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { PlusCircle, Wallet, Trash2, Calendar, User, DollarSign, Landmark, History, Users, Plus } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AdminAuthDialog } from "@/components/admin-auth-dialog";
import { useCurrency } from "@/hooks/use-currency";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function PayrollPage() {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const { format: formatCurrency } = useCurrency();
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isWorkerOpen, setIsWorkerOpen] = useState(false);

    const payrollCollection = useMemoFirebase(() => 
        (firestore && user) ? query(collection(firestore, "users", user.uid, "payroll_payments"), orderBy("createdAt", "desc")) : null,
        [firestore, user?.uid]
    );
    const { data: payments, isLoading } = useCollection<PayrollPayment>(payrollCollection);

    const workersCollection = useMemoFirebase(() => 
        (firestore && user) ? query(collection(firestore, "users", user.uid, "workers"), orderBy("createdAt", "desc")) : null,
        [firestore, user?.uid]
    );
    const { data: workers, isLoading: workersLoading } = useCollection<Worker>(workersCollection);

    const workerSummaries = useMemo(() => {
        if (!payments) return [];
        const summaries: Record<string, { usd: number, bs: number, count: number }> = {};
        
        payments.forEach(p => {
            const name = p.workerName.trim().toUpperCase();
            if (!summaries[name]) summaries[name] = { usd: 0, bs: 0, count: 0 };
            summaries[name].usd += p.amountUSD || 0;
            summaries[name].bs += p.amountBs || 0;
            summaries[name].count += 1;
        });

        return Object.entries(summaries).map(([name, data]) => ({ name, ...data }));
    }, [payments]);

    const handleDelete = (id: string) => {
        if (!firestore || !user) return;
        deleteDocumentNonBlocking(doc(firestore, 'users', user.uid, 'payroll_payments', id));
        toast({ title: "Registro eliminado", variant: "destructive" });
    };

    const handleDeleteWorker = (id: string) => {
        if (!firestore || !user) return;
        deleteDocumentNonBlocking(doc(firestore, 'users', user.uid, 'workers', id));
        toast({ title: "Trabajador eliminado" });
    };

    return (
        <>
            <PageHeader title="Gestión de Nómina">
                <div className="flex gap-2">
                    <AddWorkerDialog onAdded={() => setIsWorkerOpen(false)} isOpen={isWorkerOpen} setIsOpen={setIsWorkerOpen}>
                        <Button variant="outline"><Users className="mr-2 h-4 w-4" /> Mis Trabajadores</Button>
                    </AddWorkerDialog>
                    <AddPaymentDialog workers={workers || []} onAdded={() => setIsAddOpen(false)} isOpen={isAddOpen} setIsOpen={setIsAddOpen}>
                        <Button><PlusCircle className="mr-2 h-4 w-4" /> Registrar Pago</Button>
                    </AddPaymentDialog>
                </div>
            </PageHeader>
            <main className="flex-1 p-4 sm:p-6 space-y-6">
                <Tabs defaultValue="payments">
                    <TabsList>
                        <TabsTrigger value="payments">Historial de Pagos</TabsTrigger>
                        <TabsTrigger value="workers">Trabajadores Fijos</TabsTrigger>
                    </TabsList>

                    <TabsContent value="payments" className="space-y-6 mt-4">
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            <Card className="bg-primary/5 border-primary/20">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs uppercase font-bold text-muted-foreground flex items-center gap-2">
                                        <Wallet className="w-4 h-4" /> Resumen Acumulado
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3 pt-2">
                                    {workerSummaries.length === 0 ? (
                                        <p className="text-xs text-muted-foreground italic">No hay pagos registrados.</p>
                                    ) : workerSummaries.map(w => (
                                        <div key={w.name} className="flex justify-between items-center border-b pb-2 last:border-0">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold">{w.name}</span>
                                                <span className="text-[10px] text-muted-foreground">{w.count} pagos registrados</span>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-primary">${formatCurrency(w.usd)}</p>
                                                <p className="text-[10px] font-bold text-muted-foreground">Bs {formatCurrency(w.bs)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><History className="w-5 h-5"/> Registro Histórico</CardTitle>
                                <CardDescription>Historial de todos los pagos multimoneda realizados.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Fecha Registro</TableHead>
                                            <TableHead>Trabajador</TableHead>
                                            <TableHead>Periodo Pagado</TableHead>
                                            <TableHead className="text-right">Monto USD</TableHead>
                                            <TableHead className="text-right">Monto Bs</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow><TableCell colSpan={6} className="text-center py-10">Cargando registros...</TableCell></TableRow>
                                        ) : !payments || payments.length === 0 ? (
                                            <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No hay pagos registrados aún.</TableCell></TableRow>
                                        ) : payments.map((p) => (
                                            <TableRow key={p.id}>
                                                <TableCell className="text-xs font-medium">
                                                    {format(parseISO(p.createdAt), "dd/MM/yy hh:mm a")}
                                                </TableCell>
                                                <TableCell className="font-bold">{p.workerName}</TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                        <Calendar className="w-3 h-3" />
                                                        <span>{format(parseISO(p.dateFrom), "dd/MM/yy")}</span>
                                                        <span>al</span>
                                                        <span>{format(parseISO(p.dateTo), "dd/MM/yy")}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-primary">${formatCurrency(p.amountUSD)}</TableCell>
                                                <TableCell className="text-right font-medium">Bs {formatCurrency(p.amountBs)}</TableCell>
                                                <TableCell className="text-right">
                                                    <AdminAuthDialog onAuthorized={() => handleDelete(p.id!)}>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </AdminAuthDialog>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="workers" className="mt-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>Listado de Personal Fijo</CardTitle>
                                    <CardDescription>Gestiona los trabajadores que aparecen en el selector de pagos.</CardDescription>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nombre del Trabajador</TableHead>
                                            <TableHead>Teléfono</TableHead>
                                            <TableHead>Fecha Registro</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {workersLoading ? (
                                            <TableRow><TableCell colSpan={4} className="text-center py-10">Cargando trabajadores...</TableCell></TableRow>
                                        ) : !workers || workers.length === 0 ? (
                                            <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">No has añadido trabajadores fijos.</TableCell></TableRow>
                                        ) : workers.map((w) => (
                                            <TableRow key={w.id}>
                                                <TableCell className="font-bold">{w.name}</TableCell>
                                                <TableCell className="text-sm">{w.phone || 'N/A'}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{format(parseISO(w.createdAt), "dd/MM/yyyy")}</TableCell>
                                                <TableCell className="text-right">
                                                    <AdminAuthDialog onAuthorized={() => handleDeleteWorker(w.id!)}>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </AdminAuthDialog>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </main>
        </>
    );
}

function AddWorkerDialog({ children, onAdded, isOpen, setIsOpen }: { children: React.ReactNode, onAdded: () => void, isOpen: boolean, setIsOpen: (v: boolean) => void }) {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore || !user || !name.trim()) return;

        setLoading(true);
        try {
            const workersRef = collection(firestore, 'users', user.uid, 'workers');
            const newDoc = doc(workersRef);
            await setDocumentNonBlocking(newDoc, {
                id: newDoc.id,
                name: name.trim(),
                phone: phone.trim(),
                active: true,
                createdAt: new Date().toISOString()
            }, { merge: true });
            
            toast({ title: "Trabajador registrado" });
            setName(""); setPhone("");
            onAdded();
        } catch (e) {
            toast({ title: "Error al guardar", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Añadir Trabajador Fijo</DialogTitle>
                    <DialogDescription>Esto facilitará el registro de pagos al tener una lista predefinida.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Nombre Completo</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Carlos Rodriguez" required />
                    </div>
                    <div className="space-y-2">
                        <Label>Teléfono (Opcional)</Label>
                        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0414-..." />
                    </div>
                    <DialogFooter>
                        <Button type="submit" className="w-full" disabled={loading || !name.trim()}>
                            {loading ? "Guardando..." : "Registrar Trabajador"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function AddPaymentDialog({ children, onAdded, isOpen, setIsOpen, workers }: { children: React.ReactNode, onAdded: () => void, isOpen: boolean, setIsOpen: (v: boolean) => void, workers: Worker[] }) {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    
    const [selectedWorkerId, setSelectedWorkerId] = useState("");
    const [amountUSD, setAmountUSD] = useState("");
    const [amountBs, setAmountBs] = useState("");
    const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore || !user || loading || !selectedWorkerId) return;

        const worker = workers.find(w => w.id === selectedWorkerId);
        if (!worker) return;

        setLoading(true);
        try {
            const payrollRef = collection(firestore, 'users', user.uid, 'payroll_payments');
            const newDoc = doc(payrollRef);
            
            const data: PayrollPayment = {
                id: newDoc.id,
                workerId: worker.id,
                workerName: worker.name,
                amountUSD: parseFloat(amountUSD) || 0,
                amountBs: parseFloat(amountBs) || 0,
                dateFrom,
                dateTo,
                notes,
                createdAt: new Date().toISOString()
            };

            setDocumentNonBlocking(newDoc, data, { merge: true });
            toast({ title: "Pago registrado exitosamente" });
            setIsOpen(false);
            setAmountUSD(""); setAmountBs(""); setNotes(""); setSelectedWorkerId("");
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Registrar Pago a Trabajador</DialogTitle>
                    <DialogDescription>Selecciona al trabajador y los montos entregados.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2"><User className="w-3 h-3"/> Seleccionar Trabajador</Label>
                        <Select value={selectedWorkerId} onValueChange={setSelectedWorkerId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Busca en tu lista de personal..." />
                            </SelectTrigger>
                            <SelectContent>
                                {workers.length === 0 ? (
                                    <p className="p-4 text-xs text-center text-muted-foreground">Primero debes añadir trabajadores fijos.</p>
                                ) : workers.map(w => (
                                    <SelectItem key={w.id} value={w.id!}>{w.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-primary font-bold"><DollarSign className="w-3 h-3"/> Monto en USD</Label>
                            <Input type="number" step="0.01" value={amountUSD} onChange={(e) => setAmountUSD(e.target.value)} placeholder="0.00" />
                        </div>
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 font-bold"><Landmark className="w-3 h-3"/> Monto en Bs</Label>
                            <Input type="number" step="0.01" value={amountBs} onChange={(e) => setAmountBs(e.target.value)} placeholder="0.00" />
                        </div>
                    </div>

                    <div className="p-3 bg-muted/30 rounded-md space-y-3">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Periodo de tiempo que cubre este pago</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label className="text-[10px]">Desde</Label>
                                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} required />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px]">Hasta</Label>
                                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} required />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Notas adicionales</Label>
                        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional..." />
                    </div>

                    <DialogFooter>
                        <Button type="submit" className="w-full" disabled={loading || !selectedWorkerId}>
                            {loading ? "Procesando..." : "Confirmar y Guardar Registro"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
