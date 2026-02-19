
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
import type { RepairJob, RepairStatus, Product, PaymentMethod } from "@/lib/types";
import { useState, useEffect, ReactNode, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useCurrency } from "@/hooks/use-currency";
import { Label } from "../ui/label";
import { useFirebase, useCollection, useMemoFirebase } from "@/firebase";
import { collection, doc, runTransaction } from "firebase/firestore";
import { handlePrintAllTickets } from "./repair-ticket";
import { DollarSign, Landmark, CreditCard, Smartphone, Banknote, Search, PlusCircle, CheckCircle2, AlertCircle, ArrowRightLeft } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { format } from "date-fns";
import { ProductFormDialog } from "../inventory/product-form-dialog";
import { Checkbox } from "../ui/checkbox";
import { cn } from "@/lib/utils";

const repairStatuses: RepairStatus[] = ['Pendiente', 'Pagado', 'Completado'];
const paymentMethodOptions: { value: PaymentMethod, label: string, icon: ReactNode, isBs: boolean }[] = [
    { value: 'Efectivo USD', label: 'Efectivo USD', icon: <DollarSign className="w-4 h-4"/>, isBs: false },
    { value: 'Efectivo Bs', label: 'Efectivo Bs', icon: <Landmark className="w-4 h-4"/>, isBs: true },
    { value: 'Tarjeta', label: 'Tarjeta', icon: <CreditCard className="w-4 h-4"/>, isBs: true },
    { value: 'Pago Móvil', label: 'Pago Móvil', icon: <Smartphone className="w-4 h-4"/>, isBs: true },
    { value: 'Transferencia', label: 'Transferencia', icon: <Banknote className="w-4 h-4"/>, isBs: true },
];

const formSchema = z.object({
  customerName: z.string().min(2, "Nombre obligatorio"),
  customerPhone: z.string().min(10, "Teléfono inválido"),
  customerID: z.string().min(5, "Cédula requerida"),
  customerAddress: z.string().optional(),
  deviceMake: z.string().min(2, "Marca obligatoria"),
  deviceModel: z.string().min(1, "Modelo obligatorio"),
  reportedIssue: z.string().min(5, "Detalla la falla del equipo"),
  estimatedCost: z.coerce.number().min(0, "Costo debe ser positivo"),
  status: z.enum(repairStatuses),
  notes: z.string().optional(),
  reservedParts: z.array(z.any()).optional(),
  hasNewAbono: z.boolean().optional(),
  newAbonoAmount: z.coerce.number().optional(),
  newAbonoPaymentMethod: z.string().optional(),
  newAbonoReference: z.string().optional(),
});

