
"use client";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogOut, ShieldCheck, UserCog, Mail, Lock, KeyRound, AlertCircle, FileSpreadsheet, DownloadCloud, UploadCloud, Database, RefreshCcw, MapPin, Hash, ReceiptText, Wrench, Save, PiggyBank, Users, Home, Percent, ShieldAlert, Wallet, Landmark, DollarSign, Smartphone, CreditCard, Banknote, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useDoc, useFirebase, useMemoFirebase, setDocumentNonBlocking, updateDocumentNonBlocking, useCollection } from "@/firebase";
import { doc, collection, writeBatch } from "firebase/firestore";
import { useEffect, useState, useRef, useMemo } from "react";
import type { AppSettings, UserProfile, Product, RepairJob, Sale, Fiado, UserModule, PaymentMethod } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import { signOut } from "firebase/auth";
import { updateUserEmail, updateUserPassword } from "@/firebase/non-blocking-login";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { format, parseISO } from "date-fns";
import { AdminAuthDialog } from "@/components/admin-auth-dialog";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { SecurityGate } from "@/components/security-gate";

const settingsSchema = z.object({
    bcvRate: z.coerce.number().positive("La tasa debe ser mayor a 0"),
    parallelRate: z.coerce.number().positive("La tasa debe ser mayor a 0"),
    profitMargin: z.coerce.number().min(0, "El margen no puede ser negativo"),
    autoUpdateBcv: z.boolean().default(false),
    lastUpdated: z.string().optional(),
    weeklyRent: z.coerce.number().min(0, "Mínimo 0"),
    investmentPercentage: z.coerce.number().min(0).max(100, "Máximo 100%"),
    partnersCount: z.coerce.number().min(1, "Al menos 1 socio"),
    initialBalances: z.object({
        'Efectivo USD': z.coerce.number().default(0),
        'Efectivo Bs': z.coerce.number().default(0),
        'Tarjeta / Pago Móvil': z.coerce.number().default(0),
        'Transferencia': z.coerce.number().default(0),
    })
});

const profileSchema = z.object({
    businessName: z.string().min(2, "Mínimo 2 caracteres"),
    businessAddress: z.string().optional(),
    businessRIF: z.string().optional(),
    showInfoOnReceipt: z.boolean().default(false),
    repairWarrantyPolicy: z.string().optional(),
    repairPickupPolicy: z.string().optional(),
    repairDisclaimer: z.string().optional(),
});

const DEFAULT_PIN = "2026";

const PROTECTABLE_MODULES: { id: UserModule, label: string }[] = [
    { id: 'inventory', label: 'Inventario' },
    { id: 'pos', label: 'Punto de Venta' },
    { id: 'repairs', label: 'Reparaciones' },
    { id: 'fiados', label: 'Fiados / Créditos' },
    { id: 'payroll', label: 'Registro de Pago' },
    { id: 'treasury', label: 'Tesorería' },
    { id: 'reports', label: 'Reportes Financieros' },
    { id: 'analysis', label: 'Análisis de Negocio' },
];

export default function SettingsPage() {
    return (
        <SecurityGate module="settings">
            <SettingsContent />
        </SecurityGate>
    );
}

