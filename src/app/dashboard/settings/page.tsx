
"use client";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogOut, ShieldCheck, UserCog, Mail, Lock, KeyRound, AlertCircle, FileSpreadsheet, DownloadCloud, UploadCloud, Database, RefreshCcw, MapPin, Hash, ReceiptText, Wrench, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useDoc, useFirebase, useMemoFirebase, setDocumentNonBlocking, updateDocumentNonBlocking, useCollection } from "@/firebase";
import { doc, collection, writeBatch } from "firebase/firestore";
import { useEffect, useState, useRef } from "react";
import type { AppSettings, UserProfile, Product, RepairJob, Sale, Fiado } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import { signOut } from "firebase/auth";
import { updateUserEmail, updateUserPassword } from "@/firebase/non-blocking-login";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { format, parseISO } from "date-fns";
import { AdminAuthDialog } from "@/components/admin-auth-dialog";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const settingsSchema = z.object({
    bcvRate: z.coerce.number().positive("La tasa debe ser mayor a 0"),
    parallelRate: z.coerce.number().positive("La tasa debe ser mayor a 0"),
    profitMargin: z.coerce.number().min(0, "El margen no puede ser negativo"),
    autoUpdateBcv: z.boolean().default(false),
    lastUpdated: z.string().optional(),
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

export default function SettingsPage() {
    const { toast } = useToast();
    const { firestore, auth, user } = useFirebase();
    const [isUpdatingCredentials, setIsUpdatingCredentials] = useState(false);
    const [isUpdatingPin, setIsUpdatingPin] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isSavingSettings, setIsSavingSettings] = useState(false);
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
    const [initialEmailSet, setInitialEmailSet] = useState(false);

    // CRITICAL FIX: Only reset forms if the user is NOT actively typing (isDirty check)
    useEffect(() => {
        if (settings && !settingsForm.formState.isDirty) {
            settingsForm.reset({
                bcvRate: settings.bcvRate,
                parallelRate: settings.parallelRate,
                profitMargin: settings.profitMargin,
                autoUpdateBcv: settings.autoUpdateBcv || false,
                lastUpdated: settings.lastUpdated,
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
        }
    }, [profile, profileForm, initialEmailSet]);

    const handleSaveSettings = async (values: z.infer<typeof settingsSchema>) => {
        if (!settingsRef) return;
        setIsSavingSettings(true);
        try {
            await setDocumentNonBlocking(settingsRef, { ...values, lastUpdated: new Date().toISOString() }, { merge: true });
            toast({ title: "Configuración Guardada", description: "Las tasas y márgenes han sido actualizados." });
            // Una vez guardado, el formulario deja de estar "sucio"
            settingsForm.reset(values);
        } catch (e) {
            toast({ variant: "destructive", title: "Error", description: "No se pudieron guardar los cambios." });
        } finally {
            setIsSavingSettings(false);
        }
    }

    const handleSaveProfile = (values: z.infer<typeof profileSchema>) => {
        if (!userProfileRef) return;
        setDocumentNonBlocking(userProfileRef, values, { merge: true });
        toast({ title: "Perfil Actualizado" });
        profileForm.reset(values);
    }

    const handleUpdatePinSettings = async () => {
        if (!userProfileRef || !currentPinVerify) return;
        const requiredPin = profile?.securityPin || DEFAULT_PIN;
        if (currentPinVerify !== requiredPin) {
            toast({ variant: "destructive", title: "PIN Actual Incorrecto", description: "Debes ingresar tu PIN actual." });
            return;
        }
        setIsUpdatingPin(true);
        try {
            const updateData: Partial<UserProfile> = { isPinRequired: isPinRequired };
            if (newPin) updateData.securityPin = newPin;
            await updateDocumentNonBlocking(userProfileRef, updateData);
            toast({ title: "Seguridad Actualizada" });
            setNewPin("");
            setCurrentPinVerify("");
        } catch (e) {
            toast({ variant: "destructive", title: "Error al actualizar" });
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
            if (newEmail && newEmail !== user.email) {
                await updateUserEmail(auth, newEmail);
                if (userProfileRef) setDocumentNonBlocking(userProfileRef, { email: newEmail }, { merge: true });
            }
            if (newPassword) {
                if (newPassword.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
                await updateUserPassword(auth, newPassword);
            }
            toast({ title: "Credenciales Actualizadas" });
            setNewPassword("");
        } catch (e: any) {
            toast({ variant: "destructive", title: "Error de Seguridad", description: e.message });
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
            signOut(auth).then(() => { window.location.href = '/'; });
        }
    };

    const showRepairs = profile?.enabledModules?.includes('repairs') ?? true;

    return (
        <>
            <PageHeader title="Configuración y Perfil" />
            <main className="flex-1 p-4 sm:p-6 space-y-8 max-w-4xl mx-auto w-full">
                
                <Card className="shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><UserCog className="w-5 h-5"/> Perfil del Negocio</CardTitle>
                        <CardDescription>Datos comerciales para facturación y reportes.</CardDescription>
                    </CardHeader>
                    <Form {...profileForm}>
                        <form onSubmit={profileForm.handleSubmit(handleSaveProfile)}>
                            <CardContent className="space-y-6">
                                <FormField control={profileForm.control} name="businessName" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nombre Comercial</FormLabel>
                                        <FormControl><Input {...field} placeholder="Ej: Poos Mariche Central" /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormField control={profileForm.control} name="businessRIF" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="flex items-center gap-2"><Hash className="w-3 h-3" /> RIF / Identificación Fiscal</FormLabel>
                                            <FormControl><Input {...field} placeholder="Ej: J-12345678-9" /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={profileForm.control} name="businessAddress" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="flex items-center gap-2"><MapPin className="w-3 h-3" /> Dirección Física</FormLabel>
                                            <FormControl><Input {...field} placeholder="Ej: Av. Principal, Local 5" /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                </div>
                                <Separator />
                                <FormField control={profileForm.control} name="showInfoOnReceipt" render={({ field }) => (
                                    <FormItem className="flex items-center justify-between rounded-lg border p-4 bg-muted/20">
                                        <div className="space-y-0.5">
                                            <FormLabel className="flex items-center gap-2"><ReceiptText className="w-4 h-4 text-primary" /> Datos en Recibos</FormLabel>
                                            <FormDescription>Mostrar RIF y Dirección en los tickets impresos.</FormDescription>
                                        </div>
                                        <FormControl>
                                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                                        </FormControl>
                                    </FormItem>
                                )} />
                                {showRepairs && (
                                    <div className="space-y-6 pt-4">
                                        <Separator />
                                        <div className="flex items-center gap-2 text-primary font-bold"><Wrench className="w-5 h-5" /><span>Políticas de Reparación</span></div>
                                        <div className="grid grid-cols-1 gap-4">
                                            <FormField control={profileForm.control} name="repairWarrantyPolicy" render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Política de Garantía</FormLabel>
                                                    <FormControl><Textarea {...field} className="h-20" /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )} />
                                            <FormField control={profileForm.control} name="repairPickupPolicy" render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Política de Retiro</FormLabel>
                                                    <FormControl><Textarea {...field} className="h-20" /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )} />
                                            <FormField control={profileForm.control} name="repairDisclaimer" render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Cláusula de Responsabilidad</FormLabel>
                                                    <FormControl><Textarea {...field} className="h-20" /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )} />
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="border-t pt-4">
                                <Button type="submit">Actualizar Perfil</Button>
                            </CardFooter>
                        </form>
                    </Form>
                </Card>

                <Card className="shadow-md border-primary/20 bg-primary/5">
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

                <Card className="shadow-md border-slate-200">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-slate-800"><KeyRound className="w-5 h-5"/> Clave de Gerente (PIN)</CardTitle>
                        <CardDescription>Protección para acciones críticas.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className={cn("flex items-center justify-between p-4 rounded-lg border", isPinRequired ? "bg-primary/5 border-primary/20" : "bg-slate-50 border-slate-200")}>
                            <div className="space-y-0.5">
                                <Label className="text-base">Estado de Protección</Label>
                                <p className="text-xs text-muted-foreground">{isPinRequired ? "Se solicita PIN para acciones críticas." : "No recomendado."}</p>
                            </div>
                            <Switch checked={isPinRequired} onCheckedChange={setIsPinRequired} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label>PIN Actual *</Label>
                                <input type="password" value={currentPinVerify} onChange={(e) => setCurrentPinVerify(e.target.value)} placeholder="PIN Actual" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                            </div>
                            <div className="space-y-2">
                                <Label>Nuevo PIN (Opcional)</Label>
                                <input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="Nuevo PIN" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="border-t pt-4">
                        <Button onClick={handleUpdatePinSettings} disabled={isUpdatingPin || !currentPinVerify}>
                            {isUpdatingPin ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Guardar Ajustes de Seguridad"}
                        </Button>
                    </CardFooter>
                </Card>

                <Card className="shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Save className="w-5 h-5 text-primary" /> Tasas y Márgenes</CardTitle>
                        <CardDescription>Configuración económica global.</CardDescription>
                    </CardHeader>
                    <Form {...settingsForm}>
                        <form onSubmit={settingsForm.handleSubmit(handleSaveSettings)}>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <FormField control={settingsForm.control} name="bcvRate" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Tasa Oficial (BCV)</FormLabel>
                                            <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={settingsForm.control} name="parallelRate" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Tasa de Reposición</FormLabel>
                                            <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={settingsForm.control} name="profitMargin" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Margen Global (%)</FormLabel>
                                            <FormControl><Input type="number" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                </div>
                                <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg border border-primary/10">
                                    <div className="space-y-0.5">
                                        <Label>Actualización Automática (BCV)</Label>
                                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Sincroniza con el Banco Central cada 4 horas</p>
                                    </div>
                                    <FormField control={settingsForm.control} name="autoUpdateBcv" render={({ field }) => (
                                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                    )} />
                                </div>
                            </CardContent>
                            <CardFooter className="border-t pt-4">
                                <Button type="submit" disabled={isSavingSettings} className="w-full sm:w-auto">
                                    {isSavingSettings ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                    Guardar Tasas y Márgenes
                                </Button>
                            </CardFooter>
                        </form>
                    </Form>
                </Card>

                <Card className="shadow-md border-amber-100">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-amber-700"><ShieldCheck className="w-5 h-5"/> Seguridad de Acceso (Login)</CardTitle>
                        <CardDescription>Cambia tu usuario y contraseña de acceso.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Email de Acceso</Label>
                                <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="correo@ejemplo.com" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                            </div>
                            <div className="space-y-2">
                                <Label>Nueva Contraseña</Label>
                                <input type="password" placeholder="Mínimo 6 caracteres" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="border-t pt-4">
                        <Button variant="outline" onClick={handleUpdateCredentials} disabled={isUpdatingCredentials}>
                            {isUpdatingCredentials ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Actualizar Credenciales"}
                        </Button>
                    </CardFooter>
                </Card>

                <div className="flex justify-center pt-4">
                    <Button variant="destructive" onClick={handleSignOut} size="lg">
                        <LogOut className="mr-2 h-5 w-5" /> Cerrar Sesión del Sistema
                    </Button>
                </div>
            </main>
        </>
    );
}
