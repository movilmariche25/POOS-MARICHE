
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
import type { RepairJob, RepairStatus, Product, UserProfile, ReservedPart } from "@/lib/types";
import { useState, useEffect, ReactNode, useMemo, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "../ui/textarea";
import { useCurrency } from "@/hooks/use-currency";
import { Label } from "../ui/label";
import { useFirebase, useCollection, useMemoFirebase, useDoc } from "@/firebase";
import { collection, doc, runTransaction, query, orderBy } from "firebase/firestore";
import { handlePrintAllTickets } from "./repair-ticket";
import { CheckCircle2, User, Smartphone, Package, Search, Plus, Trash2, Loader2, Tag, Info, Receipt, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { cn } from "@/lib/utils";
import { Badge } from "../ui/badge";
import { ProductFormDialog } from "../inventory/product-form-dialog";

const formSchema = z.object({
  customerName: z.string().min(2, "Nombre obligatorio"),
  customerPhone: z.string().min(10, "Teléfono inválido"),
  customerID: z.string().min(5, "Cédula requerida"),
  customerAddress: z.string().default(""),
  deviceMake: z.string().min(2, "Marca obligatoria"),
  deviceModel: z.string().min(1, "Modelo obligatorio"),
  reportedIssue: z.string().min(5, "Detalla la falla del equipo"),
  status: z.enum(['Pendiente', 'Pagado', 'Completado']),
  notes: z.string().default(""),
  reservedParts: z.array(z.any()).default([]),
  isPromo: z.boolean().default(false),
});

export function RepairFormDialog({ repairJob, children }: { repairJob?: RepairJob | null, children: ReactNode }) {
  const { firestore, user } = useFirebase();
  const [open, setOpen] = useState(false);
  const [partsPopoverOpen, setPartsPopoverOpen] = useState(false);
  const [replenishProduct, setReplenishProduct] = useState<Product | null>(null);
  
  const { toast } = useToast();
  const { getFinalPrice, getDynamicPrice, format: formatCurrency, bcvRate } = useCurrency();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
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
      reservedParts: [],
      isPromo: false,
      notes: "",
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
  const reservedParts = form.watch("reservedParts") as (ReservedPart & { isPromo?: boolean, isManual?: boolean })[];

  const partsTotal = useMemo(() => {
    return reservedParts.reduce((sum, part) => {
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
  }, [reservedParts, products, getFinalPrice, getDynamicPrice]);

  const estimatedTotal = partsTotal;

  const foundCustomer = useMemo(() => {
    if (!currentID || currentID.length < 5 || !allRepairs) return null;
    return allRepairs.find(r => r.customerID?.toLowerCase() === currentID.toLowerCase());
  }, [currentID, allRepairs]);

  const handleApplyCustomerData = () => {
    if (foundCustomer) {
        form.setValue("customerName", foundCustomer.customerName, { shouldValidate: true });
        form.setValue("customerPhone", foundCustomer.customerPhone, { shouldValidate: true });
        form.setValue("customerAddress", foundCustomer.customerAddress || "", { shouldValidate: true });
        toast({ title: "Datos cargados" });
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
                notes: repairJob.notes || "",
                reservedParts: repairJob.reservedParts || [],
                status: repairJob.status as any,
            });
        } else {
            form.reset({ 
                customerName: "", customerPhone: "", customerID: "", customerAddress: "",
                deviceMake: "", deviceModel: "", reportedIssue: "",
                status: "Pendiente", reservedParts: [],
                isPromo: false, notes: "",
            });
        }
        isInitialized.current = true;
    }
  }, [repairJob, open, form]);

  const handleAddPart = (p: Product) => {
      const originalPart = repairJob?.reservedParts?.find(rp => rp.productId === p.id);
      const originalQty = originalPart ? originalPart.quantity : 0;
      const dbAvailable = p.stockLevel - (p.reservedStock || 0);
      const realAvailableForThisJob = dbAvailable + originalQty;

      const existingInForm = reservedParts.find(item => item.productId === p.id);
      const qtyInForm = existingInForm ? existingInForm.quantity : 0;
      
      if (realAvailableForThisJob < qtyInForm + 1) {
          toast({
              variant: "destructive",
              title: "Inventario Agotado",
              description: `Solo hay ${realAvailableForThisJob} unidades disponibles en total para este producto.`
          });
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
              productName: p.name,
              quantity: 1,
              costPrice: p.costPrice,
              isPromo: false
          };
          form.setValue('reservedParts', [...reservedParts, newPart]);
      }
      setPartsPopoverOpen(false);
  };

  const handleRemovePart = (productId: string) => {
      form.setValue('reservedParts', reservedParts.filter(p => p.productId !== productId));
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!firestore || !user || isSubmitting) return;

    setIsSubmitting(true);
    try {
        const result = await runTransaction(firestore, async (transaction) => {
            const jobId = repairJob?.id || `R-${format(new Date(), "yyMMdd")}-${Math.floor(1000 + Math.random() * 9000)}`;
            const jobRef = doc(firestore, 'users', user.uid, 'repair_jobs', jobId);

            // PASO 1: Calcular cambios netos de inventario
            const oldParts = (repairJob?.reservedParts || []).filter(p => !(p as any).isManual);
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

            // PASO 2: REALIZAR TODAS LAS LECTURAS (READS) PRIMERO
            // Firestore exige que los transaction.get ocurran antes que cualquier transaction.set/update
            const productIds = Array.from(netChanges.keys());
            const productSnaps = new Map();
            
            if (!repairJob?.isPaid) {
                for (const pid of productIds) {
                    const productRef = doc(firestore, 'users', user.uid, 'products', pid);
                    const snap = await transaction.get(productRef);
                    productSnaps.set(pid, snap);
                }
            }

            // PASO 3: REALIZAR TODAS LAS ESCRITURAS (WRITES)
            if (!repairJob?.isPaid) {
                for (const pid of productIds) {
                    const change = netChanges.get(pid)!;
                    if (change.delta === 0) continue;

                    const pSnap = productSnaps.get(pid);
                    if (pSnap && pSnap.exists()) {
                        const data = pSnap.data();
                        const currentReserved = data.reservedStock || 0;
                        const physicalStock = data.stockLevel || 0;
                        const currentlyAvailable = physicalStock - currentReserved;
                        
                        if (change.delta > 0 && currentlyAvailable < change.delta) {
                            throw new Error(`Inventario insuficiente: ${currentlyAvailable} disponibles de "${change.name}".`);
                        }
                        
                        transaction.update(pSnap.ref, { 
                            reservedStock: Math.max(0, currentReserved + change.delta) 
                        });
                    }
                }
            }

            // Actualizar datos del trabajo
            const newEstimatedCost = Number(estimatedTotal.toFixed(2));
            const currentAmountPaid = repairJob?.amountPaid || 0;
            const isFullyPaidNow = currentAmountPaid >= (newEstimatedCost - 0.01);

            const finalData: any = { 
                ...values,
                id: jobId, 
                estimatedCost: newEstimatedCost,
                amountPaid: currentAmountPaid,
                isPaid: isFullyPaidNow,
                status: (isFullyPaidNow && values.status === 'Pendiente') ? 'Pagado' : values.status,
                createdAt: repairJob?.createdAt || new Date().toISOString(),
                partsCost: reservedParts.reduce((sum, p) => sum + (p.costPrice * p.quantity), 0),
                partsConsumed: !!repairJob?.partsConsumed,
                laborCost: 0 
            };
            
            transaction.set(jobRef, finalData, { merge: true });
            return finalData;
        });

        toast({ title: "Registro guardado" });
        if (!repairJob) {
            handlePrintAllTickets({ repairJob: result as RepairJob, businessName: profile?.businessName, profile, bcvRate }, () => {});
        }
        setOpen(false);
    } catch (e: any) {
        toast({ variant: "destructive", title: "Error", description: e.message || "Ocurrió un error." });
    } finally {
        setIsSubmitting(false);
    }
  }

  const currentPaid = Number(repairJob?.amountPaid || 0);
  const currentPending = Math.max(0, estimatedTotal - currentPaid);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[95vh] flex flex-col p-0 overflow-hidden shadow-2xl border-none">
        <div className="p-4 bg-slate-100 border-b flex justify-between items-center">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    {repairJob ? 'GESTIONAR TRABAJO' : 'NUEVA RECEPCIÓN TÉCNICA'}
                    {(repairJob?.isPaid || currentPending <= 0.01) && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                </DialogTitle>
            </DialogHeader>
            {repairJob && <Badge variant="outline" className="font-mono text-[10px] bg-white">{repairJob.id}</Badge>}
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
                                <Button type="button" variant="ghost" className="h-6 text-[9px] text-blue-600 font-bold bg-blue-100/50 hover:bg-blue-100" onClick={handleApplyCustomerData}>
                                    <CheckCircle2 className="w-3 h-3 mr-1" /> REUSAR DATOS
                                </Button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField control={form.control} name="customerID" render={({field}) => <FormItem className="space-y-1"><FormLabel className="text-[10px] text-muted-foreground uppercase font-bold">Cédula / RIF</FormLabel><FormControl><Input {...field} className="h-9 text-xs bg-white" placeholder="V-00000000" /></FormControl></FormItem>} />
                            <FormField control={form.control} name="customerPhone" render={({field}) => <FormItem className="space-y-1"><FormLabel className="text-[10px] text-muted-foreground uppercase font-bold">Teléfono de Contacto</FormLabel><FormControl><Input {...field} className="h-9 text-xs bg-white" placeholder="0412-0000000" /></FormControl></FormItem>} />
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <FormField control={form.control} name="customerName" render={({field}) => <FormItem className="space-y-1"><FormLabel className="text-[10px] text-muted-foreground uppercase font-bold">Nombre y Apellido</FormLabel><FormControl><Input {...field} className="h-9 text-xs uppercase bg-white" placeholder="NOMBRE DEL CLIENTE" /></FormControl></FormItem>} />
                            <FormField control={form.control} name="customerAddress" render={({field}) => <FormItem className="space-y-1"><FormLabel className="text-[10px] text-muted-foreground uppercase font-bold">Dirección de Habitación</FormLabel><FormControl><Input {...field} className="h-9 text-xs uppercase bg-white" placeholder="ZONA / CALLE / CASA" /></FormControl></FormItem>} />
                        </div>
                    </div>

                    <div className="space-y-4 p-4 rounded-xl border border-slate-200 bg-slate-50/50 shadow-sm">
                        <div className="border-b border-slate-200 pb-2 mb-2">
                            <h3 className="text-[10px] font-bold uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                <Smartphone className="w-3.5 h-3.5"/> 2. Detalles del Equipo
                            </h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField control={form.control} name="deviceMake" render={({field}) => <FormItem className="space-y-1"><FormLabel className="text-[10px] text-muted-foreground uppercase font-bold">Marca</FormLabel><FormControl><Input {...field} className="h-9 text-xs uppercase bg-white" placeholder="EJ: SAMSUNG, XIAOMI" /></FormControl></FormItem>} />
                            <FormField control={form.control} name="deviceModel" render={({field}) => <FormItem className="space-y-1"><FormLabel className="text-[10px] text-muted-foreground uppercase font-bold">Modelo exacto</FormLabel><FormControl><Input {...field} className="h-9 text-xs uppercase bg-white" placeholder="EJ: A51, REDMI NOTE 12" /></FormControl></FormItem>} />
                        </div>
                        <FormField control={form.control} name="reportedIssue" render={({field}) => <FormItem className="space-y-1"><FormLabel className="text-[10px] text-muted-foreground uppercase font-bold">Falla Reportada por el Cliente</FormLabel><FormControl><Input {...field} className="h-9 text-xs uppercase bg-white" placeholder="DESCRIPCIÓN DE LA FALLA" /></FormControl></FormItem>} />
                    </div>

                    <div className="space-y-4 p-4 rounded-xl border border-blue-100 bg-blue-50/30">
                        <div className="flex items-center justify-between border-b border-blue-200 pb-2 mb-2">
                            <h3 className="text-[10px] font-bold uppercase text-blue-600 tracking-widest flex items-center gap-2">
                                <Package className="w-3.5 h-3.5" /> 3. Repuestos y Servicios
                            </h3>
                            <div className="flex gap-2">
                                <ProductFormDialog 
                                    productCount={products?.length || 0}
                                    onSaved={(newProd) => {
                                        const part: ReservedPart = {
                                            productId: newProd.id!,
                                            productName: newProd.name,
                                            quantity: 1,
                                            costPrice: newProd.costPrice,
                                            isPromo: false
                                        };
                                        form.setValue('reservedParts', [...reservedParts, part]);
                                    }}
                                >
                                    <Button type="button" variant="outline" size="sm" className="h-7 text-[9px] font-bold border-slate-200 bg-white">
                                        <Plus className="w-3 h-3 mr-1" /> MANUAL (+)
                                    </Button>
                                </ProductFormDialog>

                                <Popover open={partsPopoverOpen} onOpenChange={setPartsPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button type="button" variant="outline" size="sm" className="h-7 text-[9px] font-bold border-slate-200 bg-white" disabled={repairJob?.isPaid}>
                                            <Search className="w-3 h-3 mr-1" /> INVENTARIO
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 w-[350px]" align="end">
                                        <Command>
                                            <CommandInput placeholder="Nombre o SKU del repuesto..." className="h-9 text-xs"/>
                                            <CommandList>
                                                <CommandEmpty className="text-xs py-4 text-center">No se encontraron artículos.</CommandEmpty>
                                                <CommandGroup>
                                                    {(products || []).filter(p => !p.isCombo).map(p => {
                                                        const inForm = reservedParts.find(rp => rp.productId === p.id);
                                                        const qtyInForm = inForm ? inForm.quantity : 0;
                                                        const originalInDB = repairJob?.reservedParts?.find(rp => rp.productId === p.id)?.quantity || 0;
                                                        const available = (p.stockLevel - (p.reservedStock || 0)) + originalInDB;
                                                        
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
                                <p className="text-[10px] text-center text-slate-400 py-4 italic">No se han añadido piezas a este presupuesto.</p>
                            ) : (
                                reservedParts.map((part) => {
                                    const pData = products?.find(prod => prod.id === part.productId);
                                    const price = part.isPromo && pData?.promoPrice ? pData.promoPrice : getFinalPrice(pData || { costPrice: part.costPrice } as Product);
                                    
                                    return (
                                        <div key={part.productId} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white shadow-sm text-xs">
                                            <div className="flex flex-col">
                                                <span className="font-bold uppercase text-slate-700">{part.productName}</span>
                                                <span className="text-[9px] text-muted-foreground font-medium">CANT: {part.quantity} x ${price.toFixed(2)}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {part.isPromo && <Badge className="h-4 text-[8px] bg-blue-600 font-bold">OFERTA</Badge>}
                                                {!repairJob?.isPaid && (
                                                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/5" onClick={() => handleRemovePart(part.productId)}>
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="pt-2">
                        <div className="p-5 rounded-xl bg-slate-900 text-white space-y-2 shadow-xl border-t-4 border-primary">
                            <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                <span>Presupuesto Estimado:</span>
                                <span>${estimatedTotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-green-400 font-bold uppercase tracking-wider">
                                <span>Abono Total Recibido:</span>
                                <span>-${currentPaid.toFixed(2)}</span>
                            </div>
                            <div className="border-t border-white/10 pt-3 mt-1 flex justify-between items-end">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Saldo Pendiente por Cobrar</span>
                                    <span className="text-[9px] text-slate-500 font-medium">Equivalente aprox: Bs {formatCurrency(currentPending * bcvRate)}</span>
                                </div>
                                <span className="text-3xl font-black text-primary leading-none tabular-nums">${currentPending.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <FormField control={form.control} name="notes" render={({field}) => (
                        <FormItem className="space-y-1">
                            <FormLabel className="text-[10px] font-bold uppercase text-slate-400">Observaciones Técnicas / Notas</FormLabel>
                            <FormControl>
                                <Textarea placeholder="EJ: RAYONES EN TAPA TRASERA, SIN BANDEJA SIM..." {...field} className="resize-none text-xs h-16 uppercase bg-white" />
                            </FormControl>
                        </FormItem>
                    )} />
                </div>

                <div className="p-4 border-t bg-slate-100 flex gap-3">
                    <DialogFooter className="w-full sm:flex-row flex-col gap-2">
                        <Button type="submit" disabled={isSubmitting} className="flex-1 h-11 text-xs font-black uppercase tracking-widest shadow-lg">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : (repairJob ? "GUARDAR CAMBIOS" : "REGISTRAR E IMPRIMIR")}
                        </Button>
                    </DialogFooter>
                </div>
            </form>
        </Form>

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
                            productName: updatedProd.name,
                            quantity: 1,
                            costPrice: updatedProd.costPrice,
                            isPromo: false
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
