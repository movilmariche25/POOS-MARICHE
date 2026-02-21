
"use client";

import { PageHeader } from "@/components/page-header";
import { useCollection, useFirebase, useMemoFirebase, setDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from "@/firebase";
import { collection, doc, query, orderBy, runTransaction } from "firebase/firestore";
import type { Fiado, Sale, Payment, Product, FiadoItem, RepairJob, PaymentMethod } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo, useEffect } from "react";
import { PlusCircle, HandCoins, DollarSign, Trash2, Search, PackageSearch, X, Plus, ShoppingCart, List, Clock, AlertTriangle, UserCheck, Calendar as CalendarIcon, Smartphone, CreditCard, Landmark, Banknote } from "lucide-react";
import { format, parseISO, differenceInDays, isBefore, isToday, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useCurrency } from "@/hooks/use-currency";
import { cn } from "@/lib/utils";
import { AdminAuthDialog } from "@/components/admin-auth-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";

const paymentMethodOptions: { value: PaymentMethod, label: string, icon: any, hasReference: boolean, isBs: boolean }[] = [
    { value: 'Efectivo USD', label: 'Efectivo USD', icon: DollarSign, hasReference: false, isBs: false },
    { value: 'Efectivo Bs', label: 'Efectivo Bs', icon: Landmark, hasReference: false, isBs: true },
    { value: 'Tarjeta', label: 'Tarjeta', icon: CreditCard, hasReference: true, isBs: true },
    { value: 'Pago Móvil', label: 'Pago Móvil', icon: Smartphone, hasReference: true, isBs: true },
    { value: 'Transferencia', label: 'Transferencia', icon: Banknote, hasReference: true, isBs: true },
];

const changeMethodOptions: { value: PaymentMethod, label: string, icon: any, isBs: boolean }[] = [
    { value: 'Efectivo USD', label: 'Vuelto en USD', icon: DollarSign, isBs: false },
    { value: 'Efectivo Bs', label: 'Vuelto en Bs', icon: Landmark, isBs: true },
    { value: 'Pago Móvil', label: 'Vuelto por P. Móvil', icon: Smartphone, isBs: true },
];

