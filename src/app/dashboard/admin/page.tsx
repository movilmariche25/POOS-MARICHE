
"use client";

import { PageHeader } from "@/components/page-header";
import { useCollection, useFirebase, useMemoFirebase, updateDocumentNonBlocking, setDocumentNonBlocking, useDoc } from "@/firebase";
import { collection, doc, writeBatch, getDocs } from "firebase/firestore";
import type { UserProfile } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
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
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Mail, Building, Megaphone, Save, Trash2, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { AlertDialogTrigger } from "@/components/ui/alert-dialog";

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
        toast({ title: "Anuncio Actualizado", description: "Todos los usuarios verán este mensaje." });
    };

    return (
        <Card className="border-primary/20 shadow-lg">
            <CardHeader className="bg-primary/5">
                <CardTitle className="flex items-center gap-2"><Megaphone className="w-5 h-5"/> Anuncio Global</CardTitle>
                <CardDescription>Envía un mensaje a todos los talleres registrados.</CardDescription>
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

    const handleSave = () => {
        onSave({
            businessName,
            email,
            licenseStatus: status,
            licenseExpiry: expiry ? new Date(expiry).toISOString() : user.licenseExpiry
        });
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Editar Taller: {user.email}</DialogTitle>
                    <DialogDescription>Modifica los datos del perfil y estado de la licencia.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Nombre del Negocio</Label>
                        <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ej: Taller Mariche" />
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
                'held_sales'
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
                title: "Taller Eliminado", 
                description: `Se han borrado el acceso y todos los datos asociados a ${email}.` 
            });
        } catch (error: any) {
            console.error("Error deleting user data:", error);
            toast({ 
                variant: "destructive",
                title: "Error al eliminar", 
                description: "No se pudieron borrar todos los datos. El perfil ha sido mantenido por seguridad." 
            });
        } finally {
            setIsDeleting(false);
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center">Cargando panel de control...</div>;
    }

    return (
        <>
            <PageHeader title="Administración Central" />
            <main className="flex-1 p-4 sm:p-6 space-y-6">
                <div className="grid gap-6 md:grid-cols-3">
                    <div className="md:col-span-2 grid gap-4 md:grid-cols-3">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Total Talleres</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{users?.length || 0}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Licencias Activas</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600">
                                    {users?.filter(u => u.licenseStatus === 'active' || u.isAdmin).length || 0}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">En Prueba</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-blue-600">
                                    {users?.filter(u => u.licenseStatus === 'trial').length || 0}
                                </div>
                            </CardContent>
                        </div>
                    </div>
                    <div className="md:col-span-1">
                        <AnnouncementEditor />
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Talleres Registrados</CardTitle>
                        <CardDescription>Administra el acceso, nombres de negocio y licencias de la plataforma.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Negocio / Dueño</TableHead>
                                    <TableHead>Estado Licencia</TableHead>
                                    <TableHead>Vencimiento</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users?.map((user) => (
                                    <TableRow key={user.uid}>
                                        <TableCell>
                                            <div className="font-bold flex items-center gap-2">
                                                <Building className="w-3 h-3 text-muted-foreground" />
                                                {user.businessName || "Sin nombre configurado"}
                                            </div>
                                            <div className="text-sm text-muted-foreground flex items-center gap-2">
                                                <Mail className="w-3 h-3" /> {user.email}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={
                                                user.licenseStatus === 'active' ? 'default' :
                                                user.licenseStatus === 'trial' ? 'secondary' : 'destructive'
                                            }>
                                                {user.licenseStatus.toUpperCase()}
                                            </Badge>
                                            {user.isAdmin && <Badge className="ml-2 bg-amber-500 text-white border-0 shadow-sm">ADMIN TOTAL</Badge>}
                                        </TableCell>
                                        <TableCell className="text-sm font-mono">
                                            {user.licenseExpiry ? format(parseISO(user.licenseExpiry), "dd/MM/yyyy") : '---'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="outline" size="sm" onClick={() => setEditingUser(user)}>
                                                    <Edit className="w-4 h-4 mr-1" /> Editar
                                                </Button>
                                                
                                                {user.uid !== currentUser?.uid && (
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <DialogHeader>
                                                                <DialogTitle>¿Eliminar taller y TODOS sus datos?</DialogTitle>
                                                                <DialogDescription className="space-y-3">
                                                                    <p>Esta acción es <strong>irreversible</strong> y realizará lo siguiente:</p>
                                                                    <ul className="list-disc pl-5 text-xs space-y-1">
                                                                        <li>Borrará el perfil de acceso de <strong>{user.email}</strong>.</li>
                                                                        <li>Eliminará todo su inventario de productos.</li>
                                                                        <li>Borrará el historial completo de ventas y transacciones.</li>
                                                                        <li>Eliminará todos los registros de reparaciones y clientes.</li>
                                                                    </ul>
                                                                    <p className="font-bold text-destructive">¿Estás absolutamente seguro de querer proceder?</p>
                                                                </DialogDescription>
                                                            </DialogHeader>
                                                            <DialogFooter>
                                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                <AlertDialogAction 
                                                                    onClick={() => handleDeleteUserWithData(user.uid, user.email)}
                                                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                                    disabled={isDeleting}
                                                                >
                                                                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                                                    Eliminar Todo Permanentemente
                                                                </AlertDialogAction>
                                                            </DialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                )}
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
                    onOpenChange={(open) => !open && setEditingUser(null)}
                    onSave={(data) => handleUpdateUser(editingUser.uid, data)} 
                />
            )}
        </>
    );
}
