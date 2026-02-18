
"use client";

import type { ReactNode } from 'react';
import { SidebarNav } from '@/components/sidebar-nav';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { UserProfile } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Lock, LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { isAfter, parseISO } from 'date-fns';
import { GlobalAnnouncement } from '@/components/dashboard/global-announcement';

const ExchangeRateReminder = dynamic(
    () => import('@/components/dashboard/exchange-rate-reminder').then(mod => mod.ExchangeRateReminder),
    { 
        ssr: false,
        loading: () => (
             <div className="p-4 border-b">
                <Skeleton className="h-24 w-full" />
            </div>
        )
    }
);

function LicenseExpiredScreen() {
    const { auth } = useFirebase();
    const whatsappNumber = "584141135956";
    const message = encodeURIComponent("Hola, mi licencia de Mariche Movil ha expirado. Deseo renovar mi suscripción.");
    
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <Card className="max-w-md w-full shadow-2xl border-t-4 border-destructive">
                <CardHeader className="text-center">
                    <div className="flex justify-center mb-4">
                        <div className="p-3 bg-destructive/10 rounded-full">
                            <Lock className="w-12 h-12 text-destructive" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl">Licencia Expirada</CardTitle>
                    <CardDescription>
                        Tu acceso al sistema ha sido suspendido temporalmente por vencimiento de licencia.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-center">
                    <p className="text-sm text-muted-foreground">
                        Para reactivar tu taller y recuperar el acceso a tus datos, por favor contacta con el administrador del sistema.
                    </p>
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 text-left">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800 font-medium">
                            Tus datos (inventario, ventas y reparaciones) están seguros, pero el acceso a las funciones operativas está bloqueado.
                        </p>
                    </div>
                    <div className="flex flex-col gap-2">
                        <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank')}>
                            Contactar Soporte (WhatsApp)
                        </Button>
                        <Button variant="ghost" onClick={() => auth && signOut(auth)}>
                            <LogOut className="w-4 h-4 mr-2" /> Cerrar Sesión
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { firestore, user, isUserLoading } = useFirebase();
  
  const profileRef = useMemoFirebase(() => 
    (firestore && user) ? doc(firestore, 'users', user.uid) : null,
    [firestore, user?.uid]
  );
  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(profileRef);

  if (isUserLoading || isProfileLoading) {
      return (
          <div className="flex h-screen items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <Skeleton className="h-4 w-32" />
              </div>
          </div>
      );
  }

  // Lógica de validación de Licencia
  const isExpired = profile && 
                    !profile.isAdmin && 
                    (profile.licenseStatus === 'expired' || (profile.licenseExpiry && isAfter(new Date(), parseISO(profile.licenseExpiry))));

  if (isExpired) {
      return <LicenseExpiredScreen />;
  }

  return (
    <SidebarProvider>
      <SidebarNav />
      <SidebarInset>
          <GlobalAnnouncement />
          <ExchangeRateReminder />
          {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