function SettingsContent() {
    const { toast } = useToast();
    const { firestore, auth, user } = useFirebase();
    const [isUpdatingCredentials, setIsUpdatingCredentials] = useState(false);
    const [isUpdatingPin, setIsUpdatingPin] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [isSavingBalances, setIsSavingBalances] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const settingsRef = useMemoFirebase(() => 
        (firestore && user) ? doc(firestore, 'users', user.uid, 'app-settings', 'main') : null,
        [firestore, user?.uid]
    );
    const { data: settings } = useDoc<AppSettings>(settingsRef);

    const userProfileRef = useMemoFirebase(() =>
        (firestore && user) ? doc(firestore, 'users', user.uid) : null,
        [firestore, user?.uid]
    );
    const { data: profile } = useDoc<UserProfile>(userProfileRef);

    const productsCol = useMemoFirebase(() => (firestore && user) ? collection(firestore, 'users', user.uid, 'products') : null, [firestore, user?.uid]);
    const repairsCol = useMemoFirebase(() => (firestore && user) ? collection(firestore, 'users', user.uid, 'repair_jobs') : null, [firestore, user?.uid]);
    const salesCol = useMemoFirebase(() => (firestore && user) ? collection(firestore, 'users', user.uid, 'sale_transactions') : null, [firestore, user?.uid]);
    const fiadosCol = useMemoFirebase(() => (firestore && user) ? collection(firestore, 'users', user.uid, 'fiados') : null, [firestore, user?.uid]);

    const { data: products } = useCollection<Product>(productsCol);
    const { data: repairs } = useCollection<RepairJob>(repairsCol);
    const { data: sales } = useCollection<Sale>(salesCol);
    const { data: fiados } = useCollection<Fiado>(fiadosCol);

    const settingsForm = useForm<z.infer<typeof settingsSchema>>({
        resolver: zodResolver(settingsSchema),
        defaultValues: { 
            bcvRate: 1, 
            parallelRate: 1, 
            profitMargin: 100, 
            autoUpdateBcv: false,
            weeklyRent: 40,
            investmentPercentage: 30,
            partnersCount: 2,
            initialBalances: {
                'Efectivo USD': 0,
                'Efectivo Bs': 0,
                'Tarjeta / Pago Móvil': 0,
                'Transferencia': 0,
            }
        }
    });

    const profileForm = useForm<z.infer<typeof profileSchema>>({
        resolver: zodResolver(profileSchema),
        defaultValues: { 
            businessName: "", 
            businessAddress: "", 
            businessRIF: "", 
            showInfoOnReceipt: false,
            repairWarrantyPolicy: "",
            repairPickupPolicy: "",
            repairDisclaimer: ""
        }
    });

    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newPin, setNewPin] = useState("");
    const [currentPinVerify, setCurrentPinVerify] = useState("");
    const [isPinRequired, setIsPinRequired] = useState(true);
    const [lockedModules, setLockedModules] = useState<UserModule[]>([]);
    const [initialEmailSet, setInitialEmailSet] = useState(false);

    const availableProtectableModules = useMemo(() => {
        if (!profile) return [];
        const enabled = profile.enabledModules || ['inventory', 'pos', 'repairs', 'reports', 'analysis', 'fiados', 'payroll', 'treasury'];
        return PROTECTABLE_MODULES.filter(m => enabled.includes(m.id));
    }, [profile]);

    useEffect(() => {
        if (settings && !settingsForm.formState.isDirty) {
            const combinedDigital = (settings.initialBalances?.['Tarjeta'] || 0) + 
                                   (settings.initialBalances?.['Pago Móvil'] || 0) + 
                                   (settings.initialBalances?.['Tarjeta / Pago Móvil'] || 0);

            settingsForm.reset({
                bcvRate: settings.bcvRate,
                parallelRate: settings.parallelRate,
                profitMargin: settings.profitMargin,
                autoUpdateBcv: settings.autoUpdateBcv || false,
                lastUpdated: settings.lastUpdated,
                weeklyRent: settings.weeklyRent ?? 40,
                investmentPercentage: settings.investmentPercentage ?? 30,
                partnersCount: settings.partnersCount ?? 2,
                initialBalances: {
                    'Efectivo USD': settings.initialBalances?.['Efectivo USD'] || 0,
                    'Efectivo Bs': settings.initialBalances?.['Efectivo Bs'] || 0,
                    'Tarjeta / Pago Móvil': combinedDigital,
                    'Transferencia': settings.initialBalances?.['Transferencia'] || 0,
                }
            });
        }
    }, [settings, settingsForm]);

    useEffect(() => {
        if (profile && !profileForm.formState.isDirty) {
            profileForm.reset({ 
                businessName: profile.businessName || "",
                businessAddress: profile.businessAddress || "",
                businessRIF: profile.businessRIF || "",
                showInfoOnReceipt: profile.showInfoOnReceipt || false,
                repairWarrantyPolicy: profile.repairWarrantyPolicy || "4 DÍAS POR EL SERVICIO REALIZADO.",
                repairPickupPolicy: profile.repairPickupPolicy || "7 DÍAS MÁXIMO UNA VEZ NOTIFICADO. EL NEGOCIO NO SE HACE RESPONSABLE PASADO ESTE TIEMPO.",
                repairDisclaimer: profile.repairDisclaimer || "NO NOS HACEMOS RESPONSABLES POR TELÉFONOS MOJADOS O QUE SUFRIERON CAÍDAS."
            });
            if (!initialEmailSet) {
                setNewEmail(profile.email || "");
                setInitialEmailSet(true);
            }
            setIsPinRequired(profile.isPinRequired !== false);
            setLockedModules(profile.lockedModules || ['treasury', 'reports', 'analysis']);
        }
    }, [profile, profileForm, initialEmailSet]);

    const handleSaveSettings = async (values: z.infer<typeof settingsSchema>) => {
        if (!settingsRef) return;
        setIsSavingSettings(true);
        try {
            await setDocumentNonBlocking(settingsRef, { ...values, lastUpdated: new Date().toISOString() }, { merge: true });
            toast({ title: "Configuración Guardada" });
            settingsForm.reset(values);
        } catch (e) {
            toast({ variant: "destructive", title: "Error" });
        } finally {
            setIsSavingSettings(false);
        }
    }

    const handleSaveBalances = async (values: z.infer<typeof settingsSchema>) => {
        if (!settingsRef) return;
        setIsSavingBalances(true);
        try {
            // Guardamos los fondos y establecemos el marcador de tiempo del Arqueo
            await setDocumentNonBlocking(settingsRef, { 
                initialBalances: values.initialBalances,
                balancesUpdatedAt: new Date().toISOString() 
            }, { merge: true });
            toast({ 
                title: "Fondos Sincronizados", 
                description: "El Saldo Real ahora contará desde este momento exacto." 
            });
            settingsForm.reset(values);
        } catch (e) {
            toast({ variant: "destructive", title: "Error al sincronizar" });
        } finally {
            setIsSavingBalances(false);
        }
    }

    const handleSaveProfile = (values: z.infer<typeof profileSchema>) => {
        if (!userProfileRef) return;
        setDocumentNonBlocking(userProfileRef, values, { merge: true });
        toast({ title: "Perfil Actualizado" });
        profileForm.reset(values);
    }

    const toggleModuleLock = (moduleId: UserModule) => {
        setLockedModules(prev => 
            prev.includes(moduleId) ? prev.filter(m => m !== moduleId) : [...prev, moduleId]
        );
    };

    const handleUpdatePinSettings = async () => {
        if (!userProfileRef || !currentPinVerify) return;
        const requiredPin = profile?.securityPin || DEFAULT_PIN;
        if (currentPinVerify !== requiredPin) {
            toast({ variant: "destructive", title: "Autorización Fallida", description: "El PIN ingresado para autorizar no es correcto." });
            return;
        }
        setIsUpdatingPin(true);
        try {
            const updateData: Partial<UserProfile> = { 
                isPinRequired: isPinRequired,
                lockedModules: lockedModules
            };
            if (newPin) updateData.securityPin = newPin;
            await updateDocumentNonBlocking(userProfileRef, updateData);
            toast({ title: "Seguridad Actualizada" });
            setNewPin("");
            setCurrentPinVerify("");
        } catch (e) {
            toast({ variant: "destructive", title: "Error" });
        } finally {
            setIsUpdatingPin(false);
        }
    };

    const handleUpdateCredentials = async () => {
        if (!auth || !user) return;
        if (newEmail === user.email && !newPassword) {
            toast({ title: "Sin cambios" });
            return;
        }
        setIsUpdatingCredentials(true);
        try {
            if (newEmail && newEmail !== user.email && profile?.isAdmin) {
                await updateUserEmail(auth, newEmail);
                if (userProfileRef) setDocumentNonBlocking(userProfileRef, { email: newEmail }, { merge: true });
            }
            if (newPassword) {
                if (newPassword.length < 6) throw new Error("Mínimo 6 caracteres");
                await updateUserPassword(auth, newPassword);
            }
            toast({ title: "Credenciales Actualizadas" });
            setNewPassword("");
        } catch (e: any) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        } finally {
            setIsUpdatingCredentials(false);
        }
    };

    const handleExportSystemBackup = () => {
        const wb = XLSX.utils.book_new();
        const inventoryData = (products || []).map(p => ({ 'ID': p.id, 'SKU': p.sku, 'Nombre': p.name, 'Categoria': p.category, 'Costo': p.costPrice, 'Venta_Fija': p.fixedPrice || 0, 'Stock_Fisico': p.stockLevel, 'Reservado': p.reservedStock || 0, 'Dañado': p.damagedStock || 0, 'Margen_Indiv': p.customMargin || 0 }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inventoryData), "Inventario");
        const repairsData = (repairs || []).map(r => ({ 'ID': r.id, 'Cliente': r.customerName, 'Cedula': r.customerID, 'Telefono': r.customerPhone, 'Equipo': `${r.deviceMake} ${r.deviceModel}`, 'Falla': r.reportedIssue, 'Total': r.estimatedCost, 'Pagado': r.amountPaid, 'Estado': r.status, 'Fecha': r.createdAt }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(repairsData), "Reparaciones");
        const salesData = (sales || []).map(s => ({ 'ID': s.id, 'Fecha': s.transactionDate, 'Total': s.totalAmount, 'Metodo': s.paymentMethod, 'Detalle': s.items.map(i => `${i.quantity}x ${i.name}`).join(', '), 'Estado': s.status }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesData), "Ventas");
        const fiadosData = (fiados || []).map(f => ({ 'ID': f.id, 'Cliente': f.customerName, 'Cedula': f.customerID, 'Concepto': f.concept, 'Total': f.totalAmount, 'Abonado': f.amountPaid, 'Estado': f.status, 'Fecha': f.createdAt, 'Vencimiento': f.dueDate || '' }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fiadosData), "Fiados");
        XLSX.writeFile(wb, `Respaldo_PoosMariche_${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
        toast({ title: "Respaldo Generado" });
    };

    const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !firestore || !user) return;
        setIsImporting(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const batch = writeBatch(firestore);
                let total = 0;
                if (workbook.SheetNames.includes("Inventario")) {
                    const sheet = XLSX.utils.sheet_to_json(workbook.Sheets["Inventario"]);
                    sheet.forEach((row: any) => {
                        const ref = doc(firestore, 'users', user.uid, 'products', row.ID || doc(collection(firestore, 'temp')).id);
                        batch.set(ref, { id: ref.id, sku: row.SKU || '', name: row.Nombre || '', category: row.Categoria || 'General', costPrice: Number(row.Costo) || 0, fixedPrice: Number(row.Venta_Fija) || 0, stockLevel: Number(row.Stock_Fisico) || 0, reservedStock: Number(row.Reservado) || 0, damagedStock: Number(row.Dañado) || 0, customMargin: Number(row.Margen_Indiv) || 0, isFixedPrice: (row.Venta_Fija > 0), hasCustomMargin: (row.Margen_Indiv > 0), lowStockThreshold: 1 }, { merge: true });
                        total++;
                    });
                }
                await batch.commit();
                toast({ title: "Importación Exitosa", description: `Se han restaurado ${total} registros.` });
            } catch (error) {
                toast({ variant: "destructive", title: "Error al Importar" });
            } finally {
                setIsImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleSignOut = () => {
        if (auth) {
            localStorage.removeItem('mm_active_session_id');
            sessionStorage.removeItem('mm_security_unlocked');
            signOut(auth).then(() => { window.location.href = '/'; });
        }
    };

    const showRepairs = profile?.enabledModules?.includes('repairs') ?? true;

    return (
        <>
            <PageHeader title="Configuración y Perfil" />
            <main className="flex-1 p-4 sm:p-6 space-y-8 max-w-4xl mx-auto w-full pb-20">
                
                <Card className="shadow-md border-primary/20 bg-primary/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-primary"><ShieldCheck className="w-5 h-5"/> Centro de Seguridad y PIN</CardTitle>
                        <CardDescription>Controla qué partes del sistema requieren clave de gerente.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className={cn("flex items-center justify-between p-4 rounded-lg border", isPinRequired ? "bg-white border-primary/20" : "bg-slate-50 border-slate-200")}>
                            <div className="space-y-0.5">
                                <Label className="text-base font-black uppercase tracking-tight">Seguridad Global por PIN</Label>
                                <p className="text-xs text-muted-foreground">{isPinRequired ? "El sistema pedirá PIN para entrar a las áreas marcadas." : "Las secciones importantes estarán abiertas a cualquiera."}</p>
                            </div>
                            <Switch checked={isPinRequired} onCheckedChange={setIsPinRequired} />
                        </div>

                        {isPinRequired && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-3 p-4 bg-white rounded-lg border shadow-sm">
                                    <Label className="flex items-center gap-2 text-xs font-black uppercase text-muted-foreground"><ShieldAlert className="w-3.5 h-3.5" /> Bloquear estas secciones:</Label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {availableProtectableModules.map(m => (
                                            <div key={m.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-100 transition-all">
                                                <Label className="text-xs cursor-pointer" htmlFor={`lock-${m.id}`}>{m.label}</Label>
                                                <Switch id={`lock-${m.id}`} checked={lockedModules.includes(m.id)} onCheckedChange={() => toggleModuleLock(m.id)} />
                                            </div>
                                        ))}
                                        <div className="flex items-center justify-between p-2 opacity-50 bg-slate-50 rounded italic border border-slate-200">
                                            <Label className="text-xs">Configuración (Siempre Bloqueado)</Label>
                                            <Switch checked disabled />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-4 p-4 bg-white rounded-lg border shadow-sm flex flex-col justify-between">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-black uppercase">{profile?.securityPin ? "PIN Actual *" : "PIN por Defecto (2026) *"}</Label>
                                            <Input type="password" value={currentPinVerify} onChange={(e) => setCurrentPinVerify(e.target.value)} placeholder={profile?.securityPin ? "PIN actual para autorizar" : "Escribe 2026"} className="h-12 text-xl tracking-[0.5em] text-center" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-black uppercase">{profile?.securityPin ? "Cambiar por Nuevo PIN" : "Crear mi PIN de Gerente *"}</Label>
                                            <Input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="4-8 dígitos nuevos" className="h-12 text-xl tracking-[0.5em] text-center" />
                                        </div>
                                    </div>
                                    <Button className="w-full h-12" onClick={handleUpdatePinSettings} disabled={isUpdatingPin || !currentPinVerify || (!profile?.securityPin && !newPin)}>
                                        {isUpdatingPin ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                        {profile?.securityPin ? "Guardar Ajustes" : "Activar mi PIN Personal"}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="shadow-md border-amber-100 bg-amber-50/30">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-amber-700"><Wallet className="w-5 h-5" /> Arqueo de Caja (Fondos Base)</CardTitle>
                        <CardDescription>Indica cuánto dinero tienes FÍSICAMENTE en este momento. El sistema contará desde aquí en adelante.</CardDescription>
                    </CardHeader>
                    <Form {...settingsForm}>
                        <form onSubmit={settingsForm.handleSubmit(handleSaveBalances)}>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormField control={settingsForm.control} name="initialBalances.Efectivo USD" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="flex items-center gap-2 font-bold"><DollarSign className="w-3.5 h-3.5" /> Fondo Efectivo USD</FormLabel>
                                            <FormControl><Input type="number" step="0.01" {...field} className="bg-white border-amber-200" /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={settingsForm.control} name="initialBalances.Efectivo Bs" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="flex items-center gap-2 font-bold"><Landmark className="w-3.5 h-3.5" /> Fondo Efectivo Bs</FormLabel>
                                            <FormControl><Input type="number" step="0.01" {...field} className="bg-white border-amber-200" /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={settingsForm.control} name="initialBalances.Tarjeta / Pago Móvil" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="flex items-center gap-2 font-bold"><Smartphone className="w-3.5 h-3.5" /> Saldo Digital (Tarjeta / P. Móvil)</FormLabel>
                                            <FormControl><Input type="number" step="0.01" {...field} className="bg-white border-amber-200" /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={settingsForm.control} name="initialBalances.Transferencia" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="flex items-center gap-2 font-bold"><Banknote className="w-3.5 h-3.5" /> Saldo Bancos (Transferencias)</FormLabel>
                                            <FormControl><Input type="number" step="0.01" {...field} className="bg-white border-amber-200" /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                </div>
                                <div className="p-3 bg-amber-600 text-white rounded-lg flex items-start gap-2 shadow-sm">
                                    <AlertCircle className="w-5 h-5 mt-0.5" />
                                    <div className="text-[11px] leading-tight font-medium">
                                        <p className="font-bold uppercase mb-1">¡IMPORTANTE: PUNTO DE CONTROL!</p>
                                        <p>Al guardar estos montos, el sistema registrará este momento exacto. Todas las ventas y gastos anteriores serán ignorados para el cálculo del Saldo Real. El sistema volverá a contar desde cero a partir de estas cifras.</p>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="border-t border-amber-100 pt-4">
                                <Button type="submit" disabled={isSavingBalances} className="bg-amber-600 hover:bg-amber-700 w-full sm:w-auto">
                                    {isSavingBalances ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                                    Sincronizar con mi Efectivo Actual
                                </Button>
                            </CardFooter>
                        </form>
                    </Form>
                </Card>

                <Card className="shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><UserCog className="w-5 h-5"/> Perfil del Negocio</CardTitle>
                        <CardDescription>Datos comerciales para facturación y reportes.</CardDescription>
                    </CardHeader>
                    <Form {...profileForm}>
                        <form onSubmit={profileForm.handleSubmit(handleSaveProfile)}>
                            <CardContent className="space-y-6">
                                <FormField control={profileForm.control} name="businessName" render={({ field }) => (
                                    <FormItem><FormLabel>Nombre Comercial</FormLabel><FormControl><Input {...field} placeholder="Ej: Poos Mariche Central" /></FormControl><FormMessage /></FormItem>
                                )} />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormField control={profileForm.control} name="businessRIF" render={({ field }) => (
                                        <FormItem><FormLabel className="flex items-center gap-2"><Hash className="w-3 h-3" /> RIF / Identificación Fiscal</FormLabel><FormControl><Input {...field} placeholder="Ej: J-12345678-9" /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={profileForm.control} name="businessAddress" render={({ field }) => (
                                        <FormItem><FormLabel className="flex items-center gap-2"><MapPin className="w-3 h-3" /> Dirección Física</FormLabel><FormControl><Input {...field} placeholder="Ej: Av. Principal, Local 5" /></FormControl><FormMessage /></FormItem>
                                    )} />
                                </div>
                                <Separator />
                                <FormField control={profileForm.control} name="showInfoOnReceipt" render={({ field }) => (
                                    <FormItem className="flex items-center justify-between rounded-lg border p-4 bg-muted/20">
                                        <div className="space-y-0.5"><FormLabel className="flex items-center gap-2"><ReceiptText className="w-4 h-4 text-primary" /> Datos en Recibos</FormLabel><FormDescription>Mostrar RIF y Dirección en los tickets impresos.</FormDescription></div>
                                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                    </FormItem>
                                )} />
                            </CardContent>
                            <CardFooter className="border-t pt-4">
                                <Button type="submit">Actualizar Perfil</Button>
                            </CardFooter>
                        </form>
                    </Form>
                </Card>

                <Card className="shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-primary"><PiggyBank className="w-5 h-5" /> Parámetros Financieros</CardTitle>
                        <CardDescription>Configuración de márgenes y distribución de ganancias.</CardDescription>
                    </CardHeader>
                    <Form {...settingsForm}>
                        <form onSubmit={settingsForm.handleSubmit(handleSaveSettings)}>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <FormField control={settingsForm.control} name="bcvRate" render={({ field }) => (
                                        <FormItem><FormLabel>Tasa Oficial (BCV)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={settingsForm.control} name="parallelRate" render={({ field }) => (
                                        <FormItem><FormLabel>Tasa de Reposición</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={settingsForm.control} name="profitMargin" render={({ field }) => (
                                        <FormItem><FormLabel>Margen Global (%)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-6">
                                    <FormField control={settingsForm.control} name="weeklyRent" render={({ field }) => (
                                        <FormItem><FormLabel className="flex items-center gap-2"><Home className="w-3.5 h-3.5" /> Alquiler Semanal ($)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={settingsForm.control} name="investmentPercentage" render={({ field }) => (
                                        <FormItem><FormLabel className="flex items-center gap-2"><Percent className="w-3.5 h-3.5" /> % Inversión Nueva</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={settingsForm.control} name="partnersCount" render={({ field }) => (
                                        <FormItem><FormLabel className="flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Cantidad de Socios</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                </div>
                            </CardContent>
                            <CardFooter className="border-t pt-4">
                                <Button type="submit" disabled={isSavingSettings}>
                                    {isSavingSettings ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                    Guardar Ajustes Financieros
                                </Button>
                            </CardFooter>
                        </form>
                    </Form>
                </Card>

                <Card className="shadow-md border-slate-200">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-primary"><Database className="w-5 h-5" /> Centro de Datos y Respaldo</CardTitle>
                        <CardDescription>Descarga o restaura toda tu información.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Button variant="outline" className="h-20 justify-start gap-4 border-primary/30 bg-white hover:bg-primary/5" onClick={handleExportSystemBackup}>
                                <div className="p-3 bg-primary/10 rounded-full"><DownloadCloud className="w-6 h-6 text-primary" /></div>
                                <div className="text-left"><p className="font-bold text-sm">Descargar Todo (Excel)</p></div>
                            </Button>
                            <AdminAuthDialog onAuthorized={() => fileInputRef.current?.click()}>
                                <Button variant="outline" className="h-20 justify-start gap-4 border-amber-300 bg-white hover:bg-amber-50" disabled={isImporting}>
                                    <div className="p-3 bg-amber-100 rounded-full">{isImporting ? <RefreshCcw className="w-6 h-6 text-amber-600 animate-spin" /> : <UploadCloud className="w-6 h-6 text-amber-600" />}</div>
                                    <div className="text-left"><p className="font-bold text-sm text-amber-700">Importar Respaldo</p></div>
                                </Button>
                            </AdminAuthDialog>
                            <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleImportBackup} />
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-center pt-4"><Button variant="destructive" onClick={handleSignOut} size="lg"><LogOut className="mr-2 h-5 w-5" /> Cerrar Sesión del Sistema</Button></div>
            </main>
        </>
    );
}
