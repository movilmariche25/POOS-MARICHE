
"use client";

import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { FirebaseClientProvider, useUser, useFirebase, setDocumentNonBlocking } from '@/firebase';
import { AuthView } from '@/components/auth-view';
import { useEffect } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import './globals.css';

function AppContent({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const { firestore, auth } = useFirebase();

  useEffect(() => {
    if (user && firestore && auth) {
      // 1. Obtener o generar ID de sesión local
      let localSessionId = localStorage.getItem('mm_session_id');
      if (!localSessionId) {
        localSessionId = Math.random().toString(36).substring(7) + Date.now();
        localStorage.setItem('mm_session_id', localSessionId);
      }

      const checkProfile = async () => {
        const profileRef = doc(firestore, 'users', user.uid);
        const profileSnap = await getDoc(profileRef);
        
        const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
        const adminRoleSnap = await getDoc(adminRoleRef);
        const isAdmin = adminRoleSnap.exists();

        if (!profileSnap.exists()) {
          const newProfile = {
            uid: user.uid,
            email: user.email,
            licenseStatus: isAdmin ? 'active' : 'trial',
            licenseExpiry: isAdmin 
              ? new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000).toISOString()
              : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
            isAdmin: isAdmin,
            lastSessionId: localSessionId // Registrar sesión actual
          };
          setDocumentNonBlocking(profileRef, newProfile, { merge: true });
        } else {
          const currentProfile = profileSnap.data();
          // Forzar actualización de sesión y sincronizar admin
          setDocumentNonBlocking(profileRef, { 
            isAdmin, 
            lastSessionId: localSessionId 
          }, { merge: true });
        }
      };
      
      checkProfile();

      // 2. Escuchador de sesión única (Eyectar si cambia el lastSessionId en Firestore)
      const profileRef = doc(firestore, 'users', user.uid);
      const unsubscribe = onSnapshot(profileRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.lastSessionId && data.lastSessionId !== localSessionId) {
            // Se detectó una sesión más reciente en otro lugar
            signOut(auth).then(() => {
              localStorage.removeItem('mm_session_id');
            });
          }
        }
      });

      return () => unsubscribe();
    }
  }, [user, firestore, auth]);

  if (isUserLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-muted rounded-full" />
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
