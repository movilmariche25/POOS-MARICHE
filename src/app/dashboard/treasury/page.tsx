
"use client";

import { PageHeader } from "@/components/page-header";
import { useCollection, useFirebase, useMemoFirebase, setDocumentNonBlocking } from "@/firebase";
import { collection, doc } from "firebase/firestore";
import type { Sale, Product, RepairJob, Loan, CurrencyExchange, PaymentMethod } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useMemo } from "react";
import { format, startOfDay, endOfDay, isWithinInterval, addWeeks, isAfter, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useCurrency } from "@/hooks/use-currency";
import { 
    CalendarIcon, TrendingUp, ShoppingBag, Home, Users, Wallet, Settings2, Save, Banknote, HandCoins, HandHelping, PieChart, Rocket, ArrowRightCircle, Info, Landmark, ArrowRightLeft, DollarSign, Smartphone, CreditCard, RefreshCcw
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip as ChartTooltip, CartesianGrid } from "recharts";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { SecurityGate } from "@/components/security-gate";
import Link from "next/link";

const methodIcons: Record<string, any> = {
    'Efectivo Bs': Landmark,
    'Tarjeta / Pago Móvil': CreditCard,
    'Transferencia': Banknote,
};

export default function TreasuryPage() {
    return (
        <SecurityGate module="treasury">
            <TreasuryContent />
        </SecurityGate>
    );
}

