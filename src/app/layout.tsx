"use client";

import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { FirebaseClientProvider, useUser, useFirebase } from '@/firebase';
import { AuthView } from '@/components/auth-view';
import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import './globals.css';

function AppContent({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const { firestore, auth } = useFirebase();
  const currentSessionId = useRef<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const isKickingOut = useRef(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    if (user && firestore && auth && !isKickingOut.current) {
      // 1. Generar o recuperar ID de sesión único para ESTA pestaña/instancia
      if (!currentSessionId.current) {
        let sid = sessionStorage.getItem('mm_active_session_id');
        if (!sid) {
          sid = Math.random().toString(36).substring(7) + Date.now();
          sessionStorage.setItem('mm_active_session_id', sid);
        }
        currentSessionId.current = sid;
      }

      const sessionId = currentSessionId.current;
      const profileRef = doc(firestore, 'users', user.uid);

      const syncAndWatch = async () => {
        try {
          // PASO CRÍTICO: Asegurar que el token esté fresco
          await user.getIdToken(true);
          
          const profileSnap = await getDoc(profileRef);
          
          const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
          const adminRoleSnap = await getDoc(adminRoleRef);
          const isAdmin = adminRoleSnap.exists();

          // 2. Registrar ESTA sesión como la activa
          const profileData = {
            uid: user.uid,
            email: user.email,
            isAdmin: isAdmin,
            lastSessionId: sessionId,
            updatedAt: new Date().toISOString(),
            ...(!profileSnap.exists() && {
              licenseStatus: isAdmin ? 'active' : 'trial',
              licenseExpiry: isAdmin 
                ? new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000).toISOString() 
                : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              createdAt: new Date().toISOString(),
            })
          };

          await setDoc(profileRef, profileData, { merge: true });
          setIsInitializing(false);

          // 3. Vigilar cambios en tiempo real para sesión única
          unsubscribe = onSnapshot(profileRef, (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              // Si el ID en la DB es distinto al nuestro, alguien más entró con ESTA cuenta
              if (data.lastSessionId && data.lastSessionId !== sessionId && !isKickingOut.current) {
                isKickingOut.current = true;
                
                // Detener el escuchador inmediatamente para evitar errores de permisos al cerrar sesión
                if (unsubscribe) {
                  unsubscribe();
                  unsubscribe = undefined;
                }

                signOut(auth).then(() => {
                  sessionStorage.removeItem('mm_active_session_id');
                  window.location.href = '/'; // Redirección limpia al inicio
                }).catch(() => {
                  window.location.href = '/';
                });
              }
            }
          }, (error) => {
            // Ignorar errores si estamos en proceso de salida
            if (!isKickingOut.current && error.code !== 'permission-denied') {
               console.error("Watcher error:", error);
            }
          });

        } catch (serverError: any) {
          if (!isKickingOut.current) {
            console.error("Session sync failed:", serverError);
            if (serverError.code === 'permission-denied') {
              const permissionError = new FirestorePermissionError({
                path: `users/${user.uid}`,
                operation: 'get',
              } satisfies SecurityRuleContext);
              errorEmitter.emit('permission-error', permissionError);
            }
          }
          setIsInitializing(false);
        }
      };
      
      syncAndWatch();
    } else if (!user) {
      setIsInitializing(false);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user, firestore, auth]);

  if (isUserLoading || isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-primary/20 rounded-full" />
          <div className="h-4 w-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  return <>{children}</>;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#FFFFFF" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <title>MARICHE MOVIL - Gestión de Taller</title>
      </head>
      <body className={cn("font-sans antialiased", process.env.NODE_ENV === 'development' ? 'debug-screens' : '')}>
        <FirebaseClientProvider>
          <AppContent>
            {children}
          </AppContent>
          <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