export function RepairFormDialog({ repairJob, children }: { repairJob?: RepairJob | null, children: ReactNode }) {
  const { firestore, user } = useFirebase();
  const [open, setOpen] = useState(false);
  const [partsPopoverOpen, setPartsPopoverOpen] = useState(false);
  const { toast } = useToast();
  const { convert, getFinalPrice, format: formatCurrency, getSymbol, bcvRate } = useCurrency();
  const [mainPart, setMainPart] = useState<Product | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const productsCollection = useMemoFirebase(() => 
    (firestore && user) ? collection(firestore, 'users', user.uid, 'products') : null, 
    [firestore, user?.uid]
  );
  const { data: products } = useCollection<Product>(productsCollection);

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
        hasNewAbono: false,
        newAbonoAmount: 0,
        newAbonoPaymentMethod: "Efectivo USD",
        newAbonoReference: ""
    }
  });

  useEffect(() => {
    if (open) {
        if (repairJob) {
            form.reset({ 
                ...repairJob, 
                hasNewAbono: false, 
                newAbonoAmount: 0,
                customerID: repairJob.customerID || "",
                customerAddress: repairJob.customerAddress || ""
            });
            if (repairJob.reservedParts?.[0] && products) {
                setMainPart(products.find(p => p.id === repairJob.reservedParts![0].productId) || null);
            }
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
                hasNewAbono: false,
                newAbonoAmount: 0,
                newAbonoPaymentMethod: "Efectivo USD",
                newAbonoReference: ""
            });
            setMainPart(null);
        }
    }
  }, [repairJob, open, products, form]);

  const handlePartSelect = (p: Product) => {
      setMainPart(p);
      const price = getFinalPrice(p);
      form.setValue('estimatedCost', price, { shouldValidate: true });
      form.setValue('reservedParts', [{ productId: p.id!, productName: p.name, quantity: 1, costPrice: p.costPrice }], { shouldValidate: true });
      setPartsPopoverOpen(false);
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

            if (!repairJob?.isPaid) {
                if (!repairJob && newPartId) {
                    const pRef = doc(firestore, 'users', user.uid, 'products', newPartId);
                    const pDoc = await transaction.get(pRef);
                    if (pDoc.exists()) {
                        transaction.update(pRef, { reservedStock: (pDoc.data().reservedStock || 0) + 1 });
                    }
                } 
                else if (repairJob && oldPartId !== newPartId) {
                    if (oldPartId) {
                        const oldRef = doc(firestore, 'users', user.uid, 'products', oldPartId);
                        const oldDoc = await transaction.get(oldRef);
                        if (oldDoc.exists()) {
                            transaction.update(oldRef, { reservedStock: Math.max(0, (oldDoc.data().reservedStock || 0) - 1) });
                        }
                    }
                    if (newPartId) {
                        const newRef = doc(firestore, 'users', user.uid, 'products', newPartId);
                        const newDoc = await transaction.get(newRef);
                        if (newDoc.exists()) {
                            transaction.update(newRef, { reservedStock: (newDoc.data().reservedStock || 0) + 1 });
                        }
                    }
                }
            }

            let newPaidTotal = repairJob?.amountPaid || 0;
            if (values.hasNewAbono && values.newAbonoAmount && values.newAbonoAmount > 0) {
                const opt = paymentMethodOptions.find(o => o.value === values.newAbonoPaymentMethod);
                const amtUSD = opt?.isBs ? convert(values.newAbonoAmount, 'Bs', 'USD') : values.newAbonoAmount;
                newPaidTotal += amtUSD;
                
                const saleRef = doc(collection(firestore, 'users', user.uid, 'sale_transactions'));
                transaction.set(saleRef, {
                    id: saleRef.id, 
                    repairJobId: jobId, 
                    totalAmount: amtUSD, 
                    subtotal: amtUSD,
                    discount: 0,
                    status: 'completed',
                    transactionDate: new Date().toISOString(), 
                    paymentMethod: values.newAbonoPaymentMethod,
                    payments: [{ 
                        method: values.newAbonoPaymentMethod as PaymentMethod, 
                        amount: values.newAbonoAmount, 
                        reference: values.newAbonoReference 
                    }],
                    items: [{ 
                        productId: `abono-${jobId}`, 
                        name: `Abono Reparación: ${values.deviceMake} ${values.deviceModel}`, 
                        quantity: 1, 
                        price: amtUSD 
                    }]
                });
            }

            const isNowFullyPaid = newPaidTotal >= (values.estimatedCost - 0.01);
            const wasCompleted = repairJob?.status === 'Completado';
            
            const finalData = { 
                ...values, 
                id: jobId, 
                amountPaid: Number(newPaidTotal.toFixed(2)), 
                isPaid: isNowFullyPaid, 
                createdAt: repairJob?.createdAt || new Date().toISOString(),
                status: (isNowFullyPaid && !wasCompleted) ? 'Pagado' : values.status
            };
            
            transaction.set(jobRef, finalData, { merge: true });
            return finalData;
        });

        toast({ title: "Registro actualizado" });
        if (!repairJob) {
            handlePrintAllTickets({ repairJob: result as RepairJob }, () => {});
        }
        setOpen(false);
    } catch (e: any) {
        toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
        setIsSubmitting(false);
    }
  }

  const currentPaid = repairJob?.amountPaid || 0;
  const currentTotal = form.watch('estimatedCost') || 0;
  const currentPending = Math.max(0, currentTotal - currentPaid);

  const abonoAmount = form.watch('newAbonoAmount') || 0;
  const abonoMethodValue = form.watch('newAbonoPaymentMethod');
  const selectedMethod = paymentMethodOptions.find(o => o.value === abonoMethodValue);
  
  const abonoInfo = useMemo(() => {
      if (!abonoAmount || abonoAmount <= 0) return null;
      
      const isBs = selectedMethod?.isBs;
      const inBs = isBs ? abonoAmount : abonoAmount * bcvRate;
      const inUSD = isBs ? abonoAmount / bcvRate : abonoAmount;
      const newPendingAfterAbono = Math.max(0, currentPending - inUSD);

      return { inBs, inUSD, isBs, newPendingAfterAbono };
  }, [abonoAmount, selectedMethod, bcvRate, currentPending]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-xl" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
                {repairJob ? 'Detalles de Reparación' : 'Nuevo Registro de Reparación'}
                {repairJob?.isPaid && <CheckCircle2 className="w-5 h-5 text-green-500" />}
            </DialogTitle>
            <DialogDescription>Gestión técnica y de cobros del equipo.</DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[75vh] overflow-y-auto px-1 pr-3">
              <div className="space-y-4 p-3 border rounded-md bg-muted/5">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Datos del Cliente</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="customerName" render={({field}) => <FormItem><FormLabel>Nombre y Apellido</FormLabel><Input placeholder="Ej: Juan Perez" {...field}/><FormMessage /></FormItem>} />
                      <FormField control={form.control} name="customerID" render={({field}) => <FormItem><FormLabel>Cédula / RIF</FormLabel><Input placeholder="V-12345678" {...field}/><FormMessage /></FormItem>} />
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
                  <FormField control={form.control} name="reportedIssue" render={({field}) => <FormItem><FormLabel>Falla Reportada</FormLabel><Textarea placeholder="Ej: Pantalla partida, no carga..." {...field} className="resize-none" /></FormItem>} />
              </div>
              
              <div className="p-3 border rounded-md bg-muted/20">
                  <Label className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-bold uppercase text-muted-foreground">Pieza Principal (Inventario)</span>
                  </Label>
                  <div className="flex gap-2">
                      <Popover open={partsPopoverOpen} onOpenChange={setPartsPopoverOpen}>
                          <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start overflow-hidden text-ellipsis whitespace-nowrap bg-background">
                                  <Search className="mr-2 h-4 w-4 shrink-0 opacity-50"/> {mainPart?.name || "Vincular pieza del inventario..."}
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
                                                      onSelect={() => canSelect && handlePartSelect(p)}
                                                      disabled={!canSelect}
                                                      className={cn("flex justify-between items-center", !canSelect && "opacity-50 cursor-not-allowed")}
                                                  >
                                                      <div className="flex flex-col flex-1">
                                                          <span className="font-medium">{p.name}</span>
                                                          <span className="text-[10px] text-muted-foreground">
                                                              {available <= 0 && !isCurrentlySelected ? (
                                                                  <span className="text-destructive font-bold">SIN STOCK DISPONIBLE</span>
                                                              ) : (
                                                                  <span>Disponible: {available} | Ref: ${getFinalPrice(p)}</span>
                                                              )}
                                                          </span>
                                                      </div>
                                                      {!canSelect && <AlertCircle className="w-3 h-3 text-destructive" />}
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

              <div className="grid grid-cols-2 gap-4 items-end">
                  <FormField control={form.control} name="estimatedCost" render={({field}) => (
                      <FormItem>
                          <FormLabel>Costo Estimado ($)</FormLabel>
                          <div className="relative">
                              <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input type="number" step="0.01" {...field} className="pl-8" />
                          </div>
                          <FormMessage />
                      </FormItem>
                  )} />
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
              </div>

              {(!repairJob || currentPending > 0.01) && (
                  <div className={cn("space-y-4 p-3 border rounded-md transition-colors", form.watch('hasNewAbono') ? "bg-primary/5 border-primary/20" : "bg-muted/10")}>
                      <div className="flex items-center space-x-2">
                          <Checkbox 
                              id="has-abono" 
                              checked={form.watch('hasNewAbono')} 
                              onCheckedChange={(val) => form.setValue('hasNewAbono', !!val)}
                          />
                          <Label htmlFor="has-abono" className="cursor-pointer font-bold text-sm">
                              {repairJob ? 'Registrar Pago o Abono Adicional' : 'Registrar Pago o Abono Inicial'}
                          </Label>
                      </div>
                      
                      <div className="flex items-center justify-between text-[11px] bg-white p-2 rounded border border-slate-200">
                          <div className="flex flex-col">
                              <span className="text-muted-foreground">Ya Pagado:</span>
                              <strong className="text-green-600">${currentPaid.toFixed(2)}</strong>
                          </div>
                          <div className="text-right flex flex-col items-end">
                              <span className="text-primary font-bold uppercase tracking-tighter">Saldo Pendiente</span>
                              <span className="text-lg font-black leading-none">${currentPending.toFixed(2)}</span>
                              <span className="text-[10px] text-muted-foreground font-bold mt-0.5">Bs {formatCurrency(currentPending * bcvRate)}</span>
                          </div>
                      </div>
                      
                      {form.watch('hasNewAbono') && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 pt-2">
                              <div className="space-y-2">
                                  <Label className="text-xs">Monto a Recibir ({selectedMethod?.isBs ? 'Bs' : '$'})</Label>
                                  <Input 
                                      type="number" 
                                      step="0.01" 
                                      placeholder="0.00" 
                                      {...form.register('newAbonoAmount')}
                                      autoFocus
                                  />
                              </div>
                              <div className="space-y-2">
                                  <Label className="text-xs">Método de Pago</Label>
                                  <Select 
                                      onValueChange={(val) => form.setValue('newAbonoPaymentMethod', val)}
                                      defaultValue="Efectivo USD"
                                  >
                                      <SelectTrigger className="h-10">
                                          <SelectValue placeholder="Seleccionar..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                          {paymentMethodOptions.map(opt => (
                                              <SelectItem key={opt.value} value={opt.value}>
                                                  <div className="flex items-center gap-2">{opt.icon} {opt.label}</div>
                                              </SelectItem>
                                          ))}
                                      </SelectContent>
                                  </Select>
                              </div>

                              {abonoInfo && (
                                  <div className="md:col-span-2 space-y-3 p-3 bg-white border border-primary/20 rounded-lg shadow-sm">
                                      <div className="flex items-center justify-between">
                                          <div className="flex flex-col">
                                              <span className="text-[10px] text-muted-foreground uppercase font-bold">Recibiendo</span>
                                              <div className="flex items-center gap-2">
                                                  <span className="text-lg font-black text-primary leading-none">
                                                      {abonoInfo.isBs ? 'Bs' : '$'} {formatCurrency(abonoAmount)}
                                                  </span>
                                                  <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
                                                  <span className="text-sm font-bold text-slate-600">
                                                      {abonoInfo.isBs ? '$' : 'Bs'} {formatCurrency(abonoInfo.isBs ? abonoInfo.inUSD : abonoInfo.inBs)}
                                                  </span>
                                              </div>
                                          </div>
                                          <div className="text-right flex flex-col items-end">
                                              <span className="text-[10px] text-muted-foreground uppercase font-bold">Nuevo Saldo</span>
                                              <span className={cn("text-lg font-black leading-none", abonoInfo.newPendingAfterAbono <= 0.01 ? "text-green-600" : "text-primary")}>
                                                  ${formatCurrency(abonoInfo.newPendingAfterAbono)}
                                              </span>
                                          </div>
                                      </div>
                                      {abonoInfo.newPendingAfterAbono <= 0.01 && (
                                          <div className="text-[9px] font-bold text-green-700 bg-green-50 p-1.5 rounded flex items-center gap-1.5 border border-green-100">
                                              <CheckCircle2 className="w-3 h-3" /> SALDO TOTALMENTE CANCELADO CON ESTE PAGO
                                          </div>
                                      )}
                                  </div>
                              )}

                              <div className="md:col-span-2 space-y-2">
                                  <Label className="text-xs">Referencia / Notas del Pago</Label>
                                  <Input placeholder="Número de confirmación, banco, etc." {...form.register('newAbonoReference')} />
                              </div>
                          </div>
                      )}
                  </div>
              )}

              <DialogFooter className="gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                  <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "Guardando..." : (repairJob ? "Guardar Cambios" : "Registrar e Imprimir")}
                  </Button>
              </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
