
"use client";

import { PageHeader } from "@/components/page-header";
import { useCollection, useFirebase, useMemoFirebase, updateDocumentNonBlocking, setDocumentNonBlocking, useDoc, deleteDocumentNonBlocking } from "@/firebase";
import { collection, doc, writeBatch, getDocs } from "firebase/firestore";
import type { UserProfile, UserModule } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, parseISO, isAfter, subMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Mail, Megaphone, Save, Trash2, Loader2, Circle, Users, LayoutGrid, AlertTriangle, ShieldOff, KeyRound } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { SecurityGate } from "@/components/security-gate";

const ALL_MODULES: { id: UserModule, label: string }[] = [
    { id: 'inventory', label: 'Inventario' },
    { id: 'pos', label: 'Punto de Venta' },
    { id: 'repairs', label: 'Reparaciones' },
    { id: 'reports', label: 'Reportes Financieros' },
    { id: 'analysis', label: 'Análisis de Negocio' },
    { id: 'fiados', label: 'Fiados / Créditos' },
    { id: 'payroll', label: 'Registro de Pago' },
    { id: 'loans', label: 'Préstamos' },
    { id: 'exchange', label: 'Cambio de Divisa' },
    { id: 'treasury', label: 'Tesorería' },
    { id: 'inventory_aging', label: 'Antigüedad de Stock' },
];

export default function AdminPage() {
    return (
        <SecurityGate module="admin">
            <AdminContent />
        </SecurityGate>
    );
}

