
"use client";

import { useDoc, useFirebase, useMemoFirebase } from "@/firebase";
import type { Currency, AppSettings, Product } from "@/lib/types";
import { doc } from "firebase/firestore";
import { useCallback } from "react";

/**
 * useCurrency - El motor financiero del sistema.
 * Gestiona tasas, conversiones y cálculo dinámico de precios con protección de capital.
 */
export const useCurrency = () => {
    const { firestore, user } = useFirebase();
    
    // Escuchador en tiempo real a los ajustes de la aplicación
    const settingsRef = useMemoFirebase(() => 
        (firestore && user) ? doc(firestore, 'users', user.uid, 'app-settings', 'main') : null,
        [firestore, user?.uid]
    );
    const { data: settings, isLoading } = useDoc<AppSettings>(settingsRef);

    // Valores por defecto seguros mientras cargan los datos
    const currency = settings?.currency || 'USD';
    const bcvRate = settings?.bcvRate || 1;
    const parallelRate = settings?.parallelRate || 1;
    const profitMargin = settings?.profitMargin || 100;

    /**
     * Formatea un número según el estándar de moneda (punto para miles, coma para decimales)
     */
    const format = useCallback((value: number, targetCurrency?: Currency) => {
        const formatter = new Intl.NumberFormat('de-DE', {
            style: 'decimal',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        return formatter.format(value || 0);
    }, []);

    /**
     * Obtiene el símbolo de la moneda
     */
    const getSymbol = useCallback((targetCurrency?: Currency) => {
        const c = targetCurrency || currency;
        return c === 'Bs' ? 'Bs ' : '$';
    }, [currency]);

    /**
     * Convierte montos entre USD y Bs usando estrictamente la TASA BCV
     */
    const convert = useCallback((value: number, from: Currency, to: Currency) => {
        if (!value) return 0;
        if (from === to) return value;
        if (from === 'USD' && to === 'Bs') return value * bcvRate;
        if (from === 'Bs' && to === 'USD') return value / bcvRate;
        return value;
    }, [bcvRate]);

    /**
     * CÁLCULO MAESTRO DE PRECIO (Protección de Capital)
     * @param costPrice - Costo del producto en dólares reales
     * @param overrideMargin - Margen personalizado si aplica
     * @returns El precio sugerido en "Dólares BCV" para la factura
     */
    const getDynamicPrice = useCallback((costPrice: number, overrideMargin?: number | string) => {
        if (!costPrice || costPrice <= 0) return 0;
        
        const numericMargin = (overrideMargin !== undefined && overrideMargin !== null && overrideMargin !== "") 
            ? Number(overrideMargin) 
            : profitMargin;
        const marginToUse = !isNaN(numericMargin) ? numericMargin : profitMargin;
        
        // 1. Llevamos el costo a Bs usando la tasa de reposición (Parallel)
        const costInBs = costPrice * parallelRate;
        
        // 2. Aplicamos el margen de ganancia sobre el costo en Bs
        const priceWithProfitInBs = costInBs * (1 + marginToUse / 100);
        
        // 3. Convertimos a USD BCV (que es lo que el cliente paga)
        // Esto garantiza que el monto en Bs recibido sea exactamente lo que necesitamos 
        // para recomprar la pieza y mantener la ganancia.
        const finalPriceInBcvUsd = priceWithProfitInBs / bcvRate;
        
        return parseFloat(finalPriceInBcvUsd.toFixed(2));
    }, [parallelRate, bcvRate, profitMargin]);

    /**
     * Obtiene el precio final de venta de un producto considerando todas sus reglas
     */
    const getFinalPrice = useCallback((product: Product) => {
        if (!product) return 0;
        
        let basePrice = 0;
        
        if (product.isFixedPrice && product.fixedPrice && product.fixedPrice > 0) {
            // Precio bloqueado manualmente por el usuario
            basePrice = product.fixedPrice;
        } else if (product.hasCustomMargin && product.customMargin !== undefined) {
            // Precio dinámico con margen específico para este producto
            basePrice = getDynamicPrice(product.costPrice, product.customMargin);
        } else {
            // Precio dinámico con margen global del negocio
            basePrice = getDynamicPrice(product.costPrice);
        }

        // Si el producto tiene IVA (16%), lo sumamos al precio final calculado
        if (product.hasIVA) {
            basePrice = basePrice * 1.16;
        }
        
        return parseFloat(basePrice.toFixed(2));
    }, [getDynamicPrice]);

    return {
        format,
        getSymbol,
        convert,
        getDynamicPrice,
        getFinalPrice,
        currency,
        bcvRate, 
        parallelRate,
        profitMargin,
        isLoading,
        settings
    };
}