export default function FiadosPage() {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const { format: formatCurrency, getSymbol } = useCurrency();
    const [searchTerm, setSearchTerm] = useState("");
    const [isAddOpen, setIsAddOpen] = useState(false);

    const fiadosCollection = useMemoFirebase(() => 
        (firestore && user) ? query(collection(firestore, "users", user.uid, "fiados"), orderBy("createdAt", "desc")) : null,
        [firestore, user?.uid]
    );
    const { data: fiados, isLoading } = useCollection<Fiado>(fiadosCollection);

    const filteredFiados = useMemo(() => {
        if (!fiados) return [];
        const term = searchTerm.toLowerCase();
        return fiados.filter(f => 
            f.customerName.toLowerCase().includes(term) || 
            f.customerID.toLowerCase().includes(term) ||
            f.concept.toLowerCase().includes(term)
        );
    }, [fiados, searchTerm]);

    const activeDebt = useMemo(() => {
        if (!fiados) return 0;
        return fiados.filter(f => f.status === 'Pendiente').reduce((sum, f) => sum + (f.totalAmount - f.amountPaid), 0);
    }, [fiados]);

    const handleDeleteFiado = (id: string) => {
        if (!firestore || !user) return;
        deleteDocumentNonBlocking(doc(firestore, 'users', user.uid, 'fiados', id));
        toast({ title: "Registro eliminado", variant: "destructive" });
    };

    return (
        <>
            <PageHeader title="Control de Fiados / Créditos">
                <AddFiadoDialog onAdded={() => setIsAddOpen(false)} isOpen={isAddOpen} setIsOpen={setIsAddOpen} existingFiados={fiados || []}>
                    <Button><PlusCircle className="mr-2 h-4 w-4" /> Nuevo Fiado</Button>
                </AddFiadoDialog>
            </PageHeader>
            <main className="flex-1 p-4 sm:p-6 space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                    <Card className="bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs uppercase font-bold text-muted-foreground">Total en la Calle</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-black text-primary">{getSymbol()}{formatCurrency(activeDebt)}</div>
                            <p className="text-[10px] text-muted-foreground mt-1">Monto pendiente por cobrar.</p>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Cartera de Clientes</CardTitle>
                            <CardDescription>Gestión de deudas y abonos.</CardDescription>
                        </div>
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input 
                                placeholder="Buscar cliente o concepto..." 
                                className="pl-8" 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Antigüedad</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Artículos</TableHead>
                                    <TableHead className="text-right">Total ($)</TableHead>
                                    <TableHead className="text-right">Abonado ($)</TableHead>
                                    <TableHead className="text-right">Pendiente ($)</TableHead>
                                    <TableHead className="text-center">Estado / Alerta</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={8} className="text-center py-10">Cargando créditos...</TableCell></TableRow>
                                ) : filteredFiados.length === 0 ? (
                                    <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No hay registros que coincidan.</TableCell></TableRow>
                                ) : filteredFiados.map((fiado) => {
                                    const pending = fiado.totalAmount - fiado.amountPaid;
                                    const daysOld = differenceInDays(new Date(), parseISO(fiado.createdAt));
                                    
                                    const today = startOfDay(new Date());
                                    const isOverdue = fiado.dueDate && fiado.status === 'Pendiente' && 
                                        (isBefore(parseISO(fiado.dueDate), today) || isToday(parseISO(fiado.dueDate)));

                                    const dueDateParsed = fiado.dueDate ? parseISO(fiado.dueDate) : null;
                                    const daysDiff = dueDateParsed ? differenceInDays(dueDateParsed, today) : null;

                                    return (
                                        <TableRow key={fiado.id} className={cn(isOverdue && "bg-destructive/5")}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className={cn("text-xs font-bold", daysOld > 15 ? "text-destructive" : "text-muted-foreground")}>
                                                        {daysOld === 0 ? 'Hoy' : `Hace ${daysOld} días`}
                                                    </span>
                                                    <span className="text-[9px] text-muted-foreground">{format(parseISO(fiado.createdAt), "dd/MM/yy")}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-sm">{fiado.customerName}</span>
                                                    <span className="text-[10px] text-muted-foreground">{fiado.customerID}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="h-7 text-primary hover:bg-primary/10 gap-1.5 px-2">
                                                            <List className="h-3.5 w-3.5" />
                                                            <span className="text-[10px] font-bold">VER ({fiado.items?.length || 0})</span>
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-72 p-3">
                                                        <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2 border-b pb-1">Artículos en Deuda</p>
                                                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                                                            {fiado.items?.map((item, idx) => (
                                                                <div key={idx} className="flex justify-between text-xs items-start gap-4">
                                                                    <span className="font-medium text-slate-700">{item.quantity}x {item.productName}</span>
                                                                    <span className="font-bold text-slate-900 shrink-0">${(item.price * item.quantity).toFixed(2)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="mt-3 pt-2 border-t flex justify-between font-black text-sm">
                                                            <span>VALOR TOTAL:</span>
                                                            <span className="text-primary">${fiado.totalAmount.toFixed(2)}</span>
                                                        </div>
                                                    </PopoverContent>
                                                </Popover>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">${fiado.totalAmount.toFixed(2)}</TableCell>
                                            <TableCell className="text-right text-green-600 font-medium">${fiado.amountPaid.toFixed(2)}</TableCell>
                                            <TableCell className="text-right font-black text-primary">${pending.toFixed(2)}</TableCell>
                                            <TableCell className="text-center">
                                                <div className="flex flex-col items-center gap-1">
                                                    <Badge variant={fiado.status === 'Pagado' ? 'secondary' : 'destructive'} className={cn(fiado.status === 'Pagado' && "bg-green-100 text-green-700")}>
                                                        {fiado.status.toUpperCase()}
                                                    </Badge>
                                                    
                                                    {fiado.status === 'Pendiente' && fiado.dueDate && (
                                                        <div className="flex flex-col items-center gap-0.5 mt-1">
                                                            {isOverdue ? (
                                                                <>
                                                                    <div className="flex items-center gap-1 text-[9px] font-black text-destructive animate-pulse uppercase">
                                                                        <AlertTriangle className="w-2.5 h-2.5" /> VENCIDO
                                                                    </div>
                                                                    <span className="text-[9px] font-bold text-destructive">
                                                                        {isToday(dueDateParsed!) ? "Vence Hoy" : `Atrasado ${Math.abs(daysDiff!)} días`}
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                <span className="text-[9px] font-bold text-amber-600">
                                                                    Faltan {daysDiff} días
                                                                </span>
                                                            )}
                                                            <span className="text-[8px] text-muted-foreground font-medium">Límite: {format(parseISO(fiado.dueDate), "dd/MM/yy")}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1.5">
                                                    {fiado.status === 'Pendiente' && (
                                                        <>
                                                            <SetDeadlineDialog fiado={fiado}>
                                                                <Button size="sm" variant="outline" className={cn("h-8 px-2", fiado.dueDate ? "text-amber-600 border-amber-200" : "text-muted-foreground")} title="Establecer alerta de pago">
                                                                    <Clock className="w-4 h-4" />
                                                                </Button>
                                                            </SetDeadlineDialog>
                                                            <AddItemsToFiadoDialog fiado={fiado}>
                                                                <Button size="sm" variant="outline" className="h-8 px-2" title="Añadir más productos a esta cuenta">
                                                                    <ShoppingCart className="w-4 h-4" />
                                                                </Button>
                                                            </AddItemsToFiadoDialog>
                                                            <CobrarFiadoDialog fiado={fiado}>
                                                                <Button size="sm" variant="outline" className="h-8 text-green-600 border-green-200 hover:bg-green-50">
                                                                    <DollarSign className="w-3.5 h-3.5 mr-1" /> Abonar
                                                                </Button>
                                                            </CobrarFiadoDialog>
                                                        </>
                                                    )}
                                                    <AdminAuthDialog onAuthorized={() => handleDeleteFiado(fiado.id!)}>
                                                        <Button size="sm" variant="ghost" className="h-8 text-destructive">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </AdminAuthDialog>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </main>
        </>
    );
}

function SetDeadlineDialog({ fiado, children }: { fiado: Fiado, children: React.ReactNode }) {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [date, setDate] = useState(fiado.dueDate || "");

    const handleSave = () => {
        if (!firestore || !user || !fiado.id) return;
        updateDocumentNonBlocking(doc(firestore, 'users', user.uid, 'fiados', fiado.id), {
            dueDate: date || null
        });
        toast({ title: "Fecha de pago guardada" });
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Establecer Fecha Límite de Pago</DialogTitle>
                    <DialogDescription>El sistema te alertará visualmente cuando llegue esta fecha.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <Label>Fecha de Pago Acordada</Label>
                        <div className="relative">
                            <CalendarIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input 
                                type="date" 
                                className="pl-10" 
                                value={date} 
                                onChange={(e) => setDate(e.target.value)} 
                            />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button onClick={handleSave}>Guardar Alerta</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function AddFiadoDialog({ children, onAdded, isOpen, setIsOpen, existingFiados }: { children: React.ReactNode, onAdded: () => void, isOpen: boolean, setIsOpen: (v: boolean) => void, existingFiados: Fiado[] }) {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const { getFinalPrice } = useCurrency();
    const [loading, setLoading] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    
    const [customerID, setCustomerID] = useState("");
    const [customerName, setCustomerName] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");
    const [concept, setConcept] = useState("");
    const [totalAmount, setTotalAmount] = useState("");
    const [selectedItems, setSelectedItems] = useState<FiadoItem[]>([]);

    const productsCollection = useMemoFirebase(() => 
        (firestore && user) ? collection(firestore, 'users', user.uid, 'products') : null, 
        [firestore, user?.uid]
    );
    const { data: products } = useCollection<Product>(productsCollection);

    const repairJobsCollection = useMemoFirebase(() => 
        (firestore && user) ? collection(firestore, 'users', user.uid, 'repair_jobs') : null, 
        [firestore, user?.uid]
    );
    const { data: repairJobs } = useCollection<RepairJob>(repairJobsCollection);

    const hasPendingFiado = useMemo(() => {
        if (!customerID) return null;
        return existingFiados.find(f => f.customerID === customerID && f.status === 'Pendiente');
    }, [customerID, existingFiados]);

    const foundCustomer = useMemo(() => {
        if (!customerID || customerID.length < 5) return null;
        
        const fiadoMatch = existingFiados.find(f => f.customerID.toLowerCase() === customerID.toLowerCase());
        if (fiadoMatch) return { name: fiadoMatch.customerName, phone: fiadoMatch.customerPhone };
        
        const repairMatch = repairJobs?.find(r => r.customerID?.toLowerCase() === customerID.toLowerCase());
        if (repairMatch) return { name: repairMatch.customerName, phone: repairMatch.customerPhone };
        
        return null;
    }, [customerID, existingFiados, repairJobs]);

    const handleApplyCustomerData = () => {
        if (foundCustomer) {
            setCustomerName(foundCustomer.name);
            setCustomerPhone(foundCustomer.phone);
            toast({ title: "Datos cargados", description: `Se han aplicado los datos de ${foundCustomer.name}` });
        }
    };

    useEffect(() => {
        if (selectedItems.length > 0) {
            const total = selectedItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
            const desc = selectedItems.map(i => `${i.quantity}x ${i.productName}`).join(", ");
            setTotalAmount(total.toFixed(2));
            setConcept(desc);
        }
    }, [selectedItems]);

    const handleAddItem = (p: Product) => {
        const price = getFinalPrice(p);
        setSelectedItems(prev => {
            const existing = prev.find(i => i.productId === p.id);
            if (existing) {
                return prev.map(i => i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i);
            }
            return [...prev, { productId: p.id!, productName: p.name, quantity: 1, price }];
        });
        setSearchOpen(false);
    };

    const handleRemoveItem = (id: string) => {
        setSelectedItems(prev => prev.filter(i => i.productId !== id));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firestore || !user || loading) return;

        setLoading(true);
        try {
            await runTransaction(firestore, async (transaction) => {
                const fiadosRef = collection(firestore, 'users', user.uid, 'fiados');
                const newDoc = doc(fiadosRef);
                
                // LECTURAS PRIMERO
                const productSnaps = new Map();
                for(const item of selectedItems) {
                    if (!productSnaps.has(item.productId)) {
                        const snap = await transaction.get(doc(firestore, 'users', user.uid, 'products', item.productId));
                        productSnaps.set(item.productId, snap);
                    }
                }

                // ESCRITURAS DESPUÉS
                for (const item of selectedItems) {
                    const pDoc = productSnaps.get(item.productId);
                    if (pDoc?.exists()) {
                        const currentStock = pDoc.data().stockLevel || 0;
                        if (currentStock < item.quantity) {
                            throw new Error(`Stock insuficiente para ${item.productName}`);
                        }
                        transaction.update(pDoc.ref, { stockLevel: currentStock - item.quantity });
                    }
                }

                const data: Fiado = {
                    id: newDoc.id,
                    customerID,
                    customerName,
                    customerPhone,
                    concept,
                    totalAmount: parseFloat(totalAmount) || 0,
                    amountPaid: 0,
                    status: 'Pendiente',
                    createdAt: new Date().toISOString(),
                    items: selectedItems
                };
                transaction.set(newDoc, data);
            });

            toast({ title: "Fiado registrado" });
            setIsOpen(false);
            setCustomerID(""); setCustomerName(""); setCustomerPhone(""); setConcept(""); setTotalAmount(""); setSelectedItems([]);
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Registrar Nuevo Crédito</DialogTitle>
                    <DialogDescription>Los productos seleccionados se restarán del inventario inmediatamente.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Cédula / RIF</Label>
                            <Input value={customerID} onChange={(e) => setCustomerID(e.target.value)} placeholder="V-12345678" required />
                        </div>
                        <div className="space-y-2">
                            <Label>Nombre y Apellido</Label>
                            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Juan Perez" required />
                        </div>
                    </div>

                    {foundCustomer && (customerName !== foundCustomer.name) && (
                        <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-[10px] text-blue-600 bg-blue-50 hover:bg-blue-100 flex items-center gap-1 font-bold w-full"
                            onClick={handleApplyCustomerData}
                        >
                            <UserCheck className="w-3.5 h-3.5" />
                            ¿CARGAR DATOS DE {foundCustomer.name.toUpperCase()}?
                        </Button>
                    )}

                    {hasPendingFiado && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md flex items-center gap-2">
                            <HandCoins className="w-4 h-4 text-amber-600 shrink-0" />
                            <p className="text-xs text-amber-800 font-bold">
                                ESTE CLIENTE TIENE UNA CUENTA PENDIENTE. 
                                <span className="block font-normal">Puedes añadir productos directamente a su cuenta actual desde la lista principal.</span>
                            </p>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Añadir Productos del Inventario</Label>
                        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full justify-start text-muted-foreground">
                                    <PackageSearch className="mr-2 h-4 w-4" /> Buscar producto...
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0 w-[400px]" align="start">
                                <Command>
                                    <CommandInput placeholder="Nombre o SKU..." />
                                    <CommandList>
                                        <CommandEmpty>Sin resultados.</CommandEmpty>
                                        <CommandGroup>
                                            {(products || []).filter(p => !p.isCombo && p.stockLevel > 0).map(p => (
                                                <CommandItem key={p.id} onSelect={() => handleAddItem(p)} className="flex justify-between items-center">
                                                    <span>{p.name}</span>
                                                    <Badge variant="secondary">{p.stockLevel} disp.</Badge>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {selectedItems.length > 0 && (
                        <div className="border rounded-md p-2 space-y-2 bg-muted/30">
                            {selectedItems.map(item => (
                                <div key={item.productId} className="flex items-center justify-between text-xs bg-white p-2 rounded shadow-sm">
                                    <span className="font-medium flex-1">{item.productName} (x{item.quantity})</span>
                                    <span className="font-bold mr-4">${(item.price * item.quantity).toFixed(2)}</span>
                                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleRemoveItem(item.productId)}>
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Concepto (Descripción final)</Label>
                        <Input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Ej: Pantalla Samsung A51" required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Teléfono</Label>
                            <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="0414-..." required />
                        </div>
                        <div className="space-y-2">
                            <Label>Monto Total ($)</Label>
                            <Input type="number" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0.00" required />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" className="w-full" disabled={loading || selectedItems.length === 0}>
                            {loading ? "Procesando..." : "Crear Fiado y Descontar Stock"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function AddItemsToFiadoDialog({ fiado, children }: { fiado: Fiado, children: React.ReactNode }) {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const { getFinalPrice } = useCurrency();
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [selectedItems, setSelectedItems] = useState<FiadoItem[]>([]);

    const productsCollection = useMemoFirebase(() => 
        (firestore && user) ? collection(firestore, 'users', user.uid, 'products') : null, 
        [firestore, user?.uid]
    );
    const { data: products } = useCollection<Product>(productsCollection);

    const handleAddItem = (p: Product) => {
        const price = getFinalPrice(p);
        setSelectedItems(prev => {
            const existing = prev.find(i => i.productId === p.id);
            if (existing) {
                return prev.map(i => i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i);
            }
            return [...prev, { productId: p.id!, productName: p.name, quantity: 1, price }];
        });
        setSearchOpen(false);
    };

    const handleRemoveItem = (id: string) => {
        setSelectedItems(prev => prev.filter(i => i.productId !== id));
    };

    const handleUpdate = async () => {
        if (!firestore || !user || loading || selectedItems.length === 0) return;

        setLoading(true);
        try {
            await runTransaction(firestore, async (transaction) => {
                const fiadoRef = doc(firestore, 'users', user.uid, 'fiados', fiado.id!);
                
                // LECTURAS PRIMERO
                const fiadoSnap = await transaction.get(fiadoRef);
                if (!fiadoSnap.exists()) throw new Error("El fiado no existe.");
                const currentData = fiadoSnap.data() as Fiado;

                const productSnaps = new Map();
                for (const item of selectedItems) {
                    if (!productSnaps.has(item.productId)) {
                        const snap = await transaction.get(doc(firestore, 'users', user.uid, 'products', item.productId));
                        productSnaps.set(item.productId, snap);
                    }
                }

                // ESCRITURAS DESPUÉS
                for (const item of selectedItems) {
                    const pDoc = productSnaps.get(item.productId);
                    if (pDoc?.exists()) {
                        const currentStock = pDoc.data().stockLevel || 0;
                        if (currentStock < item.quantity) {
                            throw new Error(`Stock insuficiente para ${item.productName}`);
                        }
                        transaction.update(pDoc.ref, { stockLevel: currentStock - item.quantity });
                    }
                }

                const addedTotal = selectedItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
                const newTotal = currentData.totalAmount + addedTotal;
                const newItems = [...(currentData.items || []), ...selectedItems];
                const newConcept = currentData.concept + ", " + selectedItems.map(i => `${i.quantity}x ${i.productName}`).join(", ");

                transaction.update(fiadoRef, {
                    totalAmount: newTotal,
                    items: newItems,
                    concept: newConcept
                });
            });

            toast({ title: "Cuenta actualizada" });
            setOpen(false);
            setSelectedItems([]);
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Añadir a la cuenta de {fiado.customerName}</DialogTitle>
                    <DialogDescription>Los productos se sumarán a la deuda actual y se descontarán del inventario.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-muted-foreground">
                                <PackageSearch className="mr-2 h-4 w-4" /> Buscar producto para añadir...
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-[400px]" align="start">
                            <Command>
                                <CommandInput placeholder="Nombre o SKU..." />
                                <CommandList>
                                    <CommandEmpty>Sin resultados.</CommandEmpty>
                                    <CommandGroup>
                                        {(products || []).filter(p => !p.isCombo && p.stockLevel > 0).map(p => (
                                            <CommandItem key={p.id} onSelect={() => handleAddItem(p)} className="flex justify-between items-center">
                                                <span>{p.name}</span>
                                                <Badge variant="secondary">{p.stockLevel} disp.</Badge>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>

                    {selectedItems.length > 0 && (
                        <div className="border rounded-md p-2 space-y-2 bg-muted/30">
                            {selectedItems.map(item => (
                                <div key={item.productId} className="flex items-center justify-between text-xs bg-white p-2 rounded shadow-sm">
                                    <span className="font-medium flex-1">{item.productName} (x{item.quantity})</span>
                                    <span className="font-bold mr-4">${(item.price * item.quantity).toFixed(2)}</span>
                                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleRemoveItem(item.productId)}>
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button onClick={handleUpdate} className="w-full" disabled={loading || selectedItems.length === 0}>
                        {loading ? "Actualizando..." : "Confirmar y Añadir a Deuda"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function CobrarFiadoDialog({ fiado, children }: { fiado: Fiado, children: React.ReactNode }) {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const { format: formatCurrency, getSymbol, bcvRate, convert } = useCurrency();
    const [open, setOpen] = useState(false);
    const [payments, setPayments] = useState<(Payment & { id: number })[]>([]);
    const [changePayments, setChangePayments] = useState<(Payment & { id: number })[]>([]);
    const [isGivingChange, setIsGivingChange] = useState(false);

    const pending = fiado.totalAmount - fiado.amountPaid;

    const totalAbonoInUSD = useMemo(() => {
        return payments.reduce((acc, p) => {
            return acc + (p.method === 'Efectivo USD' ? p.amount : convert(p.amount, 'Bs', 'USD'));
        }, 0);
    }, [payments, convert]);

    const potentialChangeInUSD = useMemo(() => (totalAbonoInUSD > pending ? totalAbonoInUSD - pending : 0), [totalAbonoInUSD, pending]);
    const requiredChangeInUSD = isGivingChange ? potentialChangeInUSD : 0;

    const totalChangeGivenInUSD = useMemo(() => {
        return changePayments.reduce((acc, p) => {
            return acc + (p.method === 'Efectivo USD' ? p.amount : convert(p.amount, 'Bs', 'USD'));
        }, 0);
    }, [changePayments, convert]);

    const changeDifference = requiredChangeInUSD - totalChangeGivenInUSD;
    const remainingInUSD = Math.max(0, pending - (totalAbonoInUSD - totalChangeGivenInUSD));

    useEffect(() => {
        if (potentialChangeInUSD <= 0.001) {
            setIsGivingChange(false);
            setChangePayments([]);
        }
    }, [potentialChangeInUSD]);

    const handleAddPayment = (method: PaymentMethod) => {
        setPayments(prev => [...prev, { id: Date.now(), method, amount: 0, reference: '' }]);
    };

    const handleUpdatePayment = (id: number, field: 'amount' | 'reference', value: string | number) => {
        setPayments(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const handleRemovePayment = (id: number) => {
        setPayments(prev => prev.filter(p => p.id !== id));
    };

    const handleAddChangePayment = (method: PaymentMethod) => {
        setChangePayments(prev => [...prev, { id: Date.now(), method, amount: 0, reference: '' }]);
    };

    const handleUpdateChangePayment = (id: number, field: 'amount' | 'reference', value: string | number) => {
        setChangePayments(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const handleRemoveChangePayment = (id: number) => {
        setChangePayments(prev => prev.filter(p => p.id !== id));
    };

    const handleAbono = async () => {
        if (!firestore || !user || payments.length === 0) return;
        
        const finalNetAbonoInUSD = totalAbonoInUSD - totalChangeGivenInUSD;
        
        if (finalNetAbonoInUSD <= 0) {
            toast({ title: "Monto inválido", description: "El abono neto debe ser mayor a 0.", variant: "destructive" });
            return;
        }

        const saleId = `S-FIA-${Date.now()}`;
        const saleRef = doc(firestore, 'users', user.uid, 'sale_transactions', saleId);
        const fiadoRef = doc(firestore, 'users', user.uid, 'fiados', fiado.id!);

        const newPaid = fiado.amountPaid + finalNetAbonoInUSD;
        const isFullyPaid = newPaid >= (fiado.totalAmount - 0.01);

        const saleData: Sale = {
            id: saleId,
            fiadoId: fiado.id,
            items: [{ productId: fiado.id!, name: `Abono Fiado: ${fiado.customerName}`, quantity: 1, price: finalNetAbonoInUSD }],
            totalAmount: finalNetAbonoInUSD,
            subtotal: finalNetAbonoInUSD,
            discount: 0,
            paymentMethod: payments.map(p => p.method).join(', '),
            transactionDate: new Date().toISOString(),
            status: 'completed',
            payments: payments.map(({id, ...rest}) => rest),
            actualPaidAmount: finalNetAbonoInUSD,
            changeGiven: isGivingChange ? changePayments.map(({id, ...rest}) => rest) : [],
            totalChangeInUSD: isGivingChange ? totalChangeGivenInUSD : 0
        };

        try {
            await runTransaction(firestore, async (transaction) => {
                transaction.set(saleRef, saleData);
                transaction.update(fiadoRef, {
                    amountPaid: Number(newPaid.toFixed(2)),
                    status: isFullyPaid ? 'Pagado' : 'Pendiente'
                });
            });
            
            toast({ title: isFullyPaid ? "Deuda Liquidada" : "Abono Registrado" });
            setOpen(false);
            setPayments([]);
            setChangePayments([]);
            setIsGivingChange(false);
        } catch (e) {
            toast({ title: "Error al procesar pago", variant: "destructive" });
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Registrar Pago: {fiado.customerName}</DialogTitle>
                    <DialogDescription>
                        Deuda actual: <span className="font-bold text-primary">${pending.toFixed(2)}</span>
                        <span className="block text-xs text-muted-foreground mt-1">Equivalente en Bolívares: <strong>Bs {formatCurrency(pending * bcvRate)}</strong></span>
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-muted-foreground">Añadir Métodos de Pago</Label>
                        <div className="flex flex-wrap gap-2">
                            {paymentMethodOptions.map(option => (
                                <Button 
                                    key={option.value} 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-8 text-[10px]"
                                    onClick={() => handleAddPayment(option.value)}
                                >
                                    <option.icon className="w-3 h-3 mr-1" /> {option.label}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {payments.length > 0 && (
                        <div className="max-h-[250px] border rounded-md p-2 bg-muted/20 space-y-3 overflow-y-auto">
                            {payments.map(p => {
                                const option = paymentMethodOptions.find(o => o.value === p.method)!;
                                const symbol = option.isBs ? 'Bs' : '$';
                                return (
                                    <div key={p.id} className="bg-white p-3 rounded-lg border shadow-sm space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold flex items-center gap-1.5">
                                                <option.icon className="w-3.5 h-3.5" /> {p.method}
                                            </span>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleRemovePayment(p.id)}>
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="relative">
                                                <span className="absolute left-2.5 top-2.5 text-muted-foreground text-xs">{symbol}</span>
                                                <Input 
                                                    type="number" 
                                                    placeholder="0.00" 
                                                    className="h-9 pl-7 text-xs" 
                                                    value={p.amount || ''}
                                                    onChange={(e) => handleUpdatePayment(p.id, 'amount', parseFloat(e.target.value) || 0)}
                                                />
                                            </div>
                                            {option.hasReference && (
                                                <Input 
                                                    placeholder="Ref." 
                                                    className="h-9 text-xs"
                                                    value={p.reference}
                                                    onChange={(e) => handleUpdatePayment(p.id, 'reference', e.target.value)}
                                                />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {potentialChangeInUSD > 0.001 && (
                        <div className="space-y-4 pt-4 border-t">
                            <div className="flex items-center space-x-2">
                                <Checkbox 
                                    id="give-change-fiados" 
                                    checked={isGivingChange} 
                                    onCheckedChange={(checked) => setIsGivingChange(!!checked)} 
                                />
                                <Label htmlFor="give-change-fiados" className="cursor-pointer font-medium text-sm">Registrar Vuelto Entregado</Label>
                            </div>

                            {isGivingChange && (
                                <div className="space-y-3">
                                    <div className="text-center p-2 rounded-lg bg-primary/10">
                                        <p className="text-[10px] text-primary font-bold uppercase">Vuelto Total Requerido</p>
                                        <p className="text-xl font-black text-primary">${potentialChangeInUSD.toFixed(2)}</p>
                                        <p className="text-[10px] text-primary/80 font-bold">o Bs {formatCurrency(potentialChangeInUSD * bcvRate)}</p>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {changeMethodOptions.map(method => (
                                            <Button 
                                                key={method.value} 
                                                variant="outline" 
                                                size="sm" 
                                                className="h-7 text-[9px]"
                                                onClick={() => handleAddChangePayment(method.value)}
                                            >
                                                <method.icon className="w-3 h-3 mr-1" /> {method.label}
                                            </Button>
                                        ))}
                                    </div>

                                    {changePayments.map(p => {
                                        const option = changeMethodOptions.find(o => o.value === p.method)!;
                                        const symbol = option.isBs ? 'Bs' : '$';
                                        return (
                                            <div key={p.id} className="bg-white p-2 rounded-lg border flex gap-2 items-center">
                                                <span className="text-[10px] font-bold shrink-0 w-24 truncate">{p.method}</span>
                                                <div className="relative flex-1">
                                                    <span className="absolute left-2 top-2 text-muted-foreground text-[10px]">{symbol}</span>
                                                    <Input 
                                                        type="number" 
                                                        className="h-8 pl-6 text-xs" 
                                                        value={p.amount || ''}
                                                        onChange={(e) => handleUpdateChangePayment(p.id, 'amount', parseFloat(e.target.value) || 0)}
                                                    />
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemoveChangePayment(p.id)}>
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        );
                                    })}

                                    <div className={cn(
                                        "text-center font-bold text-[10px] p-2 rounded-md",
                                        Math.abs(changeDifference) > 0.01 ? "bg-destructive/10 text-destructive" : "bg-green-600/10 text-green-700"
                                    )}>
                                        {Math.abs(changeDifference) > 0.01 
                                            ? `Falta por devolver: $${Math.abs(changeDifference).toFixed(2)} o Bs ${formatCurrency(Math.abs(changeDifference) * bcvRate)}`
                                            : "Vuelto Correcto"}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Total Recibido:</span>
                            <span className="font-black text-primary">${totalAbonoInUSD.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-start text-[10px] mt-1">
                            <span className="text-muted-foreground">Nuevo Saldo Pendiente:</span>
                            <div className="flex flex-col items-end">
                                <span className={cn("font-bold text-sm", remainingInUSD < 0 ? "text-destructive" : "text-slate-600")}>
                                    ${remainingInUSD.toFixed(2)}
                                </span>
                                <span className="text-muted-foreground font-medium">
                                    Bs {formatCurrency(remainingInUSD * bcvRate)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleAbono} className="w-full" disabled={payments.length === 0 || totalAbonoInUSD <= 0 || (isGivingChange && Math.abs(changeDifference) > 0.01)}>
                        Confirmar Cobro de Abono
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
