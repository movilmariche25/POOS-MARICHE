
"use client";

import { useState, useEffect } from 'react';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Lock, Loader2, KeyRound } from 'lucide-react';
import type { UserProfile, UserModule } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

const SESSION_KEY = 'mm_security_unlocked';

type SecurityGateProps = {
    children: React.ReactNode;
    module: UserModule | 'settings' | 'admin';
};

export function SecurityGate({ children, module }: SecurityGateProps) {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    
    // El estado inicial es null (evaluando) para evitar parpadeos
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const [pin, setPin] = useState("");
    
    const profileRef = useMemoFirebase(() => 
        (firestore && user) ? doc(firestore, 'users', user.uid) : null,
        [firestore, user?.uid]
    );
    const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(profileRef);

    useEffect(() => {
        // Si el perfil aún está cargando, mantenemos el estado evaluando (null)
        if (isProfileLoading || !profile) {
            return;
        }

        const evaluateAccess = () => {
            // REGLA 1: Si no hay un PIN configurado, acceso total (no hay nada que pedir)
            if (!profile.securityPin) {
                return true;
            }

            // REGLA 2: Si ya desbloqueó en esta sesión, acceso total
            const sessionUnlocked = sessionStorage.getItem(SESSION_KEY) === 'true';
            if (sessionUnlocked) {
                return true;
            }

            // REGLA 3: Si la Seguridad Global está apagada, el acceso es libre para los módulos del taller (incluyendo Ajustes)
            if (profile.isPinRequired === false) {
                // El módulo 'admin' (Administración Central) siempre requiere PIN por ser de nivel superior
                if (module === 'admin') return false;
                return true;
            }

            // REGLA 4: Si la Seguridad Global está encendida, Ajustes y Admin SIEMPRE requieren PIN
            if (module === 'settings' || module === 'admin') {
                return false;
            }

            // REGLA 5: Solo bloquear si el módulo específico está en la lista de bloqueados
            const activeLockedModules = profile.lockedModules || [];
            if (activeLockedModules.includes(module as UserModule)) {
                return false;
            }

            // Por defecto, si no está bloqueado explícitamente, es libre
            return true;
        };

        setIsAuthorized(evaluateAccess());
    }, [profile, isProfileLoading, module]);

    const handleUnlock = () => {
        if (!profile?.securityPin) return;

        if (pin === profile.securityPin) {
            sessionStorage.setItem(SESSION_KEY, 'true');
            setIsAuthorized(true);
            toast({ title: "Acceso Concedido", description: "Sección desbloqueada." });
        } else {
            toast({ 
                variant: "destructive", 
                title: "PIN Incorrecto", 
                description: "Vuelve a intentarlo." 
            });
            setPin("");
        }
    };

    // Mientras evalúa o carga el perfil, mostrar loader para evitar el "flash" de contenido
    if (isAuthorized === null || isProfileLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4 min-h-[400px]">
                <Loader2 className="w-10 h-10 animate-spin text-primary opacity-20" />
                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest animate-pulse">
                    Verificando Credenciales...
                </p>
            </div>
        );
    }

    // Si está autorizado, renderizar el contenido directamente
    if (isAuthorized) {
        return <>{children}</>;
    }

    // Si no está autorizado, mostrar la pantalla de bloqueo
    return (
        <div className="flex-1 flex items-center justify-center p-4 bg-slate-100/50 backdrop-blur-sm">
            <Card className="max-w-sm w-full shadow-2xl border-t-4 border-primary animate-in fade-in zoom-in-95 duration-200">
                <CardHeader className="text-center">
                    <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                        <Lock className="text-primary w-8 h-8" />
                    </div>
                    <CardTitle className="text-xl font-black uppercase tracking-tight">Sección Protegida</CardTitle>
                    <CardDescription className="text-xs font-medium">
                        Introduce tu PIN de Gerente para acceder a esta sección.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <div className="relative">
                            <KeyRound className="absolute left-3 top-3 h-5 w-5 text-muted-foreground opacity-50" />
                            <Input 
                                type="password" 
                                placeholder="••••" 
                                value={pin} 
                                onChange={(e) => setPin(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                                className="text-center text-3xl tracking-[0.5em] font-black h-14 pl-10"
                                maxLength={8}
                                autoFocus
                            />
                        </div>
                    </div>
                    <Button className="w-full h-12 text-base font-bold shadow-lg" onClick={handleUnlock}>
                        DESBLOQUEAR AHORA
                    </Button>
                    <p className="text-[10px] text-center text-muted-foreground italic">
                        Una vez desbloqueado, podrás navegar libremente mientras no cierres la pestaña.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