function AnnouncementEditor() {
    const { firestore } = useFirebase();
    const { toast } = useToast();
    const announcementRef = useMemoFirebase(() => 
        firestore ? doc(firestore, 'system', 'announcements') : null, 
        [firestore]
    );
    const { data: announcement } = useDoc<any>(announcementRef);
    const [message, setMessage] = useState("");
    const [type, setType] = useState("info");
    const [active, setActive] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        if (announcement && !isDirty) {
            setMessage(announcement.message || "");
            setType(announcement.type || "info");
            setActive(announcement.active || false);
        }
    }, [announcement, isDirty]);

    const handleSave = () => {
        if (!announcementRef) return;
        setDocumentNonBlocking(announcementRef, {
            message,
            type,
            active,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        toast({ title: "Anuncio Actualizado" });
        setIsDirty(false);
    };

    return (
        <Card className="border-primary/20 shadow-lg">
            <CardHeader className="bg-primary/5">
                <CardTitle className="flex items-center gap-2 text-primary"><Megaphone className="w-5 h-5"/> Anuncio Global</CardTitle>
                <CardDescription>Envía un mensaje a todos los negocios.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                    <Label>Mensaje</Label>
                    <Input 
                        value={message} 
                        onChange={(e) => { setMessage(e.target.value); setIsDirty(true); }} 
                        placeholder="Ej: Nueva función disponible..." 
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Nivel</Label>
                        <Select value={type} onValueChange={(v) => { setType(v); setIsDirty(true); }}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="info">Info</SelectItem>
                                <SelectItem value="warning">Advertencia</SelectItem>
                                <SelectItem value="critical">Crítico</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2 pt-8">
                        <Switch checked={active} onCheckedChange={(v) => { setActive(v); setIsDirty(true); }} />
                        <Label>Activo</Label>
                    </div>
                </div>
                <Button className="w-full" onClick={handleSave} disabled={!isDirty}><Save className="mr-2 h-4 w-4"/> Publicar</Button>
            </CardContent>
        </Card>
    );
}

function UserEditDialog({ user, onSave, onResetPin, isOpen, onOpenChange }: { user: UserProfile, onSave: (data: Partial<UserProfile>) => void, onResetPin: (userId: string) => void, isOpen: boolean, onOpenChange: (val: boolean) => void }) {
    const [businessName, setBusinessName] = useState(user.businessName || "");
    const [email, setEmail] = useState(user.email || "");
    const [status, setStatus] = useState(user.licenseStatus);
    const [expiry, setExpiry] = useState(user.licenseExpiry?.split('T')[0] || "");
    const [enabledModules, setEnabledModules] = useState<UserModule[]>(user.enabledModules || ALL_MODULES.map(m => m.id));
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

    const handleToggleModule = (moduleId: UserModule) => {
        setEnabledModules(prev => prev.includes(moduleId) ? prev.filter(m => m !== moduleId) : [...prev, moduleId]);
    };

    const handleSave = () => {
        onSave({ businessName, email, licenseStatus: status, licenseExpiry: expiry ? new Date(expiry).toISOString() : user.licenseExpiry, enabledModules });
        onOpenChange(false);
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Gestionar Negocio</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Nombre</Label>
                                <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Email</Label>
                                <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Licencia</Label>
                                    <Select value={status} onValueChange={(val: any) => setStatus(val)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="active">Activa</SelectItem>
                                            <SelectItem value="trial">Prueba</SelectItem>
                                            <SelectItem value="expired">Expirada</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Vencimiento</Label>
                                    <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
                                </div>
                            </div>
                        </div>
                        <Separator />
                        <div className="space-y-4">
                            <Label className="font-bold">Módulos Habilitados</Label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {ALL_MODULES.map((m) => (
                                    <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                                        <Label className="text-xs">{m.label}</Label>
                                        <Switch checked={enabledModules.includes(m.id)} onCheckedChange={() => handleToggleModule(m.id)} />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <Separator />
                        <div className="space-y-4 p-4 border border-destructive/20 bg-destructive/5 rounded-xl">
                            <Label className="font-black text-destructive uppercase text-[10px] tracking-widest flex items-center gap-2">
                                <AlertTriangle className="w-3 h-3" /> Seguridad y PIN
                            </Label>
                            <div className="flex justify-between items-center gap-4">
                                <div className="space-y-0.5">
                                    <p className="text-xs font-bold text-slate-800">Clave de Seguridad del Usuario</p>
                                    <p className="text-[10px] text-muted-foreground leading-tight">Si el usuario olvidó su PIN de gerente, puedes resetearlo aquí para que cree uno nuevo.</p>
                                </div>
                                <Button 
                                    type="button" 
                                    variant="destructive" 
                                    size="sm" 
                                    className="shrink-0 h-8 font-black text-[10px]"
                                    onClick={() => setIsResetConfirmOpen(true)}
                                >
                                    <ShieldOff className="w-3.5 h-3.5 mr-1.5" /> RESETEAR PIN
                                </Button>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                        <Button onClick={handleSave}>Guardar Cambios</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <KeyRound className="text-destructive w-5 h-5" /> ¿Eliminar PIN de seguridad?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción borrará la clave actual de <span className="font-bold text-slate-900">{user.businessName}</span>. 
                            El usuario deberá configurar una clave nueva la próxima vez que intente usar funciones de gerente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={() => {
                                onResetPin(user.uid);
                                setIsResetConfirmOpen(false);
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Confirmar Reseteo
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

function AdminContent() {
    const { firestore, user: currentUser } = useFirebase();
    const { toast } = useToast();
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
    const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);

    const usersCollection = useMemoFirebase(() => 
        (firestore) ? collection(firestore, "users") : null, 
        [firestore]
    );
    const { data: users, isLoading } = useCollection<UserProfile>(usersCollection);

    const handleUpdateUser = (userId: string, data: Partial<UserProfile>) => {
        if (!firestore) return;
        const userRef = doc(firestore, 'users', userId);
        updateDocumentNonBlocking(userRef, data);
        toast({ title: "Usuario Actualizado" });
    };

    const handleResetPin = (userId: string) => {
        if (!firestore) return;
        const userRef = doc(firestore, 'users', userId);
        // Borramos el PIN y desactivamos el requerimiento temporalmente para que el usuario pueda reconfigurarlo
        updateDocumentNonBlocking(userRef, { 
            securityPin: "", 
            isPinRequired: false 
        });
        toast({ 
            title: "PIN Reseteado", 
            description: "La seguridad del negocio ha sido reiniciada correctamente." 
        });
    };

    const handleDeleteUser = () => {
        if (!firestore || !userToDelete) return;
        
        // Evitar que el admin se borre a sí mismo
        if (userToDelete.uid === currentUser?.uid) {
            toast({ title: "Acción Denegada", description: "No puedes eliminar tu propia cuenta de administrador.", variant: "destructive" });
            setUserToDelete(null);
            return;
        }

        const userRef = doc(firestore, 'users', userToDelete.uid);
        deleteDocumentNonBlocking(userRef);
        toast({ title: "Negocio Eliminado", description: "El perfil del negocio ha sido borrado correctamente." });
        setUserToDelete(null);
    };

    const sortedUsers = useMemo(() => {
        if (!users) return [];
        return [...users].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    }, [users]);

    if (isLoading) return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>;

    return (
        <>
            <PageHeader title="Administración Central" />
            <main className="flex-1 p-4 sm:p-6 space-y-6 max-w-7xl mx-auto w-full">
                <div className="grid gap-6 md:grid-cols-3">
                    <div className="md:col-span-2 grid gap-4 grid-cols-2">
                        <Card><CardHeader><CardTitle className="text-xs uppercase">Total Negocios</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{users?.length || 0}</div></CardContent></Card>
                        <Card><CardHeader><CardTitle className="text-xs uppercase">Activos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{users?.filter(u => u.licenseStatus === 'active').length || 0}</div></CardContent></Card>
                    </div>
                    <div className="md:col-span-1">
                        <AnnouncementEditor />
                    </div>
                </div>
                <Card>
                    <CardHeader><CardTitle>Usuarios del Sistema</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Negocio</TableHead>
                                    <TableHead>Licencia</TableHead>
                                    <TableHead>Última Actividad</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedUsers.map((u) => (
                                    <TableRow key={u.uid}>
                                        <TableCell>
                                            <div className="font-bold">{u.businessName || "Sin nombre"}</div>
                                            <div className="text-xs text-muted-foreground">{u.email}</div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={u.licenseStatus === 'active' ? 'default' : 'destructive'}>
                                                {u.licenseStatus.toUpperCase()}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {u.updatedAt ? format(parseISO(u.updatedAt), "dd/MM/yy HH:mm", { locale: es }) : 'N/A'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="outline" size="sm" onClick={() => setEditingUser(u)}>
                                                    <Edit className="w-3.5 h-3.5 mr-1" /> Gestionar
                                                </Button>
                                                <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setUserToDelete(u)}>
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </main>

            {editingUser && (
                <UserEditDialog 
                    user={editingUser} 
                    isOpen={!!editingUser} 
                    onOpenChange={(o) => !o && setEditingUser(null)} 
                    onSave={(d) => handleUpdateUser(editingUser.uid, d)} 
                    onResetPin={handleResetPin}
                />
            )}

            <AlertDialog open={!!userToDelete} onOpenChange={(o) => !o && setUserToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Estás completamente seguro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción eliminará el perfil del negocio <span className="font-bold text-foreground">"{userToDelete?.businessName}"</span> ({userToDelete?.email}). 
                            El acceso del usuario será revocado.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Eliminar Negocio
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
