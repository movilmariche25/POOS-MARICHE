
"use client";

import { useState, useEffect } from 'react';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { ShieldCheck, Lock, Loader2, KeyRound } from 'lucide-react';
import type { UserProfile, UserModule } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

const FALLBACK_PIN = "2026";
const SESSION_KEY = 'mm_security_unlocked';

type SecurityGateProps = {
    children: React.ReactNode;
    module: UserModule | 'settings' | 'admin';
};

export function SecurityGate({ children, module }: SecurityGateProps) {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [pin, setPin] = useState("");
    
    const profileRef = useMemoFirebase(() => 
        (firestore && user) ? doc(firestore, 'users', user.uid) : null,
        [firestore, user?.uid]
    );
    const { data: profile, isLoading } = useDoc<UserProfile>(profileRef);

    useEffect(() => {
        if (!profile) return;

        // Si el PIN no es obligatorio o el módulo no está bloqueado, autorizar de inmediato
        const isLocked = profile.lockedModules?.includes(module as UserModule) || module === 'settings' || module === 'admin';
        
        if (profile.isPinRequired === false || !isLocked) {
            setIsAuthorized(true);
            return;
        }

        // Revisar si ya desbloqueó en esta sesión
        const sessionUnlocked = sessionStorage.getItem(SESSION_KEY) === 'true';
        if (sessionUnlocked) {
            setIsAuthorized(true);
        }
    }, [profile, module]);

    const handleUnlock = () => {
        const correctPin = profile?.securityPin || FALLBACK_PIN;
        if (pin === correctPin) {
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

    if (isLoading) return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary opacity-20" />
            <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest animate-pulse">Validando Seguridad</p>
        </div>
    );

    if (isAuthorized) return <>{children}</>;

    return (
        <div className="flex-1 flex items-center justify-center p-4 bg-slate-100/50 backdrop-blur-sm">
            <Card className="max-w-sm w-full shadow-2xl border-t-4 border-primary">
                <CardHeader className="text-center">
                    <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                        <Lock className="text-primary w-8 h-8" />
                    </div>
                    <CardTitle className="text-xl font-black uppercase tracking-tight">Sección Protegida</CardTitle>
                    <CardDescription className="text-xs font-medium">
                        Esta área contiene información sensible de {module.toUpperCase()}. Introduce tu PIN de Gerente.
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
                        El acceso permanecerá abierto mientras no cierres la pestaña.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
