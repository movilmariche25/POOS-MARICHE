
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
import type { RepairJob, RepairStatus, Product, UserProfile } from "@/lib/types";
import { useState, useEffect, ReactNode, useMemo, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useCurrency } from "@/hooks/use-currency";
import { Label } from "../ui/label";
import { useFirebase, useCollection, useMemoFirebase, useDoc } from "@/firebase";
import { collection, doc, runTransaction, query, orderBy } from "firebase/firestore";
import { handlePrintAllTickets } from "./repair-ticket";
import { DollarSign, Search, PlusCircle, CheckCircle2, AlertCircle, UserCheck, Gift, History, Edit } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { format } from "date-fns";
import { ProductFormDialog } from "../inventory/product-form-dialog";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Separator } from "../ui/separator";

const repairStatuses: RepairStatus[] = ['Pendiente', 'Pagado', 'Completado'];

const formSchema = z.object({
  customerName: z.string().min(2, "Nombre obligatorio"),
  customerPhone: z.string().min(10, "Teléfono inválido"),
  customerID: z.string().min(5, "Cédula requerida"),
  customerAddress: z.string().default(""),
  deviceMake: z.string().min(2, "Marca obligatoria"),
  deviceModel: z.string().min(1, "Modelo obligatorio"),
  reportedIssue: z.string().min(5, "Detalla la falla del equipo"),
  estimatedCost: z.coerce.number().min(0, "Costo debe ser positivo"),
  status: z.enum(repairStatuses),
  notes: z.string().default(""),
  reservedParts: z.array(z.any()).default([]),
  isPromo: z.boolean().default(false),
});

