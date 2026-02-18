
"use client";

import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { FirebaseClientProvider, useUser, useFirebase, setDocumentNonBlocking } from '@/firebase';
import { AuthView } from '@/components/auth-view';
import { useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import './globals.css';

function AppContent({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const { firestore } = useFirebase();

  useEffect(() => {
    if (user && firestore) {
      const checkProfile = async () => {
        const profileRef = doc(firestore, 'users', user.uid);
        const profileSnap = await getDoc(profileRef);
        
        // Verificar si es administrador en la colección protegida
        const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
        const adminRoleSnap = await getDoc(adminRoleRef);
        const isAdmin = adminRoleSnap.exists();

        if (!profileSnap.exists()) {
          // Crear perfil inicial si no existe
          const newProfile = {
            uid: user.uid,
            email: user.email,
            licenseStatus: isAdmin ? 'active' : 'trial',
            licenseExpiry: isAdmin 
              ? new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000).toISOString() // 10 años para admin
              : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 días de prueba
            createdAt: new Date().toISOString(),
            isAdmin: isAdmin
          };
          setDocumentNonBlocking(profileRef, newProfile, { merge: true });
        } else {
          // Si el perfil existe, asegurar que el estado isAdmin esté sincronizado
          const currentProfile = profileSnap.data();
          if (currentProfile.isAdmin !== isAdmin) {
            setDocumentNonBlocking(profileRef, { isAdmin }, { merge: true });
          }
        }
      };
      checkProfile();
    }
  }, [user, firestore]);

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
