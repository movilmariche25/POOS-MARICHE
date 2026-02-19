
"use client";

import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useFirebase, useDoc, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";
import type { UserProfile } from "@/lib/types";

const FALLBACK_PIN = "2026";

type AdminAuthDialogProps = {
  children: ReactNode;
  onAuthorized: () => void;
};

export function AdminAuthDialog({ children, onAuthorized }: AdminAuthDialogProps) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const { toast } = useToast();
  const { firestore, user } = useFirebase();

  const profileRef = useMemoFirebase(() => 
    (firestore && user) ? doc(firestore, 'users', user.uid) : null,
    [firestore, user?.uid]
  );
  const { data: profile } = useDoc<UserProfile>(profileRef);

  // Si el usuario ha desactivado el requerimiento de PIN, omitimos el diálogo
  if (profile && profile.isPinRequired === false) {
      return (
          <div 
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAuthorized();
            }}
            className="contents"
          >
              {children}
          </div>
      );
  }

  const handleAuth = () => {
    const requiredPin = profile?.securityPin || FALLBACK_PIN;

    if (password === requiredPin) {
      toast({
        title: "Acceso Concedido",
        description: "Acción de administrador autorizada.",
      });
      setOpen(false);
      onAuthorized();
    } else {
      toast({
        variant: "destructive",
        title: "Acceso Denegado",
        description: "La contraseña de seguridad es incorrecta.",
      });
    }
    setPassword("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleAuth();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Autenticación de Seguridad</DialogTitle>
          <DialogDescription>
            Esta acción requiere privilegios de gerente. Por favor, introduce tu clave de seguridad (PIN) para continuar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="admin-password">Clave de Seguridad (PIN)</Label>
            <Input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="submit" onClick={handleAuth}>Autorizar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