export function RepairFormDialog({ repairJob, children }: { repairJob?: RepairJob | null, children: ReactNode }) {
  const { firestore, user } = useFirebase();
  const [open, setOpen] = useState(false);
  const [partsPopoverOpen, setPartsPopoverOpen] = useState(false);
  const { toast } = useToast();
  const { getFinalPrice, format: formatCurrency, bcvRate } = useCurrency();
  const [mainPart, setMainPart] = useState<Product | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [isEditProductOpen, setIsEditProductOpen] = useState(false);
  
  const isInitialized = useRef(false);

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
      estimatedCost: 0, 
      reservedParts: [],
      isPromo: false,
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
    (firestore && user) ? query(collection(firestore, 'users', user.uid, 'repair_jobs'), orderBy('createdAt', 'desc')) : null,
    [firestore, user?.uid]
  );
  const { data: allRepairs } = useCollection<RepairJob>(repairsCollection);

  const currentID = form.watch("customerID");

  const foundCustomer = useMemo(() => {
    if (!currentID || currentID.length < 5 || !allRepairs) return null;
    const match = allRepairs.find(r => r.customerID?.toLowerCase() === currentID.toLowerCase());
    if (match) {
        return {
            name: match.customerName,
            phone: match.customerPhone,
            address: match.customerAddress || ""
        };
    }
    return null;
  }, [currentID, allRepairs]);

  const handleApplyCustomerData = () => {
    if (foundCustomer) {
        form.setValue("customerName", foundCustomer.name, { shouldValidate: true });
        form.setValue("customerPhone", foundCustomer.phone, { shouldValidate: true });
        form.setValue("customerAddress", foundCustomer.address, { shouldValidate: true });
        toast({ title: "Datos del cliente cargados" });
    }
  };

  useEffect(() => {
    if (!open) {
        isInitialized.current = false;
        return;
    }

    if (open && !isInitialized.current) {
        if (repairJob) {
            form.reset({ 
                ...repairJob,
                customerID: repairJob.customerID || "",
                customerAddress: repairJob.customerAddress || "",
                isPromo: repairJob.isPromo || false,
                notes: repairJob.notes || "",
                reservedParts: repairJob.reservedParts || [],
            });
        } else {
            form.reset({ 
                customerName: "",
                customerPhone: "",
                customerID: "",
                customerAddress: "",
                deviceMake: "",
                deviceModel: "",
                reportedIssue: "",
                status: "Pendiente", 
                estimatedCost: 0, 
                reservedParts: [],
                isPromo: false,
                notes: "",
            });
            setMainPart(null);
        }
        isInitialized.current = true;
    }
  }, [repairJob, open, form]);

  useEffect(() => {
    if (open && products && repairJob?.reservedParts?.[0]) {
        const part = products.find(p => p.id === repairJob.reservedParts![0].productId);
        if (part) setMainPart(part);
    }
  }, [open, products, repairJob]);

  const handlePartSelect = (p: Product) => {
      setMainPart(p);
      const price = getFinalPrice(p);
      form.setValue('estimatedCost', price, { shouldValidate: true });
      form.setValue('reservedParts', [{ productId: p.id!, productName: p.name, quantity: 1, costPrice: p.costPrice }], { shouldValidate: true });
      form.setValue('isPromo', false, { shouldValidate: true });
      setPartsPopoverOpen(false);
  };

  const applyPromoPrice = () => {
      if (mainPart && mainPart.promoPrice && mainPart.promoPrice > 0) {
          const currentPrice = form.getValues('estimatedCost');
          const promoPrice = mainPart.promoPrice;
          const regularPrice = getFinalPrice(mainPart);

          if (Math.abs(currentPrice - promoPrice) < 0.01) {
              form.setValue('estimatedCost', regularPrice, { shouldValidate: true });
              form.setValue('isPromo', false, { shouldValidate: true });
          } else {
              form.setValue('estimatedCost', promoPrice, { shouldValidate: true });
              form.setValue('isPromo', true, { shouldValidate: true });
          }
      }
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!firestore || !user || isSubmitting) return;

    setIsSubmitting(true);
    try {
        const result = await runTransaction(firestore, async (transaction) => {
            const jobId = repairJob?.id || `R-${format(new Date(), "yyMMdd")}-${Math.floor(1000 + Math.random() * 9000)}`;
            const jobRef = doc(firestore, 'users', user.uid, 'repair_jobs', jobId);

            const oldPartId = repairJob?.reservedParts?.[0]?.productId;
            const newPartId = mainPart?.id;

            let oldSnap = null;
            let newSnap = null;

            if (oldPartId) {
                oldSnap = await transaction.get(doc(firestore, 'users', user.uid, 'products', oldPartId));
            }
            if (newPartId && newPartId !== oldPartId) {
                newSnap = await transaction.get(doc(firestore, 'users', user.uid, 'products', newPartId));
            }

            if (!repairJob?.isPaid) {
                if (!repairJob && newPartId && newSnap?.exists()) {
                    transaction.update(newSnap.ref, { reservedStock: (newSnap.data().reservedStock || 0) + 1 });
                } 
                else if (repairJob && oldPartId !== newPartId) {
                    if (oldPartId && oldSnap?.exists()) {
                        transaction.update(oldSnap.ref, { reservedStock: Math.max(0, (oldSnap.data().reservedStock || 0) - 1) });
                    }
                    if (newPartId && newSnap?.exists()) {
                        transaction.update(newSnap.ref, { reservedStock: (newSnap.data().reservedStock || 0) + 1 });
                    }
                }
            }

            // Explicitly build finalData to ensure NO 'undefined' fields reach Firestore
            const finalData: any = { 
                customerName: values.customerName,
                customerPhone: values.customerPhone,
                customerID: values.customerID,
                customerAddress: values.customerAddress || "",
                deviceMake: values.deviceMake,
                deviceModel: values.deviceModel,
                reportedIssue: values.reportedIssue,
                status: values.status,
                estimatedCost: Number(values.estimatedCost) || 0,
                notes: values.notes || "",
                reservedParts: values.reservedParts || [],
                isPromo: !!values.isPromo,
                id: jobId, 
                amountPaid: repairJob?.amountPaid || 0,
                isPaid: repairJob?.isPaid || false,
                createdAt: repairJob?.createdAt || new Date().toISOString(),
                // Safety defaults for other fields in RepairJob type
                partsCost: repairJob?.partsCost || 0,
                laborCost: repairJob?.laborCost || 0,
                partsConsumed: !!repairJob?.partsConsumed
            };
            
            transaction.set(jobRef, finalData, { merge: true });
            return finalData;
        });

        toast({ title: "Registro actualizado exitosamente" });
        if (!repairJob) {
            handlePrintAllTickets({ repairJob: result as RepairJob, businessName: profile?.businessName, profile, bcvRate }, () => {});
        }
        setOpen(false);
    } catch (e: any) {
        console.error("Repair Submit Error:", e);
        toast({ variant: "destructive", title: "Error de inventario", description: "No se pudo actualizar la pieza. Verifica el stock disponible." });
    } finally {
        setIsSubmitting(false);
    }
  }

  const currentPaid = repairJob?.amountPaid || 0;
  const currentTotal = form.watch('estimatedCost') || 0;
  const currentPending = Math.max(0, currentTotal - currentPaid);
  const hasPromoAvailable = mainPart && mainPart.promoPrice && mainPart.promoPrice > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-xl" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
                {repairJob ? 'Detalles de Reparación' : 'Nuevo Registro de Reparación'}
                {repairJob?.isPaid && <CheckCircle2 className="w-5 h-5 text-green-500" />}
            </DialogTitle>
            <DialogDescription>Gestión técnica y resumen de cuenta blindado del equipo.</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 overflow-y-auto max-h-[75vh] pr-2">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-4 p-3 border rounded-md bg-muted/5">
                        <div className="flex justify-between items-center">
                            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Datos del Cliente</p>
                            {foundCustomer && !repairJob && (
                                <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-6 text-[10px] text-blue-600 bg-blue-50 hover:bg-blue-100 flex items-center gap-1 font-bold"
                                    onClick={handleApplyCustomerData}
                                >
                                    <UserCheck className="w-3.5 h-3.5" />
                                    ¿CARGAR DATOS DE {foundCustomer.name.toUpperCase()}?
                                </Button>
                            )}
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField control={form.control} name="customerID" render={({field}) => (
                                <FormItem>
                                    <FormLabel>Cédula / RIF</FormLabel>
                                    <Input placeholder="V-12345678" {...field}/>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="customerName" render={({field}) => (
                                <FormItem>
                                    <FormLabel>Nombre y Apellido</FormLabel>
                                    <Input placeholder="Ej: Juan Perez" {...field}/>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField control={form.control} name="customerPhone" render={({field}) => <FormItem><FormLabel>Teléfono</FormLabel><Input placeholder="0414-1234567" {...field}/><FormMessage /></FormItem>} />
                            <FormField control={form.control} name="customerAddress" render={({field}) => <FormItem><FormLabel>Dirección (Opcional)</FormLabel><Input placeholder="Ej: Calle 5, Casa 10" {...field}/><FormMessage /></FormItem>} />
                        </div>
                    </div>

                    <div className="space-y-4 p-3 border rounded-md bg-muted/5">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Datos del Equipo</p>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="deviceMake" render={({field}) => <FormItem><FormLabel>Marca</FormLabel><Input placeholder="Samsung, iPhone..." {...field}/><FormMessage /></FormItem>} />
                            <FormField control={form.control} name="deviceModel" render={({field}) => <FormItem><FormLabel>Modelo</FormLabel><Input placeholder="S23 Ultra, 14 Pro..." {...field}/><FormMessage /></FormItem>} />
                        </div>
                        <FormField control={form.control} name="reportedIssue" render={({field}) => <FormItem><FormLabel>Falla Reportada</FormLabel><Textarea placeholder="Ej: Pantalla partida..." {...field} className="resize-none" /></FormItem>} />
                    </div>
                    
                    <div className="p-3 border rounded-md bg-muted/20">
                        <Label className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">Pieza Principal (Inventario)</span>
                        </Label>
                        <div className="flex gap-2">
                            <Popover open={partsPopoverOpen} onOpenChange={setPartsPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button type="button" variant="outline" className="w-full justify-start overflow-hidden text-ellipsis whitespace-nowrap bg-background" disabled={repairJob?.isPaid}>
                                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50"/> {mainPart?.name || "Vincular pieza..."}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="p-0 w-[300px]" align="start">
                                    <Command>
                                        <CommandInput placeholder="Buscar por nombre o SKU..."/>
                                        <CommandList>
                                            <CommandEmpty>No hay piezas disponibles.</CommandEmpty>
                                            <CommandGroup>
                                                {(products || []).filter(p => !p.isCombo).map(p => {
                                                    const available = p.stockLevel - (p.reservedStock || 0);
                                                    const isCurrentlySelected = mainPart?.id === p.id;
                                                    const canSelect = available > 0 || isCurrentlySelected;

                                                    return (
                                                        <CommandItem 
                                                            key={p.id} 
                                                            onSelect={() => {
                                                                if (canSelect) {
                                                                    handlePartSelect(p);
                                                                } else {
                                                                    setProductToEdit(p);
                                                                    setIsEditProductOpen(true);
                                                                }
                                                            }}
                                                            className={cn("flex justify-between items-center cursor-pointer", (!canSelect && !isCurrentlySelected) && "bg-amber-50/30 opacity-80")}
                                                        >
                                                            <div className="flex flex-col flex-1">
                                                                <span className="font-medium">{p.name}</span>
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    {available <= 0 && !isCurrentlySelected ? (
                                                                        <span className="text-destructive font-black">SIN STOCK - ENTER PARA AJUSTAR</span>
                                                                    ) : (
                                                                        <span>Disponible: {available} | Ref: ${getFinalPrice(p)}</span>
                                                                    )}
                                                                </span>
                                                            </div>
                                                            {(!canSelect && !isCurrentlySelected) && <Edit className="h-3.5 w-3.5 text-primary ml-2 shrink-0" />}
                                                        </CommandItem>
                                                    );
                                                })}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                            <ProductFormDialog>
                                <Button type="button" variant="outline" size="icon" title="Crear pieza nueva"><PlusCircle className="h-4 w-4"/></Button>
                            </ProductFormDialog>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                        <FormField control={form.control} name="estimatedCost" render={({field}) => (
                            <FormItem>
                                <FormLabel>Costo Estimado ($)</FormLabel>
                                <div className="relative flex items-center">
                                    <DollarSign className="absolute left-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input type="number" step="0.01" {...field} className="pl-8 pr-10" disabled={repairJob?.isPaid} />
                                    {hasPromoAvailable && !repairJob?.isPaid && (
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button 
                                                        type="button" 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className={cn("absolute right-1 h-8 w-8", form.watch('isPromo') ? "text-pink-600 bg-pink-50" : "text-muted-foreground hover:bg-blue-50")}
                                                        onClick={applyPromoPrice}
                                                    >
                                                        <Gift className="h-4 w-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Alternar Precio Oferta (${mainPart.promoPrice}) / Regular</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    )}
                                </div>
                                <FormMessage />
                            </FormItem>
                        )} />
                        
                        {repairJob && (
                            <FormField control={form.control} name="status" render={({field}) => (
                                <FormItem>
                                    <FormLabel>Estado del Trabajo</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value} disabled={repairJob?.isPaid && repairJob?.status === 'Completado'}>
                                        <SelectTrigger><SelectValue/></SelectTrigger>
                                        <SelectContent>{repairStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        )}
                    </div>

                    <div className="p-4 bg-primary/5 rounded-lg border border-primary/10 space-y-3">
                        <div className="flex items-center gap-2 text-primary font-black uppercase text-[10px] tracking-widest border-b border-primary/10 pb-2">
                            <History className="w-3.5 h-3.5" /> Estado de Cuenta
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground">Costo Total:</span>
                                <span className="font-bold">${currentTotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground">Ya Abonado:</span>
                                <span className="font-bold text-green-600">${currentPaid.toFixed(2)}</span>
                            </div>
                            <Separator className="my-2 bg-primary/10" />
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-black uppercase">Saldo Pendiente:</span>
                                <div className="text-right flex flex-col items-end">
                                    <span className={cn("text-xl font-black", currentPending > 0 ? "text-primary" : "text-green-600")}>
                                        ${currentPending.toFixed(2)}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground font-bold">
                                        Bs {formatCurrency(currentPending * bcvRate)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="gap-2 pt-4 border-t mt-4 sticky bottom-0 bg-white py-2">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "SINCRONIZANDO..." : (repairJob ? "Guardar Cambios" : "Registrar e Imprimir")}
                        </Button>
                    </DialogFooter>
                </form>
            </Form>
        </div>

        <ProductFormDialog 
            product={productToEdit || undefined} 
            isOpen={isEditProductOpen} 
            onOpenChange={(val) => {
                setIsEditProductOpen(val);
                if (!val) setProductToEdit(null);
            }} 
        />
      </DialogContent>
    </Dialog>
  );
}
