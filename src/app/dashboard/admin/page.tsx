
"use client";

import { PageHeader } from "@/components/page-header";
import { useCollection, useFirebase, useMemoFirebase, updateDocumentNonBlocking, setDocumentNonBlocking, useDoc } from "@/firebase";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Mail, Megaphone, Save, Trash2, Loader2, Circle, Users, LayoutGrid, AlertTriangle, RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { AdminAuthDialog } from "@/components/admin-auth-dialog";

const ALL_MODULES: { id: UserModule, label: string }[] = [
    { id: 'inventory', label: 'Inventario' },
    { id: 'pos', label: 'Punto de Venta' },
    { id: 'repairs', label: 'Reparaciones' },
    { id: 'reports', label: 'Reportes' },
    { id: 'analysis', label: 'Análisis' },
    { id: 'fiados', label: 'Fiados / Créditos' },
    { id: 'inventory_aging', label: 'Antigüedad / Vencimiento' },
];

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

    useEffect(() => {
        if (announcement) {
            setMessage(announcement.message || "");
            setType(announcement.type || "info");
            setActive(announcement.active || false);
        }
    }, [announcement]);

    const handleSave = () => {
        if (!announcementRef) return;
        setDocumentNonBlocking(announcementRef, {
            message,
            type,
            active,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        toast({ title: "Anuncio Actualizado", description: "Todos los negocios verán este mensaje." });
    };

    return (
        <Card className="border-primary/20 shadow-lg">
            <CardHeader className="bg-primary/5">
                <CardTitle className="flex items-center gap-2 text-primary"><Megaphone className="w-5 h-5"/> Anuncio Global</CardTitle>
                <CardDescription>Envía un mensaje a todos los negocios registrados.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                    <Label>Mensaje</Label>
                    <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ej: Nueva función disponible..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Nivel de Alerta</Label>
                        <Select value={type} onValueChange={setType}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="info">Información (Azul)</SelectItem>
                                <SelectItem value="warning">Advertencia (Naranja)</SelectItem>
                                <SelectItem value="critical">Crítico (Rojo)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2 pt-8">
                        <Switch checked={active} onCheckedChange={setActive} />
                        <Label>Mostrar Anuncio</Label>
                    </div>
                </div>
                <Button className="w-full" onClick={handleSave}><Save className="mr-2 h-4 w-4"/> Guardar y Publicar</Button>
            </CardContent>
        </Card>
    );
}

function UserEditDialog({ user, onSave, isOpen, onOpenChange }: { user: UserProfile, onSave: (data: Partial<UserProfile>) => void, isOpen: boolean, onOpenChange: (val: boolean) => void }) {
    const [businessName, setBusinessName] = useState(user.businessName || "");
    const [email, setEmail] = useState(user.email || "");
    const [status, setStatus] = useState(user.licenseStatus);
    const [expiry, setExpiry] = useState(user.licenseExpiry?.split('T')[0] || "");
    const [enabledModules, setEnabledModules] = useState<UserModule[]>(user.enabledModules || ALL_MODULES.map(m => m.id));

    const handleToggleModule = (moduleId: UserModule) => {
        setEnabledModules(prev => 
            prev.includes(moduleId) 
                ? prev.filter(m => m !== moduleId) 
                : [...prev, moduleId]
        );
    };

    const handleSave = () => {
        onSave({
            businessName,
            email,
            licenseStatus: status,
            licenseExpiry: expiry ? new Date(expiry).toISOString() : user.licenseExpiry,
            enabledModules
        });
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Gestionar Negocio: {user.email}</DialogTitle>
                    <DialogDescription>Modifica los datos del perfil, licencia y módulos habilitados.</DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Nombre del Negocio</Label>
                            <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ej: Poos Mariche Central" />
                        </div>
                        <div className="space-y-2">
                            <Label>Email de Contacto</Label>
                            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Estado Licencia</Label>
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
                        <div className="flex items-center gap-2 text-primary font-bold">
                            <LayoutGrid className="w-4 h-4" />
                            <span>Módulos Habilitados para este Negocio</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {ALL_MODULES.map((module) => (
                                <div key={module.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                                    <Label htmlFor={`module-${module.id}`} className="cursor-pointer font-medium">{module.label}</Label>
                                    <Switch 
                                        id={`module-${module.id}`}
                                        checked={enabledModules.includes(module.id)}
                                        onCheckedChange={() => handleToggleModule(module.id)}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleSave}>Guardar Cambios</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function AdminPage() {
    const { firestore, user: currentUser } = useFirebase();
    const { toast } = useToast();
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const usersCollection = useMemoFirebase(() => 
        firestore ? collection(firestore, "users") : null, 
        [firestore]
    );
    const { data: users, isLoading } = useCollection<UserProfile>(usersCollection);

    const handleUpdateUser = (userId: string, data: Partial<UserProfile>) => {
        if (!firestore) return;
        const userRef = doc(firestore, 'users', userId);
        updateDocumentNonBlocking(userRef, data);
        toast({ title: "Usuario Actualizado", description: "Los cambios se han guardado correctamente." });
    };

    const handleResetUserData = async (userId: string, email: string) => {
        if (!firestore || isDeleting) return;
        
        setIsDeleting(true);
        try {
            const batch = writeBatch(firestore);
            const subcollections = [
                'products', 
                'repair_jobs', 
                'sale_transactions', 
                'daily_reconciliations', 
                'app-settings', 
                'held_sales',
                'fiados'
            ];

            for (const sub of subcollections) {
                const colRef = collection(firestore, 'users', userId, sub);
                const snapshot = await getDocs(colRef);
                snapshot.forEach(d => {
                    batch.delete(doc(firestore, 'users', userId, sub, d.id));
                });
            }

            await batch.commit();

            toast({ 
                title: "Datos Reiniciados", 
                description: `Se han borrado todos los registros operativos de ${email}. El negocio está como nuevo.` 
            });
        } catch (error: any) {
            console.error("Error resetting user data:", error);
            toast({ 
                variant: "destructive",
                title: "Error al reiniciar", 
                description: "No se pudieron borrar todos los datos." 
            });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleDeleteUserWithData = async (userId: string, email: string) => {
        if (!firestore || isDeleting) return;
        
        setIsDeleting(true);
        try {
            const batch = writeBatch(firestore);
            const subcollections = [
                'products', 
                'repair_jobs', 
                'sale_transactions', 
                'daily_reconciliations', 
                'app-settings', 
                'held_sales',
                'fiados'
            ];

            for (const sub of subcollections) {
                const colRef = collection(firestore, 'users', userId, sub);
                const snapshot = await getDocs(colRef);
                snapshot.forEach(d => {
                    batch.delete(doc(firestore, 'users', userId, sub, d.id));
                });
            }

            const userRef = doc(firestore, 'users', userId);
            batch.delete(userRef);

            await batch.commit();

            toast({ 
                title: "Negocio Eliminado", 
                description: `Se han borrado el acceso y todos los datos asociados a ${email}.` 
            });
        } catch (error: any) {
            console.error("Error deleting user data:", error);
            toast({ 
                variant: "destructive",
                title: "Error al eliminar", 
                description: "No se pudieron borrar todos los datos." 
            });
        } finally {
            setIsDeleting(false);
        }
    };

    const sortedUsers = useMemo(() => {
        if (!users) return [];
        return [...users].sort((a, b) => {
            const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return dateB - dateA;
        });
    }, [users]);

    const activeNowCount = useMemo(() => {
        if (!users) return 0;
        const now = new Date();
        const threshold = subMinutes(now, 3);
        return users.filter(u => u.updatedAt && isAfter(new Date(u.updatedAt), threshold)).length;
    }, [users]);

    if (isLoading) {
        return <div className="p-8 text-center flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            Cargando panel de administración central...
        </div>;
    }

    return (
        <>
            <PageHeader title="Administración Central" />
            <main className="flex-1 p-4 sm:p-6 space-y-6 max-w-7xl mx-auto w-full">
                <div className="grid gap-6 md:grid-cols-3">
                    <div className="md:col-span-2 grid gap-4 grid-cols-2 sm:grid-cols-4">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-[10px] uppercase font-bold text-muted-foreground">Total Negocios</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{users?.length || 0}</div>
                            </CardContent>
                        </Card>
                        <Card className="border-green-200 bg-green-50/30">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-[10px] uppercase font-bold text-green-700 flex items-center gap-1.5">
                                    <Circle className="w-2 h-2 fill-green-500 animate-pulse" /> Activos Ya
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600">{activeNowCount}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-[10px] uppercase font-bold text-muted-foreground">Suscripciones</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-primary">
                                    {users?.filter(u => u.licenseStatus === 'active' && !u.isAdmin).length || 0}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-[10px] uppercase font-bold text-muted-foreground">En Prueba</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-blue-600">
                                    {users?.filter(u => u.licenseStatus === 'trial').length || 0}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                    <div className="md:col-span-1">
                        <AnnouncementEditor />
                    </div>
                </div>

                <Card className="shadow-md">
                    <CardHeader className="border-b bg-slate-50/50">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5"/> Usuarios del Sistema</CardTitle>
                                <CardDescription>Supervisión de actividad, accesos y licencias.</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50">
                                    <TableHead className="w-[100px]">Estado</TableHead>
                                    <TableHead>Negocio / Correo</TableHead>
                                    <TableHead>Plan / Licencia</TableHead>
                                    <TableHead>Última Actividad</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedUsers.map((user) => {
                                    const isOnline = user.updatedAt && isAfter(new Date(user.updatedAt), subMinutes(new Date(), 3));
                                    
                                    return (
                                        <TableRow key={user.uid} className={cn(isOnline && "bg-green-50/20")}>
                                            <TableCell>
                                                {isOnline ? (
                                                    <div className="flex items-center gap-2 text-green-600 font-bold text-xs">
                                                        <Circle className="w-2.5 h-2.5 fill-green-500 animate-pulse" />
                                                        <span>ONLINE</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                                                        <Circle className="w-2.5 h-2.5 fill-muted-foreground/30" />
                                                        <span>OFFLINE</span>
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-sm">{user.businessName || "Sin nombre"}</span>
                                                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                                        <Mail className="w-3 h-3" /> {user.email}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant={
                                                            user.licenseStatus === 'active' ? 'default' :
                                                            user.licenseStatus === 'trial' ? 'secondary' : 'destructive'
                                                        } className="text-[10px] h-5">
                                                            {user.licenseStatus.toUpperCase()}
                                                        </Badge>
                                                        {user.isAdmin && <Badge className="bg-amber-500 text-white border-0 text-[10px] h-5">ADMIN</Badge>}
                                                    </div>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        Vence: {user.licenseExpiry ? format(parseISO(user.licenseExpiry), "dd/MM/yy") : 'N/A'}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-xs font-medium">
                                                    {user.updatedAt ? format(parseISO(user.updatedAt), "dd/MM/yy - hh:mm a", { locale: es }) : 'Nunca'}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="outline" size="sm" onClick={() => setEditingUser(user)} className="h-8">
                                                        <Edit className="w-3.5 h-3.5 mr-1.5" /> Gestionar
                                                    </Button>
                                                    
                                                    {/* El reinicio de datos está habilitado para todos los usuarios, incluyendo el admin logueado */}
                                                    <AdminAuthDialog onAuthorized={() => handleResetUserData(user.uid, user.email)}>
                                                        <Button variant="ghost" size="sm" className="h-8 text-amber-600" title="Reiniciar Datos (Wipe)">
                                                            <AlertTriangle className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </AdminAuthDialog>

                                                    {/* Solo permitimos borrar la CUENTA de otros usuarios, no de nosotros mismos */}
                                                    {user.uid !== currentUser?.uid && (
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>¿Eliminar negocio permanentemente?</AlertDialogTitle>
                                                                    <AlertDialogDescription>Se borrarán el acceso y todos los datos asociados a {user.email}.</AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                    <AlertDialogAction 
                                                                        onClick={() => handleDeleteUserWithData(user.uid, user.email)}
                                                                        className="bg-destructive"
                                                                        disabled={isDeleting}
                                                                    >
                                                                        Eliminar Todo
                                                                    </AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </main>

            {editingUser && (
                <UserEditDialog 
                    user={editingUser} 
                    isOpen={!!editingUser} 
                    onOpenChange={(open) => !open && setEditingUser(null)}
                    onSave={(data) => handleUpdateUser(editingUser.uid, data)} 
                />
            )}
        </>
    );
}
