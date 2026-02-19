
"use client";

import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { FirebaseClientProvider, useFirebase } from '@/firebase';
import { AuthView } from '@/components/auth-view';
import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { Loader2 } from 'lucide-react';
import './globals.css';

function AppContent({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading, firestore, auth } = useFirebase();
  const [isInitializing, setIsInitializing] = useState(true);
  const [isKickingOut, setIsKickingOut] = useState(false);
  const currentSessionId = useRef<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Caso: No hay usuario autenticado
    if (!user || !firestore || !auth) {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setIsInitializing(false);
      return;
    }

    const syncProfileAndSession = async () => {
      try {
        // 1. Obtener token fresco para asegurar que Firestore nos reconozca
        await user.getIdToken(true);

        // 2. Establecer identificador de sesión único para esta pestaña/navegador
        if (!currentSessionId.current) {
          let sid = sessionStorage.getItem('mm_active_session_id');
          if (!sid) {
            sid = Math.random().toString(36).substring(2) + Date.now();
            sessionStorage.setItem('mm_active_session_id', sid);
          }
          currentSessionId.current = sid;
        }

        const sessionId = currentSessionId.current;
        const profileRef = doc(firestore, 'users', user.uid);
        
        // 3. Verificar rol de administrador
        const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
        const adminRoleSnap = await getDoc(adminRoleRef);
        const isAdmin = adminRoleSnap.exists();

        // 4. Registro de Sesión (Atómico)
        // Obtenemos el perfil actual para no sobrescribir datos de licencia si ya existen
        const profileSnap = await getDoc(profileRef);
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

        // 5. Iniciar Vigilante de Sesión Única
        // Solo activamos la vigilancia después de haber registrado nuestra sesión exitosamente
        unsubscribeRef.current = onSnapshot(profileRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            // Si el ID en la DB es distinto al nuestro, significa que se inició sesión en otro lugar
            if (data.lastSessionId && data.lastSessionId !== sessionId) {
              handleAutoSignOut();
            }
          }
        }, (err) => {
          // Si el error es de permisos, probablemente es porque estamos en proceso de salida
          if (err.code !== 'permission-denied') {
            console.error("Session Watcher Error:", err);
          }
        });

        setIsInitializing(false);
      } catch (serverError: any) {
        console.error("Session sync failed:", serverError);
        // Emitir error contextual para depuración de reglas
        if (user) {
            const permissionError = new FirestorePermissionError({
                path: `users/${user.uid}`,
                operation: 'get',
            } satisfies SecurityRuleContext);
            errorEmitter.emit('permission-error', permissionError);
        }
        setIsInitializing(false);
      }
    };

    const handleAutoSignOut = async () => {
      // Congelar la UI para evitar que el usuario haga algo mientras cerramos
      setIsKickingOut(true);
      
      // Detener el escuchador inmediatamente
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      try {
        // Limpiar datos locales y cerrar sesión en Firebase
        sessionStorage.removeItem('mm_active_session_id');
        await signOut(auth);
        
        // Pequeña pausa para asegurar que el estado de Firebase se propague
        setTimeout(() => {
          window.location.href = '/'; 
        }, 500);
      } catch (e) {
        window.location.href = '/';
      }
    };

    syncProfileAndSession();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [user, firestore, auth]);

  // Pantalla de carga inicial del sistema
  if (isUserLoading || isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-50" />
          <p className="text-sm text-muted-foreground animate-pulse font-medium">Validando acceso...</p>
        </div>
      </div>
    );
  }

  // Pantalla de transición al ser expulsado por sesión única
  if (isKickingOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 text-center max-w-xs px-4">
          <div className="p-4 bg-amber-50 rounded-full">
            <Loader2 className="h-10 w-10 animate-spin text-amber-600" />
          </div>
          <div className="space-y-2">
            <p className="font-bold text-lg">Sesión iniciada en otro lugar</p>
            <p className="text-sm text-muted-foreground">
              Hemos detectado una nueva conexión con tu cuenta. Por seguridad, esta ventana se cerrará.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Si no hay sesión activa, mostramos la vista de login
  if (!user) {
    return <AuthView />;
  }

  // Si todo está correcto, renderizamos la aplicación
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
        <title>POOS MARICHE - Gestión de Taller</title>
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
