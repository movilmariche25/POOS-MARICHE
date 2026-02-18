
"use client";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogOut, ShieldCheck, UserCog, Mail, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useDoc, useFirebase, useMemoFirebase, setDocumentNonBlocking } from "@/firebase";
import { doc } from "firebase/firestore";
import { useEffect, useState } from "react";
import type { AppSettings, UserProfile } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import { signOut } from "firebase/auth";
import { updateUserEmail, updateUserPassword } from "@/firebase/non-blocking-login";
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
});

export default function SettingsPage() {
    const { toast } = useToast();
    const { firestore, auth, user } = useFirebase();
    const [isUpdatingCredentials, setIsUpdatingCredentials] = useState(false);
    
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

    const settingsForm = useForm<z.infer<typeof settingsSchema>>({
        resolver: zodResolver(settingsSchema),
        defaultValues: { bcvRate: 1, parallelRate: 1, profitMargin: 100, autoUpdateBcv: false }
    });

    const profileForm = useForm<z.infer<typeof profileSchema>>({
        resolver: zodResolver(profileSchema),
        defaultValues: { businessName: "" }
    });

    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");

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
            profileForm.reset({ businessName: profile.businessName || "" });
            setNewEmail(profile.email || "");
        }
    }, [settings, profile, settingsForm, profileForm]);

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

    const handleUpdateCredentials = async () => {
        if (!auth) return;
        setIsUpdatingCredentials(true);
        try {
            if (newEmail !== user?.email) {
                await updateUserEmail(auth, newEmail);
                if (userProfileRef) setDocumentNonBlocking(userProfileRef, { email: newEmail }, { merge: true });
            }
            if (newPassword) {
                await updateUserPassword(auth, newPassword);
            }
            toast({ title: "Credenciales actualizadas exitosamente" });
            setNewPassword("");
        } catch (e: any) {
            toast({ 
                variant: "destructive", 
                title: "Error de Seguridad", 
                description: e.code === 'auth/requires-recent-login' 
                    ? "Para cambiar estos datos debes haber iniciado sesión recientemente. Cierra sesión y vuelve a entrar." 
                    : e.message 
            });
        } finally {
            setIsUpdatingCredentials(false);
        }
    };

    const handleSignOut = () => {
        if (auth) {
            localStorage.removeItem('mm_session_id');
            signOut(auth);
        }
    }

    return (
        <>
            <PageHeader title="Configuración y Perfil" />
            <main className="flex-1 p-4 sm:p-6 space-y-8 max-w-4xl">
                
                {/* 1. PERFIL DEL TALLER */}
                <Card className="shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><UserCog className="w-5 h-5"/> Perfil del Taller</CardTitle>
                        <CardDescription>Datos públicos de tu negocio.</CardDescription>
                    </CardHeader>
                    <Form {...profileForm}>
                        <form onSubmit={profileForm.handleSubmit(handleSaveProfile)}>
                            <CardContent className="space-y-4">
                                <FormField control={profileForm.control} name="businessName" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nombre Comercial</FormLabel>
                                        <FormControl><Input {...field} placeholder="Ej: Mariche Movil C.A." /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                            </CardContent>
                            <CardFooter className="border-t pt-4">
                                <Button type="submit">Actualizar Perfil</Button>
                            </CardFooter>
                        </form>
                    </Form>
                </Card>

                {/* 2. SEGURIDAD DE LA CUENTA */}
                <Card className="shadow-md border-amber-100">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-amber-700"><ShieldCheck className="w-5 h-5"/> Seguridad de Acceso</CardTitle>
                        <CardDescription>Cambia tu usuario (email) y contraseña de acceso al sistema.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2"><Mail className="w-3 h-3" /> Email de Acceso</Label>
                                <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2"><Lock className="w-3 h-3" /> Nueva Contraseña</Label>
                                <Input type="password" placeholder="Mínimo 6 caracteres" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground italic">Nota: Si cambias el email, tendrás que usar el nuevo para entrar la próxima vez.</p>
                    </CardContent>
                    <CardFooter className="border-t pt-4">
                        <Button variant="outline" onClick={handleUpdateCredentials} disabled={isUpdatingCredentials}>
                            {isUpdatingCredentials ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Actualizar Credenciales"}
                        </Button>
                    </CardFooter>
                </Card>

                {/* 3. TASAS Y MÁRGENES */}
                <Card className="shadow-md">
                    <Form {...settingsForm}>
                        <form onSubmit={settingsForm.handleSubmit(handleSaveSettings)}>
                            <CardHeader>
                                <CardTitle>Tasas y Márgenes</CardTitle>
                                <CardDescription>Configuración global de precios para tu inventario.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <FormField control={settingsForm.control} name="autoUpdateBcv" render={({ field }) => (
                                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                                        <div className="space-y-0.5">
                                            <FormLabel>Sincronización BCV Automática</FormLabel>
                                            <FormDescription>Actualiza con la API oficial cada 4 horas.</FormDescription>
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
