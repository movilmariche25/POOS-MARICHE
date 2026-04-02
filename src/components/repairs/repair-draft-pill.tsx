
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Hammer, Trash2 } from "lucide-react";
import { RepairFormDialog } from "./repair-form-dialog";
import { useToast } from "@/hooks/use-toast";

const DRAFT_KEY = 'mm_repair_draft';

export function RepairDraftPill() {
    const [hasDraft, setHasDraft] = useState(false);
    const [open, setOpen] = useState(false);
    const { toast } = useToast();

    const checkDraft = () => {
        const draftStr = localStorage.getItem(DRAFT_KEY);
        if (!draftStr) {
            setHasDraft(false);
            return;
        }
        try {
            const draft = JSON.parse(draftStr);
            // El botón aparece si hay un borrador guardado con el flag isMinimized activo
            setHasDraft(!!draft.isMinimized && !open);
        } catch (e) {
            setHasDraft(false);
        }
    };

    useEffect(() => {
        checkDraft();
        const interval = setInterval(checkDraft, 1000);
        return () => clearInterval(interval);
    }, [open]);

    const handleDeleteDraft = (e: React.MouseEvent) => {
        e.stopPropagation();
        localStorage.removeItem(DRAFT_KEY);
        setHasDraft(false);
        toast({ title: "Borrador eliminado" });
    };

    if (!hasDraft && !open) return null;

    return (
        <>
            {hasDraft && (
                <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 animate-in slide-in-from-bottom-10 duration-500">
                    <Button 
                        className="h-12 px-6 rounded-full bg-blue-600 hover:bg-blue-700 shadow-2xl border-2 border-white/20 flex items-center gap-3 group transition-all hover:scale-105"
                        onClick={() => setOpen(true)}
                    >
                        <div className="p-1.5 bg-white/20 rounded-full animate-pulse">
                            <Hammer className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest">REGISTRO EN CURSO...</span>
                    </Button>
                    
                    <Button 
                        variant="destructive" 
                        size="icon" 
                        className="h-10 w-10 rounded-full shadow-xl"
                        onClick={handleDeleteDraft}
                        title="Eliminar borrador"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            )}

            {open && (
                <RepairFormDialog 
                    isOpen={open} 
                    onOpenChange={(val) => {
                        setOpen(val);
                        // Cuando el diálogo se cierra (por cualquier motivo),
                        // el intervalo de arriba volverá a evaluar si debe mostrar el botón azul
                    }}
                />
            )}
        </>
    );
}