function TreasuryContent() {
    const { firestore, user } = useFirebase();
    const { format: formatCurrency, getSymbol, settings, bcvRate, convert } = useCurrency();
    const { toast } = useToast();
    
    const [date, setDate] = useState<DateRange | undefined>({
        from: startOfDay(new Date()),
        to: endOfDay(new Date()),
    });

    const [localRent, setLocalRent] = useState<number | null>(null);
    const [localInvPerc, setLocalInvPercent] = useState<number | null>(null);
    const [localPartners, setLocalPartners] = useState<number | null>(null);
    const [isSaving, setIsSubmitting] = useState(false);

    const [usdSplit, setUsdSplit] = useState<number | string>("");

    const currentRent = localRent !== null ? localRent : (settings?.weeklyRent ?? 40);
    const currentInvPercent = localInvPerc !== null ? localInvPerc : (settings?.investmentPercentage ?? 30);
    const currentPartners = localPartners !== null ? localPartners : (settings?.partnersCount ?? 2);

    const salesCollection = useMemoFirebase(() => 
        (firestore && user) ? collection(firestore, "users", user.uid, "sale_transactions") : null, 
        [firestore, user?.uid]
    );
    const { data: sales, isLoading: salesLoading } = useCollection<Sale>(salesCollection);

    const productsCollection = useMemoFirebase(() => 
        (firestore && user) ? collection(firestore, "users", user.uid, "products") : null, 
        [firestore, user?.uid]
    );
    const { data: products, isLoading: productsLoading } = useCollection<Product>(productsCollection);

    const repairJobsCollection = useMemoFirebase(() =>
        (firestore && user) ? collection(firestore, "users", user.uid, "repair_jobs") : null,
        [firestore, user?.uid]
    );
    const { data: repairJobs, isLoading: repairsLoading } = useCollection<RepairJob>(repairJobsCollection);

    const exchangeCollection = useMemoFirebase(() => 
        (firestore && user) ? collection(firestore, "users", user.uid, "currency_exchanges") : null,
        [firestore, user?.uid]
    );
    const { data: exchanges, isLoading: exchangesLoading } = useCollection<CurrencyExchange>(exchangeCollection);

    const payrollCollection = useMemoFirebase(() => 
        (firestore && user) ? collection(firestore, "users", user.uid, "payroll_payments") : null, 
        [firestore, user?.uid]
    );
    const { data: payroll } = useCollection<PayrollPayment>(payrollCollection);

    const loansCollection = useMemoFirebase(() => 
        (firestore && user) ? collection(firestore, "users", user.uid, "loans") : null, 
        [firestore, user?.uid]
    );
    const { data: loans } = useCollection<Loan>(loansCollection);

    const expensesCollection = useMemoFirebase(() => 
        (firestore && user) ? collection(firestore, "users", user.uid, "expenses") : null, 
        [firestore, user?.uid]
    );
    const { data: expenses } = useCollection<Expense>(expensesCollection);

    // SALDO REAL (CONSOLIDADO DESDE EL ÚLTIMO PUNTO DE CONTROL)
    const walletBalance = useMemo(() => {
        if (!sales || !settings) return { usd: 0, bsAvailable: 0, breakdown: {}, lastReset: null };

        const resetDate = settings.balancesUpdatedAt ? parseISO(settings.balancesUpdatedAt) : new Date(0);

        const breakdown: Record<string, number> = {
            'Efectivo Bs': settings.initialBalances?.['Efectivo Bs'] || 0,
            'Tarjeta / Pago Móvil': settings.initialBalances?.['Tarjeta / Pago Móvil'] || 0,
            'Transferencia': settings.initialBalances?.['Transferencia'] || 0
        };
        let usdBalance = settings.initialBalances?.['Efectivo USD'] || 0;

        const filterByReset = (dateStr: string) => isAfter(parseISO(dateStr), resetDate);

        sales.forEach(s => {
            if (s.status !== 'completed' || !s.transactionDate || !filterByReset(s.transactionDate)) return;
            s.payments.forEach(p => {
                if (p.method === 'Efectivo USD') usdBalance += p.amount;
                else if (p.method === 'Efectivo Bs') breakdown['Efectivo Bs'] += p.amount;
                else if (p.method === 'Tarjeta' || p.method === 'Pago Móvil' || p.method === 'Tarjeta / Pago Móvil') {
                    breakdown['Tarjeta / Pago Móvil'] += p.amount;
                } else if (p.method === 'Transferencia') {
                    breakdown['Transferencia'] += p.amount;
                }
            });
            s.changeGiven?.forEach(c => {
                if (c.method === 'Efectivo USD') usdBalance -= c.amount;
                else if (c.method === 'Efectivo Bs') breakdown['Efectivo Bs'] -= c.amount;
                else if (c.method === 'Tarjeta' || c.method === 'Pago Móvil' || c.method === 'Tarjeta / Pago Móvil') {
                    breakdown['Tarjeta / Pago Móvil'] -= c.amount;
                } else if (c.method === 'Transferencia') {
                    breakdown['Transferencia'] -= c.amount;
                }
            });
        });

        (exchanges || []).forEach(e => {
            if (!filterByReset(e.createdAt)) return;
            usdBalance += e.usdAmount;
            if (e.sourceMethod === 'Tarjeta' || e.sourceMethod === 'Pago Móvil' || e.sourceMethod === 'Tarjeta / Pago Móvil') {
                breakdown['Tarjeta / Pago Móvil'] -= e.bsAmount;
            } else if (breakdown[e.sourceMethod] !== undefined) {
                breakdown[e.sourceMethod] -= e.bsAmount;
            }
        });

        (payroll || []).forEach(p => {
            if (!filterByReset(p.createdAt)) return;
            if (p.amountUSD > 0) usdBalance -= p.amountUSD;
            if (p.amountBs > 0) {
                const method = p.methodBs || 'Tarjeta / Pago Móvil';
                if (breakdown[method] !== undefined) breakdown[method] -= p.amountBs;
                else breakdown['Tarjeta / Pago Móvil'] -= p.amountBs;
            }
        });

        (loans || []).forEach(l => {
            if (!filterByReset(l.createdAt)) return;
            if (l.currency === 'USD') usdBalance -= l.totalAmount;
            else {
                const method = l.sourceMethod || 'Transferencia';
                if (breakdown[method] !== undefined) breakdown[method] -= l.totalAmount;
                else breakdown['Transferencia'] -= l.totalAmount;
            }
        });

        (expenses || []).forEach(ex => {
            if (!filterByReset(ex.createdAt)) return;
            if (ex.amountUSD > 0) usdBalance -= ex.amountUSD;
            if (ex.amountBs > 0) {
                const method = ex.methodBs || 'Tarjeta / Pago Móvil';
                if (breakdown[method] !== undefined) breakdown[method] -= ex.amountBs;
                else breakdown['Tarjeta / Pago Móvil'] -= ex.amountBs;
            }
        });

        return {
            usd: usdBalance,
            breakdown,
            bsAvailable: Object.values(breakdown).reduce((a, b) => a + b, 0),
            lastReset: settings.balancesUpdatedAt ? parseISO(settings.balancesUpdatedAt) : null
        };
    }, [sales, exchanges, payroll, loans, expenses, settings]);

    const cashBoxStatus = useMemo(() => {
        if (!sales || !settings || !date?.from) return { usdTotal: 0, bsAvailable: 0, breakdown: {} };

        const from = startOfDay(date.from);
        const to = date.to ? endOfDay(date.to) : endOfDay(date.from);

        const breakdown: Record<string, number> = { 'Efectivo Bs': 0, 'Tarjeta / Pago Móvil': 0, 'Transferencia': 0 };
        let usdAccumulated = 0;

        sales.filter(s => {
            if (s.status !== 'completed' || !s.transactionDate) return false;
            return isWithinInterval(new Date(s.transactionDate), { start: from, end: to });
        }).forEach(s => {
            s.payments.forEach(p => {
                if (p.method === 'Efectivo USD') usdAccumulated += p.amount;
                else if (p.method === 'Efectivo Bs') breakdown['Efectivo Bs'] += p.amount;
                else if (p.method === 'Tarjeta' || p.method === 'Pago Móvil' || p.method === 'Tarjeta / Pago Móvil') {
                    breakdown['Tarjeta / Pago Móvil'] += p.amount;
                } else if (p.method === 'Transferencia') {
                    breakdown['Transferencia'] += p.amount;
                }
            });
            s.changeGiven?.forEach(c => {
                if (c.method === 'Efectivo USD') usdAccumulated -= c.amount;
                else if (c.method === 'Efectivo Bs') breakdown['Efectivo Bs'] -= c.amount;
                else if (c.method === 'Tarjeta' || c.method === 'Pago Móvil' || c.method === 'Tarjeta / Pago Móvil') {
                    breakdown['Tarjeta / Pago Móvil'] -= c.amount;
                } else if (c.method === 'Transferencia') {
                    breakdown['Transferencia'] -= c.amount;
                }
            });
        });

        (exchanges || []).filter(e => {
            const eDate = new Date(e.createdAt);
            return isWithinInterval(eDate, { start: from, end: to });
        }).forEach(e => {
            usdAccumulated += e.usdAmount;
            if (e.sourceMethod === 'Tarjeta' || e.sourceMethod === 'Pago Móvil' || e.sourceMethod === 'Tarjeta / Pago Móvil') {
                breakdown['Tarjeta / Pago Móvil'] -= e.bsAmount;
            } else if (breakdown[e.sourceMethod] !== undefined) {
                breakdown[e.sourceMethod] -= e.bsAmount;
            }
        });

        return { usdTotal: usdAccumulated, breakdown, bsAvailable: Object.values(breakdown).reduce((a, b) => a + b, 0) };
    }, [sales, exchanges, settings, date]);

    const stats = useMemo(() => {
        if (!date?.from || !sales || !repairJobs || !products) return { V: 0, C: 0, G: 0, investment: 0, salary: 0, totalMerchandise: 0, perPartner: 0, projectionData: [] };
        const from = startOfDay(date.from);
        const to = endOfDay(date.to || date.from);
        const filteredSales = sales.filter(s => s.status === 'completed' && s.transactionDate && isWithinInterval(new Date(s.transactionDate), { start: from, end: to }));
        const V = filteredSales.reduce((sum, s) => sum + (s.actualPaidAmount ?? s.totalAmount), 0);
        let C = 0; const involvedRepairs = new Set<string>();
        filteredSales.forEach(sale => {
            sale.items.forEach(item => {
                if (item.isRepair || sale.repairJobId) involvedRepairs.add(sale.repairJobId || item.productId);
                else if (item.isCustom) C += (item.customCostPrice || 0) * item.quantity;
                else { const p = products.find(prod => prod.id === item.productId); C += (p?.costPrice || 0) * item.quantity; }
            });
        });
        involvedRepairs.forEach(rid => {
            const repair = repairJobs.find(rj => rj.id === rid);
            if (repair && repair.reservedParts) C += repair.reservedParts.reduce((sum, p) => sum + (p.costPrice * p.quantity), 0);
        });
        const G = Math.max(0, V - C - currentRent);
        const investment = G * (currentInvPercent / 100);
        const salary = G * (1 - currentInvPercent / 100);
        const totalMerchandise = C + investment;
        const perPartner = currentPartners > 0 ? salary / currentPartners : 0;
        const projectionData = Array.from({ length: 13 }).map((_, i) => ({ name: format(addWeeks(new Date(), i), "dd MMM", { locale: es }), capital: investment * i }));
        return { V, C, G, investment, salary, totalMerchandise, perPartner, projectionData };
    }, [date, sales, products, repairJobs, currentRent, currentInvPercent, currentPartners]);

    const remainingBs = useMemo(() => {
        const usdVal = Number(usdSplit) || 0;
        return Math.max(0, stats.perPartner - usdVal) * bcvRate;
    }, [usdSplit, stats.perPartner, bcvRate]);

    const handleSaveConfig = async () => {
        if (!firestore || !user) return;
        setIsSubmitting(true);
        try {
            const ref = doc(firestore, 'users', user.uid, 'app-settings', 'main');
            await setDocumentNonBlocking(ref, {
                ...settings, weeklyRent: currentRent, investmentPercentage: currentInvPercent, partnersCount: currentPartners
            }, { merge: true });
            toast({ title: "Ajustes de Tesorería Guardados" });
        } catch (e) {
            toast({ variant: "destructive", title: "Error" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const isLoading = salesLoading || productsLoading || repairsLoading || exchangesLoading;

    if (isLoading) return <div className="p-8 space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-64 w-full" /></div>;

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50">
            <PageHeader title="Planificación de Tesorería">
                <Popover>
                    <PopoverTrigger asChild><Button variant="outline" className={cn("justify-start text-left font-normal bg-white", !date && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{date?.from ? (date.to ? `${format(date.from, "dd/MM/yy")} - ${format(date.to, "dd/MM/yy")}` : format(date.from, "dd/MM/yy")) : "Filtrar periodo"}</Button></PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end"><Calendar initialFocus mode="range" selected={date} onSelect={setDate} numberOfMonths={2} locale={es} /></PopoverContent>
                </Popover>
            </PageHeader>

            <main className="flex-1 p-4 sm:p-6 space-y-6 max-w-5xl mx-auto w-full pb-20">
                
                <div className="grid gap-4 md:grid-cols-2">
                    <Card className="bg-slate-900 text-white shadow-xl border-none overflow-hidden relative">
                        <div className="absolute right-2 top-2 opacity-10"><DollarSign className="w-20 h-20" /></div>
                        <CardHeader className="pb-2"><CardTitle className="text-xs uppercase font-black text-slate-400">Flujo Neto Divisa (Periodo)</CardTitle></CardHeader>
                        <CardContent><div className="text-4xl font-black">${formatCurrency(cashBoxStatus.usdTotal)}</div><p className="text-[9px] text-slate-500 mt-1 uppercase font-bold tracking-widest">Ingresos USD menos vueltos y egresos del periodo</p></CardContent>
                    </Card>

                    <Card className="bg-white border-2 border-primary/10 shadow-lg overflow-hidden relative">
                        <div className="absolute right-2 top-2 opacity-5"><Landmark className="w-20 h-20" /></div>
                        <CardHeader className="pb-2"><CardTitle className="text-xs uppercase font-black text-muted-foreground flex justify-between items-center">Movimiento Bolívares (Periodo)<Link href="/dashboard/exchange"><Button variant="ghost" size="sm" className="h-6 text-[9px] font-black text-blue-600 hover:bg-blue-50"><ArrowRightLeft className="w-3 h-3 mr-1" /> COMPRAR USD</Button></Link></CardTitle></CardHeader>
                        <CardContent className="space-y-3"><div className="text-4xl font-black text-primary">Bs {formatCurrency(cashBoxStatus.bsAvailable)}</div><div className="grid grid-cols-2 gap-2 mt-2">{Object.entries(cashBoxStatus.breakdown).map(([method, amount]) => { const Icon = methodIcons[method] || Landmark; return (<div key={method} className="flex justify-between items-center bg-muted/30 p-1.5 rounded text-[9px]"><span className="font-bold flex items-center gap-1 uppercase"><Icon className="w-2.5 h-2.5" /> {method}:</span><span className={cn("font-black", (amount as number) < 0 ? "text-destructive" : "text-slate-700")}>Bs {formatCurrency(amount as number)}</span></div>);})}</div></CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="bg-blue-50 border-blue-200 shadow-sm flex items-center p-4 gap-4">
                        <Wallet className="w-8 h-8 text-blue-600" />
                        <div>
                            <p className="text-[10px] font-black uppercase text-blue-900">Saldo Real Estimado (En Mano)</p>
                            <div className="flex gap-4">
                                <p className="text-lg font-black text-blue-800">${formatCurrency(walletBalance.usd)}</p>
                                <p className="text-lg font-black text-blue-800">Bs {formatCurrency(walletBalance.bsAvailable)}</p>
                            </div>
                            <p className="text-[8px] text-blue-700 uppercase font-bold">Desde Arqueo ({walletBalance.lastReset ? format(walletBalance.lastReset, "dd/MM/yy HH:mm") : 'Inicio'}) + Ventas - Gastos</p>
                        </div>
                    </Card>
                    <div className="p-4 bg-muted/50 border rounded-xl flex items-center gap-3">
                        <Info className="w-5 h-5 text-slate-400 shrink-0" />
                        <p className="text-[10px] text-slate-600 leading-tight">
                            Si el <strong>Saldo Real</strong> no coincide con tu dinero físico, ve a <strong>Ajustes</strong> y realiza un nuevo <strong>Arqueo</strong> para que el sistema cuente desde tu saldo actual.
                        </p>
                    </div>
                </div>

                <Card className="border-primary/20 shadow-sm">
                    <CardHeader className="py-3 bg-muted/30"><CardTitle className="text-xs uppercase font-black flex items-center gap-2 text-primary"><Settings2 className="w-4 h-4" /> Parámetros de Distribución</CardTitle></CardHeader>
                    <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="space-y-3"><Label className="text-[10px] font-bold uppercase text-muted-foreground">Alquiler Semanal Apartado ($)</Label><Input type="number" value={currentRent} onChange={(e) => setLocalRent(Number(e.target.value))} /></div>
                        <div className="space-y-3"><Label className="text-[10px] font-bold uppercase text-muted-foreground flex justify-between"><span>Distribución Inversión</span><span className="text-blue-600 font-black">{currentInvPercent}%</span></Label><Slider value={[currentInvPercent]} max={100} step={1} onValueChange={(v) => setLocalInvPercent(v[0])} /><div className="flex justify-between text-[9px] font-bold text-muted-foreground"><span>Tienda: {currentInvPercent}%</span><span>Socios: {100 - currentInvPercent}%</span></div></div>
                        <div className="space-y-3"><Label className="text-[10px] font-bold uppercase text-muted-foreground">Cantidad de Socios</Label><div className="flex gap-2"><Input type="number" value={currentPartners} onChange={(e) => setLocalPartners(Number(e.target.value))} /><Button size="icon" variant="outline" onClick={handleSaveConfig} disabled={isSaving} title="Guardar como predeterminado"><Save className={cn("w-4 h-4", isSaving && "animate-spin")} /></Button></div></div>
                    </CardContent>
                </Card>

                <div className="space-y-4">
                    <h2 className="text-sm font-black uppercase text-slate-500 tracking-widest flex items-center gap-2"><Wallet className="w-4 h-4" /> Distribución del Periodo Seleccionado</h2>
                    <div className="grid gap-4 md:grid-cols-3">
                        <Card className="border-none bg-slate-900 text-white shadow-xl overflow-hidden relative group"><div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform"><Home className="w-24 h-24 rotate-12" /></div><CardContent className="pt-6 space-y-1"><p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">1. Apartar para Alquiler</p><p className="text-3xl font-black">${formatCurrency(currentRent)}</p><p className="text-[9px] text-slate-500 font-bold uppercase">Monto Fijo</p></CardContent></Card>
                        <Card className="border-none bg-primary text-white shadow-xl overflow-hidden relative group"><div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform"><ShoppingBag className="w-24 h-24 -rotate-12" /></div><CardContent className="pt-6 space-y-1"><p className="text-[10px] font-black text-primary-foreground/60 uppercase tracking-tighter">2. Comprar Mercancía</p><p className="text-3xl font-black">${formatCurrency(stats.totalMerchandise)}</p><p className="text-[9px] text-primary-foreground/40 font-bold uppercase">Reposición + Inversión Nueva</p></CardContent></Card>
                        <Card className="border-none bg-green-600 text-white shadow-xl overflow-hidden relative group"><div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform"><HandCoins className="w-24 h-24 rotate-12" /></div><CardContent className="pt-6 space-y-3 relative z-10"><div className="space-y-1"><p className="text-[10px] font-black text-green-100 uppercase tracking-tighter">3. Sueldo Socios ({currentPartners})</p><p className="text-3xl font-black">${formatCurrency(stats.salary)}</p></div><div className="pt-2 mt-1 border-t border-white/10"><div className="flex justify-between items-center mb-4"><span className="text-[10px] font-bold text-green-50/80 uppercase">CADA UNO:</span><span className="text-sm font-black text-white">${formatCurrency(stats.perPartner)}</span></div><div className="p-3 rounded-xl bg-black/20 border border-white/10 space-y-3"><p className="text-[8px] font-black text-green-200 uppercase tracking-widest text-center flex items-center justify-center gap-1.5"><Banknote className="w-3 h-3" /> Calculadora de Reparto ($ / Bs)</p><div className="grid grid-cols-2 gap-3"><div className="space-y-1"><label className="text-[7px] font-bold text-green-100 uppercase">Pagar en USD ($)</label><input type="number" step="0.01" value={usdSplit} onChange={(e) => setUsdSplit(e.target.value)} className="h-8 w-full rounded bg-white/10 border-none text-white px-2 text-[11px] font-black focus:ring-1 focus:ring-white/20" placeholder="0.00" /></div><div className="space-y-1 text-right"><label className="text-[7px] font-bold text-green-100 uppercase">Resto en Bs (BCV)</label><div className="h-8 flex items-center justify-end text-[11px] font-black text-white">Bs {formatCurrency(remainingBs)}</div></div></div></div></div></CardContent></Card>
                    </div>
                </div>

                <Separator className="my-8" />

                <Card className="bg-white shadow-sm overflow-hidden"><CardHeader className="bg-slate-50 border-b py-3"><div className="flex items-center justify-between"><div><CardTitle className="text-[10px] font-black uppercase text-sidebar-foreground flex items-center gap-2"><Rocket className="w-3.5 h-3.5 text-primary" /> Proyección de Capital Acumulado</CardTitle><CardDescription className="text-[9px] uppercase font-bold">Valor proyectado a 3 meses ({currentInvPercent}% semanal)</CardDescription></div><Badge className="bg-primary/10 text-primary border-primary/20 text-[9px]">Crecimiento Est.</Badge></div></CardHeader><CardContent className="pt-8"><div className="h-[250px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={stats.projectionData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}><defs><linearGradient id="colorCap" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dy={10} /><YAxis fontSize={10} axisLine={false} tickLine={false} tickFormatter={(val) => `$${val}`} tick={{ fill: '#64748b' }} /><ChartTooltip content={({ active, payload, label }) => { if (active && payload && payload.length) { return (<div className="bg-white p-3 border rounded-lg shadow-xl text-xs"><p className="font-black text-slate-500 uppercase mb-1">{label}</p><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-primary" /><span className="font-bold text-primary">Capital: ${formatCurrency(payload[0].value as number)}</span></div><p className="text-[10px] text-muted-foreground mt-1">Acumulado proyectado</p></div>); } return null; }} /><Area type="monotone" dataKey="capital" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorCap)" strokeWidth={3} dot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6, strokeWidth: 0 }} /></AreaChart></ResponsiveContainer></div></CardContent></Card>
            </main>
        </div>
    );
}
