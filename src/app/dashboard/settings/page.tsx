
"use client";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogOut, ShieldCheck, UserCog, Mail, Lock, KeyRound, AlertCircle, FileSpreadsheet, DownloadCloud, UploadCloud, Database, RefreshCcw, MapPin, Hash, ReceiptText } from "lucide-react";
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

const settingsSchema = z.object({
    bcvRate: z.coerce.number().positive(),
    parallelRate: z.coerce.number().positive(),
    profitMargin: z.coerce.number().min(0),
    autoUpdateBcv: z.boolean().default(false),
    lastUpdated: z.string().optional(),
});

const profileSchema = z.object({
    businessName: z.string().min(2, "Mínimo 2 caracteres"),
    businessAddress: z.string().optional(),
    businessRIF: z.string().optional(),
    showInfoOnReceipt: z.boolean().default(false),
});

const DEFAULT_PIN = "2026";

export default function SettingsPage() {
    const { toast } = useToast();
    const { firestore, auth, user } = useFirebase();
    const [isUpdatingCredentials, setIsUpdatingCredentials] = useState(false);
    const [isUpdatingPin, setIsUpdatingPin] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Configuración del sistema
    const settingsRef = useMemoFirebase(() => 
        (firestore && user) ? doc(firestore, 'users', user.uid, 'app-settings', 'main') : null,
        [firestore, user?.uid]
    );
    const { data: settings, isLoading } = useDoc<AppSettings>(settingsRef);

    // Perfil del usuario
    const userProfileRef = useMemoFirebase(() =>
        (firestore && user) ? doc(firestore, 'users', user.uid) : null,
        [firestore, user?.uid]
    );
    const { data: profile } = useDoc<UserProfile>(userProfileRef);

    // Colecciones para Exportación
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
        defaultValues: { bcvRate: 1, parallelRate: 1, profitMargin: 100, autoUpdateBcv: false }
    });

    const profileForm = useForm<z.infer<typeof profileSchema>>({
        resolver: zodResolver(profileSchema),
        defaultValues: { businessName: "", businessAddress: "", businessRIF: "", showInfoOnReceipt: false }
    });

    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newPin, setNewPin] = useState("");
    const [currentPinVerify, setCurrentPinVerify] = useState("");
    const [isPinRequired, setIsPinRequired] = useState(true);
    const [initialEmailSet, setInitialEmailSet] = useState(false);

    useEffect(() => {
        if (settings) {
            settingsForm.reset({
                bcvRate: settings.bcvRate,
                parallelRate: settings.parallelRate,
                profitMargin: settings.profitMargin,
                autoUpdateBcv: settings.autoUpdateBcv || false,
                lastUpdated: settings.lastUpdated
            });
        }
        if (profile) {
            profileForm.reset({ 
                businessName: profile.businessName || "",
                businessAddress: profile.businessAddress || "",
                businessRIF: profile.businessRIF || "",
                showInfoOnReceipt: profile.showInfoOnReceipt || false
            });
            if (!initialEmailSet) {
                setNewEmail(profile.email || "");
                setInitialEmailSet(true);
            }
            setIsPinRequired(profile.isPinRequired !== false);
        }
    }, [settings, profile, settingsForm, profileForm, initialEmailSet]);

    const handleSaveSettings = (values: z.infer<typeof settingsSchema>) => {
        if (!settingsRef) return;
        setDocumentNonBlocking(settingsRef, { ...values, lastUpdated: new Date().toISOString() }, { merge: true });
        toast({ title: "Configuración Guardada" });
    }

    const handleSaveProfile = (values: z.infer<typeof profileSchema>) => {
        if (!userProfileRef) return;
        setDocumentNonBlocking(userProfileRef, values, { merge: true });
        toast({ title: "Perfil Actualizado" });
    }

    const handleUpdatePinSettings = async () => {
        if (!userProfileRef || !currentPinVerify) return;
        
        const storedPin = profile?.securityPin || DEFAULT_PIN;
        
        if (currentPinVerify !== storedPin) {
            toast({ 
                variant: "destructive", 
                title: "PIN Actual Incorrecto", 
                description: "Debes ingresar tu PIN de gerente actual para autorizar cambios en la seguridad." 
            });
            return;
        }

        setIsUpdatingPin(true);
        try {
            const updateData: Partial<UserProfile> = {
                isPinRequired: isPinRequired,
            };

            if (newPin) {
                updateData.securityPin = newPin;
            }

            await updateDocumentNonBlocking(userProfileRef, updateData);
            
            toast({ 
                title: "Seguridad Actualizada", 
                description: "Los ajustes de tu clave de gerente han sido guardados." 
            });
            
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
            toast({ title: "Sin cambios", description: "No has modificado el correo ni la contraseña." });
            return;
        }

        setIsUpdatingCredentials(true);
        try {
            if (newEmail && newEmail !== user.email) {
                await updateUserEmail(auth, newEmail);
                if (userProfileRef) {
                    setDocumentNonBlocking(userProfileRef, { email: newEmail }, { merge: true });
                }
            }
            if (newPassword) {
                if (newPassword.length < 6) {
                    throw new Error("La contraseña debe tener al menos 6 caracteres.");
                }
                await updateUserPassword(auth, newPassword);
            }
            toast({ title: "Credenciales Actualizadas", description: "Tus datos de acceso han sido modificados." });
            setNewPassword("");
        } catch (e: any) {
            let description = e.message;
            if (e.code === 'auth/requires-recent-login') {
                description = "Por seguridad, debes haber iniciado sesión recientemente. Cierra sesión y vuelve a entrar.";
            }
            toast({ variant: "destructive", title: "Error de Seguridad", description });
        } finally {
            setIsUpdatingCredentials(false);
        }
    };

    // --- FUNCIÓN DE EXPORTACIÓN UNIFICADA ---
    const handleExportSystemBackup = () => {
        const wb = XLSX.utils.book_new();

        // 1. Inventario
        const inventoryData = (products || []).map(p => ({
            'ID': p.id,
            'SKU': p.sku,
            'Nombre': p.name,
            'Categoria': p.category,
            'Costo': p.costPrice,
            'Venta_Fija': p.fixedPrice || 0,
            'Stock_Fisico': p.stockLevel,
            'Reservado': p.reservedStock || 0,
            'Dañado': p.damagedStock || 0,
            'Margen_Indiv': p.customMargin || 0
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inventoryData), "Inventario");

        // 2. Reparaciones
        const repairsData = (repairs || []).map(r => ({
            'ID': r.id,
            'Cliente': r.customerName,
            'Cedula': r.customerID,
            'Telefono': r.customerPhone,
            'Equipo': `${r.deviceMake} ${r.deviceModel}`,
            'Falla': r.reportedIssue,
            'Total': r.estimatedCost,
            'Pagado': r.amountPaid,
            'Estado': r.status,
            'Fecha': r.createdAt
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(repairsData), "Reparaciones");

        // 3. Ventas
        const salesData = (sales || []).map(s => ({
            'ID': s.id,
            'Fecha': s.transactionDate,
            'Total': s.totalAmount,
            'Metodo': s.paymentMethod,
            'Detalle': s.items.map(i => `${i.quantity}x ${i.name}`).join(', '),
            'Estado': s.status
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesData), "Ventas");

        // 4. Fiados
        const fiadosData = (fiados || []).map(f => ({
            'ID': f.id,
            'Cliente': f.customerName,
            'Cedula': f.customerID,
            'Concepto': f.concept,
            'Total': f.totalAmount,
            'Abonado': f.amountPaid,
            'Estado': f.status,
            'Fecha': f.createdAt,
            'Vencimiento': f.dueDate || ''
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fiadosData), "Fiados");

        XLSX.writeFile(wb, `Respaldo_Sistema_PoosMariche_${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
        toast({ title: "Respaldo Generado", description: "Se ha descargado el archivo consolidado." });
    };

    // --- FUNCIÓN DE IMPORTACIÓN MASIVA ---
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
                let totalRecords = 0;

                // 1. Procesar Inventario
                if (workbook.SheetNames.includes("Inventario")) {
                    const sheet = XLSX.utils.sheet_to_json(workbook.Sheets["Inventario"]);
                    sheet.forEach((row: any) => {
                        const ref = doc(firestore, 'users', user.uid, 'products', row.ID || doc(collection(firestore, 'temp')).id);
                        batch.set(ref, {
                            id: ref.id,
                            sku: row.SKU || '',
                            name: row.Nombre || '',
                            category: row.Categoria || 'General',
                            costPrice: Number(row.Costo) || 0,
                            fixedPrice: Number(row.Venta_Fija) || 0,
                            stockLevel: Number(row.Stock_Fisico) || 0,
                            reservedStock: Number(row.Reservado) || 0,
                            damagedStock: Number(row.Dañado) || 0,
                            customMargin: Number(row.Margen_Indiv) || 0,
                            isFixedPrice: (row.Venta_Fija > 0),
                            hasCustomMargin: (row.Margen_Indiv > 0),
                            lowStockThreshold: 1
                        }, { merge: true });
                        totalRecords++;
                    });
                }

                // 2. Procesar Reparaciones
                if (workbook.SheetNames.includes("Reparaciones")) {
                    const sheet = XLSX.utils.sheet_to_json(workbook.Sheets["Reparaciones"]);
                    sheet.forEach((row: any) => {
                        const ref = doc(firestore, 'users', user.uid, 'repair_jobs', row.ID || doc(collection(firestore, 'temp')).id);
                        const [make, ...modelParts] = (row.Equipo || "").split(" ");
                        batch.set(ref, {
                            id: ref.id,
                            customerName: row.Cliente || '',
                            customerID: row.Cedula || '',
                            customerPhone: row.Telefono || '',
                            deviceMake: make || 'Genérico',
                            deviceModel: modelParts.join(" ") || 'N/A',
                            reportedIssue: row.Falla || 'Revisión',
                            estimatedCost: Number(row.Total) || 0,
                            amountPaid: Number(row.Pagado) || 0,
                            status: row.Estado || 'Pendiente',
                            createdAt: row.Fecha || new Date().toISOString(),
                            isPaid: (Number(row.Pagado) >= Number(row.Total))
                        }, { merge: true });
                        totalRecords++;
                    });
                }

                // 3. Procesar Fiados
                if (workbook.SheetNames.includes("Fiados")) {
                    const sheet = XLSX.utils.sheet_to_json(workbook.Sheets["Fiados"]);
                    sheet.forEach((row: any) => {
                        const ref = doc(firestore, 'users', user.uid, 'fiados', row.ID || doc(collection(firestore, 'temp')).id);
                        batch.set(ref, {
                            id: ref.id,
                            customerName: row.Cliente || '',
                            customerID: row.Cedula || '',
                            concept: row.Concepto || '',
                            totalAmount: Number(row.Total) || 0,
                            amountPaid: Number(row.Abonado) || 0,
                            status: row.Estado || 'Pendiente',
                            createdAt: row.Fecha || new Date().toISOString(),
                            dueDate: row.Vencimiento || null,
                            customerPhone: ''
                        }, { merge: true });
                        totalRecords++;
                    });
                }

                await batch.commit();
                toast({ title: "Importación Exitosa", description: `Se han restaurado ${totalRecords} registros correctamente.` });
            } catch (error) {
                console.error("Import error:", error);
                toast({ variant: "destructive", title: "Error al Importar", description: "El archivo no tiene el formato correcto." });
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
            signOut(auth).then(() => {
                window.location.href = '/';
            });
        }
    }

    return (
        <>
            <PageHeader title="Configuración y Perfil" />
            <main className="flex-1 p-4 sm:p-6 space-y-8 max-w-4xl mx-auto w-full">
                
                {/* 1. PERFIL DEL NEGOCIO */}
                <Card className="shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><UserCog className="w-5 h-5"/> Perfil del Negocio</CardTitle>
                        <CardDescription>Datos comerciales de tu negocio para facturación y reportes.</CardDescription>
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
                            </CardContent>
                            <CardFooter className="border-t pt-4">
                                <Button type="submit">Actualizar Perfil</Button>
                            </CardFooter>
                        </form>
                    </Form>
                </Card>

                {/* 2. GESTIÓN DE RESPALDOS (IMPORT/EXPORT UNIFICADO) */}
                <Card className="shadow-md border-primary/20 bg-primary/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-primary">
                            <Database className="w-5 h-5" /> Centro de Datos y Respaldo
                        </CardTitle>
                        <CardDescription>
                            Descarga un solo archivo con toda tu información o restaura un respaldo previo.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* BOTÓN EXPORTAR TODO */}
                            <Button 
                                variant="outline" 
                                className="h-20 justify-start gap-4 border-primary/30 bg-white hover:bg-primary/5"
                                onClick={handleExportSystemBackup}
                            >
                                <div className="p-3 bg-primary/10 rounded-full">
                                    <DownloadCloud className="w-6 h-6 text-primary" />
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-sm">Descargar Todo (Excel)</p>
                                    <p className="text-[10px] text-muted-foreground">Inventario, Ventas, Reparaciones y Fiados.</p>
                                </div>
                            </Button>

                            {/* BOTÓN IMPORTAR TODO (PROTEGIDO) */}
                            <AdminAuthDialog onAuthorized={() => fileInputRef.current?.click()}>
                                <Button 
                                    variant="outline" 
                                    className="h-20 justify-start gap-4 border-amber-300 bg-white hover:bg-amber-50"
                                    disabled={isImporting}
                                >
                                    <div className="p-3 bg-amber-100 rounded-full">
                                        {isImporting ? <RefreshCcw className="w-6 h-6 text-amber-600 animate-spin" /> : <UploadCloud className="w-6 h-6 text-amber-600" />}
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold text-sm text-amber-700">Importar Respaldo</p>
                                        <p className="text-[10px] text-muted-foreground">Sube un archivo Excel para restaurar datos.</p>
                                    </div>
                                </Button>
                            </AdminAuthDialog>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept=".xlsx, .xls"
                                onChange={handleImportBackup}
                            />
                        </div>

                        <div className="p-4 bg-white/50 border rounded-lg flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                            <div className="text-xs space-y-1">
                                <p className="font-bold text-primary">Información Importante:</p>
                                <p className="text-muted-foreground italic">
                                    Para una importación exitosa, asegúrate de que el archivo Excel tenga las pestañas correctas (Inventario, Reparaciones, Fiados). Si subes un registro con un ID ya existente, este se actualizará con la nueva información.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* 3. SEGURIDAD DE GERENTE (PIN) */}
                <Card className="shadow-md border-slate-200">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-slate-800"><KeyRound className="w-5 h-5"/> Clave de Gerente (PIN)</CardTitle>
                        <CardDescription>Protección para restauraciones, reembolsos y eliminaciones.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className={cn(
                            "flex items-center justify-between p-4 rounded-lg border transition-all",
                            isPinRequired ? "bg-primary/5 border-primary/20" : "bg-slate-50 border-slate-200"
                        )}>
                            <div className="space-y-0.5">
                                <Label className="text-base">Estado de Protección</Label>
                                <p className="text-xs text-muted-foreground">
                                    {isPinRequired ? "Se solicita PIN para acciones críticas." : "Las acciones de gerente se ejecutarán de inmediato (No recomendado)."}
                                </p>
                            </div>
                            <Switch 
                                checked={isPinRequired} 
                                onCheckedChange={setIsPinRequired} 
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">PIN Actual <span className="text-destructive">*</span></Label>
                                <Input 
                                    type="password" 
                                    value={currentPinVerify} 
                                    onChange={(e) => setCurrentPinVerify(e.target.value)} 
                                    placeholder="Introduce tu clave actual" 
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Nuevo PIN (Opcional)</Label>
                                <Input 
                                    type="password" 
                                    value={newPin} 
                                    onChange={(e) => setNewPin(e.target.value)} 
                                    placeholder="Nueva clave numérica" 
                                />
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="border-t pt-4">
                        <Button 
                            onClick={handleUpdatePinSettings} 
                            disabled={isUpdatingPin || !currentPinVerify}
                        >
                            {isUpdatingPin ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Guardar Ajustes de Seguridad"}
                        </Button>
                    </CardFooter>
                </Card>

                {/* 4. SEGURIDAD DE LA CUENTA (LOGIN) */}
                <Card className="shadow-md border-amber-100">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-amber-700"><ShieldCheck className="w-5 h-5"/> Seguridad de Acceso (Login)</CardTitle>
                        <CardDescription>Cambia tu usuario (email) y contraseña de acceso al sistema.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2"><Mail className="w-3 h-3" /> Email de Acceso</Label>
                                <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="correo@ejemplo.com" />
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2"><Lock className="w-3 h-3" /> Nueva Contraseña</Label>
                                <Input type="password" placeholder="Mínimo 6 caracteres" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="border-t pt-4">
                        <Button variant="outline" onClick={handleUpdateCredentials} disabled={isUpdatingCredentials}>
                            {isUpdatingCredentials ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Actualizar Credenciales"}
                        </Button>
                    </CardFooter>
                </Card>

                {/* 5. TASAS Y MÁRGENES */}
                <Card className="shadow-md">
                    <Form {...settingsForm}>
                        <form onSubmit={settingsForm.handleSubmit(handleSaveSettings)}>
                            <CardHeader>
                                <CardTitle>Tasas y Márgenes</CardTitle>
                                <CardDescription>Configuración económica global del negocio.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <FormField control={settingsForm.control} name="autoUpdateBcv" render={({ field }) => (
                                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                                        <div className="space-y-0.5">
                                            <FormLabel>Sincronización BCV Automática</FormLabel>
                                            <FormDescription>Actualiza con la tasa oficial cada 4 horas.</FormDescription>
                                        </div>
                                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                    </FormItem>
                                )} />
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <FormField control={settingsForm.control} name="bcvRate" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Tasa Oficial (BCV)</FormLabel>
                                            <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                                        </FormItem>
                                    )} />
                                    <FormField control={settingsForm.control} name="parallelRate" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Tasa de Reposición</FormLabel>
                                            <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                                        </FormItem>
                                    )} />
                                    <FormField control={settingsForm.control} name="profitMargin" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Margen Global (%)</FormLabel>
                                            <FormControl><Input type="number" {...field} /></FormControl>
                                        </FormItem>
                                    )} />
                                </div>
                            </CardContent>
                            <CardFooter className="border-t pt-4">
                                <Button type="submit" disabled={isLoading}>Guardar Configuración Económica</Button>
                            </CardFooter>
                        </form>
                    </Form>
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
