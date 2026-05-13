"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type { RepairJob, RepairStatus, Product, UserProfile, ReservedPart } from "@/lib/types";
import { useState, useEffect, ReactNode, useMemo, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "../ui/textarea";
import { useCurrency } from "@/hooks/use-currency";
import { Label } from "../ui/label";
import { useFirebase, useCollection, useMemoFirebase, useDoc } from "@/firebase";
import { doc, runTransaction, query, orderBy, collection, type DocumentSnapshot } from "firebase/firestore";
import { handlePrintAllTickets } from "./repair-ticket";
import { CheckCircle2, User, Smartphone, Package, Search, Plus, Trash2, Loader2, Tag, Info, TicketPercent, AlertTriangle, ShieldCheck, History, Minus, Barcode } from "lucide-react";
import { format, parseISO, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { cn } from "@/lib/utils";
import { Badge } from "../ui/badge";
import { ProductFormDialog } from "../inventory/product-form-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

const DRAFT_KEY = 'mm_repair_draft';

const formSchema = z.object({
  customerName: z.string().min(2, "Nombre obligatorio"),
  customerPhone: z.string().min(10, "Teléfono inválido"),
  customerID: z.string().min(5, "Cédula requerida"),
  customerAddress: z.string().default(""),
  deviceMake: z.string().min(2, "Marca obligatoria"),
  deviceModel: z.string().min(1, "Modelo obligatorio"),
  reportedIssue: z.string().min(5, "Detalla la falla del equipo"),
  status: z.enum(['Pendiente', 'Pagado', 'Completado', 'Garantía']),
  notes: z.string().default(""),
  reservedParts: z.array(z.any()).default([]),
  isPromo: z.boolean().default(false),
  isMinimized: z.boolean().default(false),
});

export function RepairFormDialog({ repairJob, children, isOpen, onOpenChange }: { repairJob?: RepairJob | null, children?: ReactNode, isOpen?: boolean, onOpenChange?: (v: boolean) => void }) {
  const { firestore, user } = useFirebase();
  const [internalOpen, setInternalOpen] = useState(false);
  const [partsPopoverOpen, setPartsPopoverOpen] = useState(false);
  const [replenishProduct, setReplenishProduct] = useState<Product | null>(null);
  const [manualAddOpen, setManualAddOpen] = useState(false);
  
  const open = isOpen !== undefined ? isOpen : internalOpen;
  const setOpen = onOpenChange !== undefined ? onOpenChange : setInternalOpen;

  const { toast } = useToast();
  const { getFinalPrice, getDynamicPrice, format: formatCurrency, bcvRate, parallelRate, profitMargin } = useCurrency();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const isInitialized = useRef(false);
  const isClosingViaMinimize = useRef(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerName: "",
      customerPhone: "",
      customerID: "",
      customerAddress: "",
      deviceMake: "",
      deviceModel: "",
      reportedIssue: "",
      status: "Pendiente", 
      reservedParts: [],
      isPromo: false,
      notes: "",
      isMinimized: false,
    },
  });

  const profileRef = useMemoFirebase(() => 
    (firestore && user) ? doc(firestore, 'users', user.uid) : null,
    [firestore, user?.uid]
  );
  const { data: profile } = useDoc<UserProfile>(profileRef);

  const productsCollection = useMemoFirebase(() => 
    (firestore && user) ? collection(firestore, 'users', user.uid, 'products') : null, 
    [firestore, user?.uid]
  );
  const { data: products } = useCollection<Product>(productsCollection);

  const repairsCollection = useMemoFirebase(() => 
    (firestore && user) ? query(collection(firestore, "users", user.uid, "repair_jobs"), orderBy('createdAt', 'desc')) : null,
    [firestore, user?.uid]
  );
  const { data: allRepairs } = useCollection<RepairJob>(repairsCollection);

  const currentID = form.watch("customerID");
  const reservedParts = form.watch("reservedParts") as (ReservedPart & { isPromo?: boolean, isWarranty?: boolean, isManual?: boolean })[];
  
  // DETECCIÓN AUTOMÁTICA DE PROMOCIÓN
  const effectiveIsPromo = useMemo(() => {
    const parts = [...reservedParts, ...(repairJob?.consumedParts || [])];
    return parts.some(p => p.isPromo && !p.isWarranty);
  }, [reservedParts, repairJob?.consumedParts]);

  // Sincronizar el flag isPromo del formulario con la detección automática
  useEffect(() => {
    if (isInitialized.current) {
        form.setValue("isPromo", effectiveIsPromo);
    }
  }, [effectiveIsPromo, form]);

  // Efecto de Autoguardado para Borrador
  useEffect(() => {
    if (!repairJob && open) {
        const subscription = form.watch((value) => {
            if (isInitialized.current && !isClosingViaMinimize.current) {
                localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...value, isMinimized: false }));
            }
        });
        return () => subscription.unsubscribe();
    }
  }, [form, repairJob, open]);

  const partsTotalForClient = useMemo(() => {
    const allRelevantParts = [...(repairJob?.consumedParts || []), ...reservedParts];
    return allRelevantParts.reduce((sum, part) => {
        if (part.isWarranty) return sum;

        let price = 0;
        if (part.isManual) {
            price = getDynamicPrice(part.costPrice);
        } else {
            const product = products?.find(p => p.id === part.productId);
            if (product) {
                price = part.isPromo && product.promoPrice && product.promoPrice > 0 
                    ? product.promoPrice 
                    : getFinalPrice(product);
            } else {
                price = getDynamicPrice(part.costPrice);
            }
        }
        return sum + (price * part.quantity);
    }, 0);
  }, [reservedParts, repairJob?.consumedParts, products, getFinalPrice, getDynamicPrice]);

  const estimatedTotal = partsTotalForClient;

  const foundCustomer = useMemo(() => {
    if (!currentID || currentID.length < 5 || !allRepairs) return null;
    return allRepairs.find(r => r.customerID?.toUpperCase() === currentID.toUpperCase());
  }, [currentID, allRepairs]);

  const handleApplyCustomerData = () => {
    if (foundCustomer) {
        form.setValue("customerName", foundCustomer.customerName.toUpperCase(), { shouldValidate: true });
        form.setValue("customerPhone", foundCustomer.customerPhone, { shouldValidate: true });
        form.setValue("customerAddress", (foundCustomer.customerAddress || "").toUpperCase(), { shouldValidate: true });
        toast({ title: "Datos cargados" });
    }
  };

  // Carga inicial de datos
  useEffect(() => {
    if (!open) {
        isInitialized.current = false;
        isClosingViaMinimize.current = false;
        return;
    }

    if (open && !isInitialized.current) {
        if (repairJob) {
            form.reset({ 
                ...repairJob,
                customerName: repairJob.customerName.toUpperCase(),
                customerID: (repairJob.customerID || "").toUpperCase(),
                customerAddress: (repairJob.customerAddress || "").toUpperCase(),
                deviceMake: repairJob.deviceMake.toUpperCase(),
                deviceModel: repairJob.deviceModel.toUpperCase(),
                reportedIssue: repairJob.reportedIssue.toUpperCase(),
                notes: (repairJob.notes || "").toUpperCase(),
                reservedParts: repairJob.reservedParts || [],
                status: repairJob.status as any,
                isMinimized: false,
                isPromo: repairJob.isPromo || false
            });
        } else {
            const savedDraft = localStorage.getItem(DRAFT_KEY);
            if (savedDraft) {
                try {
                    const draftData = JSON.parse(savedDraft);
                    form.reset({ ...draftData, isMinimized: false });
                } catch (e) {
                    localStorage.removeItem(DRAFT_KEY);
                }
            } else {
                form.reset({ 
                    customerName: "", customerPhone: "", customerID: "", customerAddress: "",
                    deviceMake: "", deviceModel: "", reportedIssue: "",
                    status: "Pendiente", reservedParts: [],
                    isPromo: false, notes: "", isMinimized: false,
                });
            }
        }
        isInitialized.current = true;
    }
  }, [repairJob, open, form]);

  const handleAddPart = (p: Product) => {
      const originalPart = repairJob?.reservedParts?.find(rp => rp.productId === p.id);
      const originalQty = originalPart ? originalPart.quantity : 0;
      const dbAvailable = (p.stockLevel || 0) - (p.reservedStock || 0) - (p.damagedStock || 0);
      const realAvailableForThisJob = dbAvailable + originalQty;

      const existingInForm = reservedParts.find(item => item.productId === p.id);
      const qtyInForm = existingInForm ? existingInForm.quantity : 0;
      
      if (realAvailableForThisJob < qtyInForm + 1) {
          setReplenishProduct(p);
          setPartsPopoverOpen(false);
          return;
      }

      if (existingInForm) {
          form.setValue('reservedParts', reservedParts.map(item => 
              item.productId === p.id ? { ...item, quantity: item.quantity + 1 } : item
          ));
      } else {
          const newPart: ReservedPart = {
              productId: p.id!,
              productName: p.name.toUpperCase(),
              quantity: 1,
              costPrice: p.costPrice,
              isPromo: !!(p.promoPrice && p.promoPrice > 0), // Detección automática al añadir
              isWarranty: false
          };
          form.setValue('reservedParts', [...reservedParts, newPart]);
      }
      setPartsPopoverOpen(false);
  };

  const handleRemovePart = (productId: string) => {
      form.setValue('reservedParts', reservedParts.filter(p => p.productId !== productId));
  };

  const handleTogglePromo = (productId: string) => {
      form.setValue('reservedParts', reservedParts.map(p => 
          p.productId === productId ? { ...p, isPromo: !p.isPromo } : p
      ));
  };

  const handleToggleWarranty = (productId: string) => {
      form.setValue('reservedParts', reservedParts.map(p => 
          p.productId === productId ? { ...p, isWarranty: !p.isWarranty } : p
      ));
  };

  const handleMinimize = () => {
      isClosingViaMinimize.current = true;
      isInitialized.current = false;
      const currentValues = form.getValues();
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...currentValues, isMinimized: true }));
      setOpen(false);
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!firestore || !user || isSubmitting) return;

    setIsSubmitting(true);
    try {
        const result = await runTransaction(firestore, async (transaction) => {
            const jobId = repairJob?.id || `R-${format(new Date(), "yyMMdd")}-${Math.floor(1000 + Math.random() * 9000)}`;
            const jobRef = doc(firestore, 'users', user.uid, 'repair_jobs', jobId);

            const oldParts = (repairJob?.reservedParts || []).filter(p => !p.isManual);
            const newParts = values.reservedParts.filter(p => !p.isManual);
            const netChanges = new Map<string, { delta: number, name: string }>();

            for (const old of oldParts) {
                const current = netChanges.get(old.productId) || { delta: 0, name: old.productName };
                netChanges.set(old.productId, { delta: current.delta - old.quantity, name: old.productName });
            }

            for (const updated of newParts) {
                const current = netChanges.get(updated.productId) || { delta: 0, name: updated.productName };
                netChanges.set(updated.productId, { delta: current.delta + updated.quantity, name: updated.productName });
            }

            const productIdsToFetch = new Set<string>(netChanges.keys());
            if (values.status === 'Completado') {
                values.reservedParts.forEach(p => { if(!p.isManual) productIdsToFetch.add(p.productId) });
            }

            const productSnapshots = new Map<string, DocumentSnapshot>();
            for (const pid of Array.from(productIdsToFetch)) {
                const productRef = doc(firestore, 'users', user.uid, 'products', pid);
                const snap = await transaction.get(productRef);
                productSnapshots.set(pid, snap);
            }

            for (const pid of Array.from(netChanges.keys())) {
                const change = netChanges.get(pid)!;
                if (change.delta === 0) continue;

                const pSnap = productSnapshots.get(pid);
                if (pSnap && pSnap.exists()) {
                    const data = pSnap.data() as Product;
                    const currentlyAvailable = (data.stockLevel || 0) - (data.reservedStock || 0) - (data.damagedStock || 0);
                    
                    if (change.delta > 0 && currentlyAvailable < change.delta) {
                        throw new Error(`¡Inventario Bloqueado! No hay stock suficiente para "${change.name}".`);
                    }
                    
                    transaction.update(pSnap.ref, { 
                        reservedStock: Math.max(0, (data.reservedStock || 0) + change.delta) 
                    });
                }
            }

            let partsConsumed = !!repairJob?.partsConsumed;
            let finalReservedParts = [...values.reservedParts];
            let finalConsumedParts = [...(repairJob?.consumedParts || [])];
            let completionData: any = {};

            if (values.status === 'Completado') {
                for (const part of values.reservedParts) {
                    if (part.isManual) continue;
                    const pSnap = productSnapshots.get(part.productId);
                    if (pSnap?.exists()) {
                        const pData = pSnap.data() as Product;
                        transaction.update(pSnap.ref, {
                            stockLevel: (pData.stockLevel || 0) - part.quantity,
                            reservedStock: Math.max(0, (data.reservedStock || 0) - part.quantity)
                        });
                    }
                }
                
                const completionDate = new Date();
                completionData = {
                    completedAt: completionDate.toISOString(),
                    warrantyEndDate: addDays(completionDate, 4).toISOString(),
                    partsConsumed: true
                };
                
                finalConsumedParts = [...finalConsumedParts, ...values.reservedParts];
                finalReservedParts = [];
                partsConsumed = true;
            }

            const newEstimatedCost = Number(estimatedTotal.toFixed(2));
            const currentAmountPaid = repairJob?.amountPaid || 0;
            const isFullyPaidNow = currentAmountPaid >= (newEstimatedCost - 0.01);

            const { isMinimized, ...dataToSave } = values;

            const finalData: any = { 
                ...dataToSave,
                customerName: values.customerName.toUpperCase().trim(),
                customerID: values.customerID.toUpperCase().trim(),
                customerAddress: values.customerAddress.toUpperCase().trim(),
                deviceMake: values.deviceMake.toUpperCase().trim(),
                deviceModel: values.deviceModel.toUpperCase().trim(),
                reportedIssue: values.reportedIssue.toUpperCase().trim(),
                notes: values.notes.toUpperCase().trim(),
                id: jobId, 
                estimatedCost: newEstimatedCost,
                amountPaid: currentAmountPaid,
                isPaid: isFullyPaidNow,
                status: (isFullyPaidNow && values.status === 'Pendiente') ? 'Pagado' : values.status,
                createdAt: repairJob?.createdAt || new Date().toISOString(),
                reservedParts: finalReservedParts,
                consumedParts: finalConsumedParts,
                partsConsumed,
                isPromo: effectiveIsPromo, // Guardamos la detección automática
                ...completionData
            };
            
            transaction.set(jobRef, finalData, { merge: true });
            return finalData;
        });

        localStorage.removeItem(DRAFT_KEY);
        toast({ title: "Registro sincronizado con inventario" });
        if (!repairJob) {
            handlePrintAllTickets({ 
                repairJob: result as RepairJob, 
                businessName: profile?.businessName, 
                profile, 
                bcvRate,
                parallelRate 
            }, () => {});
        }
        setOpen(false);
    } catch (e: any) {
        console.error("Submit Error:", e);
        toast({ variant: "destructive", title: "Error en Transacción", description: e.message });
    } finally {
        setIsSubmitting(false);
    }
  }

  const currentPaid = Number(repairJob?.amountPaid || 0);
  const currentPending = Math.max(0, estimatedTotal - currentPaid);
  const isJobCompleted = repairJob?.status === 'Completado';
  const showRateInfo = profile?.showRateOnReceipt !== false;

  return (
    <Dialog open={open} onOpenChange={(val) => {
        if (!val && !repairJob && !isClosingViaMinimize.current) {}
        setOpen(val);
    }}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-2xl max-h-[95vh] flex flex-col p-0 overflow-hidden shadow-2xl border-none">
        <div className="p-4 bg-slate-100 border-b flex justify-between items-center relative">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase">
                    {repairJob ? 'GESTIONAR TRABAJO' : 'NUEVA RECEPCIÓN TÉCNICA'}
                    {(repairJob?.isPaid || currentPending <= 0.01) && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                </DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-2 pr-8">
                {repairJob && <Badge variant="outline" className="font-mono text-[10px] bg-white">{repairJob.id}</Badge>}
                {!repairJob && (
                    <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 hover:bg-slate-200" 
                        onClick={handleMinimize}
                        title="Minimizar y seguir luego"
                    >
                        <Minus className="w-4 h-4" />
                    </Button>
                )}
            </div>
        </div>
        
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto px-6 space-y-6 py-6 bg-white">
                    <div className="space-y-4 p-4 rounded-xl border border-slate-200 bg-slate-50/50 shadow-sm">
                        <div className="flex justify-between items-center border-b border-slate-200 pb-2 mb-2">
                            <h3 className="text-[10px] font-bold uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                <User className="w-3.5 h-3.5"/> 1. Información del Cliente
                            </h3>
                            {foundCustomer && !repairJob && (
                                <Button type="button" variant="ghost" className="h-6 text-[9px] text-blue-600 font-bold bg-blue-100/50 hover:bg-blue-100 uppercase" onClick={handleApplyCustomerData}>
                                    <CheckCircle2 className="w-3 h-3 mr-1" /> REUSAR DATOS
                                </Button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField control={form.control} name="customerID" render={({field}) => <FormItem className="space-y-1"><FormLabel className="text-[10px] text-muted-foreground uppercase font-bold">Cédula / RIF</FormLabel><FormControl><Input {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} className="h-9 text-xs bg-white uppercase font-normal" placeholder="V-00000000" /></FormControl></FormItem>} />
                            <FormField control={form.control} name="customerPhone" render={({field}) => <FormItem className="space-y-1"><FormLabel className="text-[10px] text-muted-foreground uppercase font-bold">Teléfono de Contacto</FormLabel><FormControl><Input {...field} className="h-9 text-xs bg-white font-normal" placeholder="0412-0000000" /></FormControl></FormItem>} />
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <FormField control={form.control} name="customerName" render={({field}) => <FormItem className="space-y-1"><FormLabel className="text-[10px] text-muted-foreground uppercase font-bold">Nombre y Apellido</FormLabel><FormControl><Input {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} className="h-9 text-xs uppercase bg-white font-normal" placeholder="NOMBRE DEL CLIENTE" /></FormControl></FormItem>} />
                            <FormField control={form.control} name="customerAddress" render={({field}) => <FormItem className="space-y-1"><FormLabel className="text-[10px] text-muted-foreground uppercase font-bold">Dirección de Habitación</FormLabel><FormControl><Input {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} className="h-9 text-xs uppercase bg-white font-normal" placeholder="ZONA / CALLE / CASA" /></FormControl></FormItem>} />
                        </div>
                    </div>

                    <div className="space-y-4 p-4 rounded-xl border border-slate-200 bg-slate-50/50 shadow-sm">
                        <div className="border-b border-slate-200 pb-2 mb-2">
                            <h3 className="text-[10px] font-bold uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                <Smartphone className="w-3.5 h-3.5"/> 2. Detalles del Equipo
                            </h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField control={form.control} name="deviceMake" render={({field}) => <FormItem className="space-y-1"><FormLabel className="text-[10px] text-muted-foreground uppercase font-bold">Marca</FormLabel><FormControl><Input {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} className="h-9 text-xs uppercase bg-white font-normal" placeholder="EJ: SAMSUNG, XIAOMI" /></FormControl></FormItem>} />
                            <FormField control={form.control} name="deviceModel" render={({field}) => <FormItem className="space-y-1"><FormLabel className="text-[10px] text-muted-foreground uppercase font-bold">Modelo exacto</FormLabel><FormControl><Input {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} className="h-9 text-xs uppercase bg-white font-normal" placeholder="EJ: A51, REDMI NOTE 12" /></FormControl></FormItem>} />
                        </div>
                        <FormField control={form.control} name="reportedIssue" render={({field}) => <FormItem className="space-y-1"><FormLabel className="text-[10px] text-muted-foreground uppercase font-bold">Falla Reportada</FormLabel><FormControl><Input {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} className="h-9 text-xs uppercase bg-white font-normal" placeholder="DESCRIPCIÓN DE LA FALLA" /></FormControl></FormItem>} />
                    </div>

                    <div className="space-y-4 p-4 rounded-xl border border-blue-100 bg-blue-50/30">
                        <div className="flex items-center justify-between border-b border-blue-200 pb-2 mb-2">
                            <h3 className="text-[10px] font-bold uppercase text-blue-600 tracking-widest flex items-center gap-2">
                                <Package className="w-3.5 h-3.5" /> 3. Repuestos y Servicios
                            </h3>
                            <div className="flex gap-2">
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-7 text-[9px] font-bold border-slate-200 bg-white uppercase" 
                                    onClick={() => setManualAddOpen(true)}
                                    disabled={isJobCompleted}
                                >
                                    <Plus className="w-3 h-3 mr-1" /> MANUAL (+)
                                </Button>

                                <Popover open={partsPopoverOpen} onOpenChange={setPartsPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button type="button" variant="outline" size="sm" className="h-7 text-[9px] font-bold border-slate-200 bg-white uppercase" disabled={isJobCompleted}>
                                            <Search className="w-3 h-3 mr-1" /> INVENTARIO
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 w-[350px]" align="end">
                                        <Command>
                                            <CommandInput placeholder="BUSCAR REPUESTO..." className="h-9 text-xs uppercase font-normal"/>
                                            <CommandList>
                                                <CommandEmpty className="text-xs py-4 text-center">NO SE ENCONTRARON ARTÍCULOS.</CommandEmpty>
                                                <CommandGroup>
                                                    {(products || []).filter(p => !p.isCombo).map(p => {
                                                        const inForm = reservedParts.find(rp => rp.productId === p.id);
                                                        const qtyInForm = inForm ? inForm.quantity : 0;
                                                        const originalInJob = repairJob?.reservedParts?.find(rp => rp.productId === p.id)?.quantity || 0;
                                                        const currentlyReservedGlobally = p.reservedStock || 0;
                                                        const available = (p.stockLevel - currentlyReservedGlobally - (p.damagedStock || 0)) + originalInJob;
                                                        
                                                        return (
                                                            <CommandItem key={p.id} onSelect={() => handleAddPart(p)} className="flex justify-between items-center p-2 text-xs cursor-pointer">
                                                                <span className="font-bold uppercase">{p.name}</span>
                                                                <Badge variant={available > qtyInForm ? "secondary" : "destructive"} className="text-[8px] h-4">
                                                                    {available > qtyInForm ? `${available - qtyInForm} LIBRES` : 'SIN STOCK'}
                                                                </Badge>
                                                            </CommandItem>
                                                        );
                                                    })}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>

                        <div className="space-y-2">
                            {reservedParts.length === 0 ? (
                                <p className="text-[10px] text-center text-slate-400 py-4 italic uppercase">No hay piezas nuevas en reserva.</p>
                            ) : (
                                reservedParts.map((part) => {
                                    const pData = products?.find(prod => prod.id === part.productId);
                                    const hasPromo = !!(pData?.promoPrice && pData.promoPrice > 0);
                                    let price = part.isPromo && pData?.promoPrice ? pData.promoPrice : getFinalPrice(pData || { costPrice: part.costPrice } as Product);
                                    
                                    if (part.isWarranty) price = 0;

                                    return (
                                        <div key={part.productId} className={cn(
                                            "flex items-center justify-between p-2.5 rounded-lg border shadow-sm text-xs transition-all",
                                            part.isWarranty ? "bg-orange-50 border-orange-200" : (part.isPromo ? "bg-blue-50 border-blue-200" : "bg-white border-slate-200")
                                        )}>
                                            <div className="flex flex-col">
                                                <span className={cn("font-bold uppercase text-slate-700", part.isWarranty && "text-orange-700")}>
                                                    {part.productName}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter">
                                                        Reservado: {part.quantity} x ${price.toFixed(2)}
                                                    </span>
                                                    {part.isPromo && !part.isWarranty && <Badge className="h-3 text-[7px] bg-blue-600 font-bold uppercase">Oferta</Badge>}
                                                    {part.isWarranty && <Badge className="h-3 text-[7px] bg-orange-600 font-bold uppercase">Garantía</Badge>}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <TooltipProvider>
                                                    {hasPromo && (
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button 
                                                                    type="button" 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className={cn("h-7 w-7", part.isPromo ? "text-blue-600 bg-blue-100" : "text-slate-400")} 
                                                                    onClick={() => handleTogglePromo(part.productId)}
                                                                    disabled={isJobCompleted || part.isWarranty}
                                                                >
                                                                    <TicketPercent className="w-3.5 h-3.5" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent className="text-[10px] font-bold uppercase">Precio de Oferta</TooltipContent>
                                                        </Tooltip>
                                                    )}

                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button 
                                                                type="button" 
                                                                variant="ghost" 
                                                                size="icon" 
                                                                className={cn("h-7 w-7", part.isWarranty ? "text-orange-600 bg-orange-100" : "text-slate-400")} 
                                                                onClick={() => handleToggleWarranty(part.productId)}
                                                                disabled={isJobCompleted}
                                                            >
                                                                <ShieldCheck className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent className="text-[10px] font-bold uppercase">Garantía ($0)</TooltipContent>
                                                    </Tooltip>

                                                    {!isJobCompleted && (
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button 
                                                                    type="button" 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-7 w-7 text-destructive hover:bg-destructive/5" 
                                                                    onClick={() => handleRemovePart(part.productId)}
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent className="text-[10px] font-bold uppercase">Quitar</TooltipContent>
                                                        </Tooltip>
                                                    )}
                                                </TooltipProvider>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {repairJob?.consumedParts && repairJob.consumedParts.length > 0 && (
                        <div className="space-y-4 p-4 rounded-xl border border-slate-200 bg-slate-50/30">
                            <div className="border-b border-slate-200 pb-2 mb-2">
                                <h3 className="text-[10px] font-bold uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                    <History className="w-3.5 h-3.5" /> Historial de Repuestos Consumidos
                                </h3>
                            </div>
                            <div className="space-y-2 opacity-70">
                                {repairJob.consumedParts.map((part, idx) => (
                                    <div key={idx} className="flex justify-between items-center p-2 rounded-lg border bg-white text-[10px]">
                                        <div className="flex flex-col">
                                            <span className="font-bold uppercase">{part.productName}</span>
                                            <span className="text-muted-foreground uppercase font-bold">Consumido el {repairJob.completedAt ? format(parseISO(repairJob.completedAt), "dd/MM/yy") : '---'}</span>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-black">${part.isWarranty ? '0.00' : part.costPrice.toFixed(2)}</p>
                                            {part.isWarranty && <Badge variant="outline" className="h-3 text-[7px] border-orange-200 text-orange-600 font-bold uppercase">Garantía</Badge>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="pt-2">
                        <div className="p-5 rounded-xl bg-slate-900 text-white space-y-2 shadow-xl border-t-4 border-primary">
                            <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                <span>Costo Total Acumulado:</span>
                                <span>${estimatedTotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-green-400 font-bold uppercase tracking-wider">
                                <span>Abono Recibido:</span>
                                <span>-${currentPaid.toFixed(2)}</span>
                            </div>
                            <div className="border-t border-white/10 pt-3 mt-1 flex justify-between items-end">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Saldo Pendiente</span>
                                    <span className="text-[9px] text-slate-500 font-bold uppercase">
                                        Eq: Bs {formatCurrency(currentPending * (effectiveIsPromo ? parallelRate : bcvRate))}
                                    </span>
                                </div>
                                <span className="text-3xl font-black text-primary leading-none tabular-nums">${currentPending.toFixed(2)}</span>
                            </div>
                        </div>
                        
                        {/* PANEL INFORMATIVO DE PROMOCIÓN DETECTADA */}
                        {effectiveIsPromo && showRateInfo && (
                            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex flex-col animate-in slide-in-from-top-2">
                                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-blue-700">
                                    <TicketPercent className="w-3.5 h-3.5" /> 
                                    Tasa de Reposición Activa
                                </div>
                                <p className="text-[8px] text-blue-600/70 font-bold uppercase ml-5">
                                    Se ha detectado el uso de repuestos en oferta. El saldo en Bolívares se protege usando el dólar de reposición.
                                </p>
                            </div>
                        )}
                    </div>

                    <FormField control={form.control} name="notes" render={({field}) => (
                        <FormItem className="space-y-1">
                            <FormLabel className="text-[10px] font-bold uppercase text-slate-400">Observaciones / Notas</FormLabel>
                            <FormControl>
                                <Textarea placeholder="EJ: RAYONES EN TAPA TRASERA, SIN BANDEJA SIM..." {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} className="resize-none text-xs h-16 uppercase bg-white font-normal" />
                            </FormControl>
                        </FormItem>
                    )} />
                </div>

                <div className="p-4 border-t bg-slate-100 flex gap-3">
                    <DialogFooter className="w-full sm:flex-row flex-col gap-2">
                        <Button type="submit" disabled={isSubmitting} className="flex-1 h-11 text-xs font-bold uppercase tracking-widest shadow-lg">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : (repairJob ? "GUARDAR CAMBIOS" : "REGISTRAR E IMPRIMIR")}
                        </Button>
                    </DialogFooter>
                </div>
            </form>
        </Form>

        <ProductFormDialog 
            isOpen={manualAddOpen}
            onOpenChange={setManualAddOpen}
            productCount={products?.length || 0}
            onSaved={(newProd) => {
                const existingInForm = reservedParts.find(item => item.productId === newProd.id);
                if (existingInForm) {
                    form.setValue('reservedParts', reservedParts.map(item => 
                        item.productId === newProd.id ? { ...item, quantity: item.quantity + 1 } : item
                    ));
                } else {
                    const newPart: ReservedPart = {
                        productId: newProd.id!,
                        productName: newProd.name.toUpperCase(),
                        quantity: 1,
                        costPrice: newProd.costPrice,
                        isPromo: !!(newProd.promoPrice && newProd.promoPrice > 0),
                        isWarranty: false
                    };
                    form.setValue('reservedParts', [...reservedParts, newPart]);
                }
            }}
        />

        {replenishProduct && (
            <ProductFormDialog 
                product={replenishProduct}
                isOpen={!!replenishProduct}
                onOpenChange={(open) => !open && setReplenishProduct(null)}
                onSaved={(updatedProd) => {
                    const existingInForm = reservedParts.find(item => item.productId === updatedProd.id);
                    if (existingInForm) {
                        form.setValue('reservedParts', reservedParts.map(item => 
                            item.productId === updatedProd.id ? { ...item, quantity: item.quantity + 1 } : item
                        ));
                    } else {
                        const newPart: ReservedPart = {
                            productId: updatedProd.id!,
                            productName: updatedProd.name.toUpperCase(),
                            quantity: 1,
                            costPrice: updatedProd.costPrice,
                            isPromo: !!(updatedProd.promoPrice && updatedProd.promoPrice > 0),
                            isWarranty: false
                        };
                        form.setValue('reservedParts', [...reservedParts, newPart]);
                    }
                }}
            />
        )}
      </DialogContent>
    </Dialog>
  );
}
