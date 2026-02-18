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
import { useState, useEffect, useMemo, ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useCurrency } from "@/hooks/use-currency";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { useFirebase, useCollection, useMemoFirebase } from "@/firebase";
import { collection, doc, runTransaction } from "firebase/firestore";
import { handlePrintAllTickets } from "./repair-ticket";
import { DollarSign, Landmark, CreditCard, Smartphone, Banknote, Search, PlusCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ProductFormDialog } from "../inventory/product-form-dialog";

const repairStatuses: RepairStatus[] = ['Pendiente', 'Pagado', 'Completado'];
const paymentMethodOptions = [
    { value: 'Efectivo USD', label: 'Efectivo USD', icon: <DollarSign className="w-4 h-4"/>, isBs: false },
    { value: 'Efectivo Bs', label: 'Efectivo Bs', icon: <Landmark className="w-4 h-4"/>, isBs: true },
    { value: 'Tarjeta', label: 'Tarjeta', icon: <CreditCard className="w-4 h-4"/>, isBs: true },
    { value: 'Pago Móvil', label: 'Pago Móvil', icon: <Smartphone className="w-4 h-4"/>, isBs: true },
    { value: 'Transferencia', label: 'Transferencia', icon: <Banknote className="w-4 h-4"/>, isBs: true },
];

const formSchema = z.object({
  customerName: z.string().min(2, "Obligatorio"),
  customerPhone: z.string().min(10, "Inválido"),
  customerID: z.string().optional(),
  deviceMake: z.string().min(2, "Obligatorio"),
  deviceModel: z.string().min(1, "Obligatorio"),
  deviceImei: z.string().optional(),
  reportedIssue: z.string().min(5, "Obligatorio"),
  estimatedCost: z.coerce.number().min(0),
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
  const { getSymbol, format: formatCurrency, convert, getDynamicPrice } = useCurrency();
  const [mainPart, setMainPart] = useState<Product | null>(null);

  const productsCollection = useMemoFirebase(() => 
    (firestore && user) ? collection(firestore, 'users', user.uid, 'products') : null, 
    [firestore, user?.uid]
  );
  const { data: products } = useCollection<Product>(productsCollection);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { customerName: "", status: "Pendiente", estimatedCost: 0, reservedParts: [] }
  });

  useEffect(() => {
    if (open) {
        if (repairJob) {
            form.reset({ ...repairJob, hasNewAbono: false, newAbonoAmount: 0 });
            if (repairJob.reservedParts?.[0] && products) {
                setMainPart(products.find(p => p.id === repairJob.reservedParts![0].productId) || null);
            }
        } else {
            form.reset({ status: "Pendiente", estimatedCost: 0, reservedParts: [] });
            setMainPart(null);
        }
    }
  }, [repairJob, open, products]);

  useEffect(() => {
    if (mainPart) {
        const price = getDynamicPrice(mainPart.costPrice);
        form.setValue('estimatedCost', price);
        form.setValue('reservedParts', [{ productId: mainPart.id!, productName: mainPart.name, quantity: 1, costPrice: mainPart.costPrice }]);
    }
  }, [mainPart, getDynamicPrice]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!firestore || !user) return;

    try {
        const result = await runTransaction(firestore, async (transaction) => {
            const jobId = repairJob?.id || `R-${format(new Date(), "yyMMdd")}-${Math.floor(1000 + Math.random() * 9000)}`;
            const jobRef = doc(firestore, 'users', user.uid, 'repair_jobs', jobId);

            // Manejo de stock simplificado
            if (mainPart) {
                const pRef = doc(firestore, 'users', user.uid, 'products', mainPart.id!);
                const pDoc = await transaction.get(pRef);
                if (pDoc.exists()) {
                    const data = pDoc.data() as Product;
                    transaction.update(pRef, { reservedStock: (data.reservedStock || 0) + 1 });
                }
            }

            let newPaid = repairJob?.amountPaid || 0;
            if (values.hasNewAbono && values.newAbonoAmount) {
                const opt = paymentMethodOptions.find(o => o.value === values.newAbonoPaymentMethod);
                const amtUSD = opt?.isBs ? convert(values.newAbonoAmount, 'Bs', 'USD') : values.newAbonoAmount;
                newPaid += amtUSD;
                
                const saleRef = doc(collection(firestore, 'users', user.uid, 'sale_transactions'));
                transaction.set(saleRef, {
                    id: saleRef.id, repairJobId: jobId, totalAmount: amtUSD, status: 'completed',
                    transactionDate: new Date().toISOString(), payments: [{ method: values.newAbonoPaymentMethod, amount: values.newAbonoAmount }]
                });
            }

            const finalData = { ...values, id: jobId, amountPaid: newPaid, isPaid: newPaid >= values.estimatedCost, createdAt: repairJob?.createdAt || new Date().toISOString() };
            transaction.set(jobRef, finalData, { merge: true });
            return finalData;
        });

        toast({ title: "Guardado exitosamente" });
        if (!repairJob) handlePrintAllTickets({ repairJob: result as RepairJob }, () => {});
        setOpen(false);
    } catch (e: any) {
        toast({ variant: "destructive", title: "Error", description: e.message });
    }
  }

  return (
    <Form {...form}>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>Registro de Reparación</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="customerName" render={({field}) => <FormItem><FormLabel>Cliente</FormLabel><Input {...field}/></FormItem>} />
                <FormField control={form.control} name="customerPhone" render={({field}) => <FormItem><FormLabel>Teléfono</FormLabel><Input {...field}/></FormItem>} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="deviceMake" render={({field}) => <FormItem><FormLabel>Marca</FormLabel><Input {...field}/></FormItem>} />
                <FormField control={form.control} name="deviceModel" render={({field}) => <FormItem><FormLabel>Modelo</FormLabel><Input {...field}/></FormItem>} />
            </div>
            <FormField control={form.control} name="reportedIssue" render={({field}) => <FormItem><FormLabel>Falla</FormLabel><Textarea {...field}/></FormItem>} />
            
            <div className="p-3 border rounded-md bg-muted/20">
                <Label>Pieza Principal</Label>
                <div className="flex gap-2 mt-1">
                    <Popover open={partsPopoverOpen} onOpenChange={setPartsPopoverOpen}>
                        <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start"><Search className="mr-2 h-4 w-4"/> {mainPart?.name || "Seleccionar..."}</Button></PopoverTrigger>
                        <PopoverContent className="p-0"><Command><CommandInput placeholder="Buscar..."/><CommandList><CommandEmpty>No hay stock</CommandEmpty><CommandGroup>
                            {products?.map(p => <CommandItem key={p.id} onSelect={() => {setMainPart(p); setPartsPopoverOpen(false)}}>{p.name}</CommandItem>)}
                        </CommandGroup></CommandList></Command></PopoverContent>
                    </Popover>
                    <ProductFormDialog><Button variant="outline" size="icon"><PlusCircle className="h-4 w-4"/></Button></ProductFormDialog>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 items-end">
                <FormField control={form.control} name="estimatedCost" render={({field}) => <FormItem><FormLabel>Costo Estimado ($)</FormLabel><Input type="number" {...field}/></FormItem>} />
                <FormField control={form.control} name="status" render={({field}) => <FormItem><Select onValueChange={field.onChange} value={field.value}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{repairStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></FormItem>} />
            </div>

            <DialogFooter><Button type="submit">Guardar e Imprimir</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </Form>
  );
}