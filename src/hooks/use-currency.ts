
"use client";

import { useDoc, useFirebase, useMemoFirebase } from "@/firebase";
import type { Currency, AppSettings, Product } from "@/lib/types";
import { doc } from "firebase/firestore";
import { useCallback } from "react";

export const useCurrency = () => {
    const { firestore, user } = useFirebase();
    
    const settingsRef = useMemoFirebase(() => 
        (firestore && user) ? doc(firestore, 'users', user.uid, 'app-settings', 'main') : null,
        [firestore, user?.uid]
    );
    const { data: settings, isLoading } = useDoc<AppSettings>(settingsRef);

    const currency = settings?.currency || 'USD';
    const bcvRate = settings?.bcvRate || 1;
    const parallelRate = settings?.parallelRate || 1;
    const profitMargin = settings?.profitMargin || 100;

    const format = useCallback((value: number, targetCurrency?: Currency) => {
        const formatter = new Intl.NumberFormat('de-DE', {
            style: 'decimal',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        return formatter.format(value);
    }, []);

    const getSymbol = useCallback((targetCurrency?: Currency) => {
        const c = targetCurrency || currency;
        return c === 'Bs' ? 'Bs ' : '$';
    }, [currency]);

    const convert = useCallback((value: number, from: Currency, to: Currency) => {
        if (from === to) return value;
        if (from === 'USD' && to === 'Bs') return value * bcvRate;
        if (from === 'Bs' && to === 'USD') return value / bcvRate;
        return value;
    }, [bcvRate]);

    const getDynamicPrice = useCallback((costPrice: number, overrideMargin?: number | string) => {
        if (costPrice <= 0) return 0;
        const numericMargin = (overrideMargin !== undefined && overrideMargin !== null && overrideMargin !== "") 
            ? Number(overrideMargin) 
            : profitMargin;
        const marginToUse = !isNaN(numericMargin) ? numericMargin : profitMargin;
        const costInBs = costPrice * parallelRate;
        const priceWithProfitInBs = costInBs * (1 + marginToUse / 100);
        const finalPriceInBcvUsd = priceWithProfitInBs / bcvRate;
        return parseFloat(finalPriceInBcvUsd.toFixed(2));
    }, [parallelRate, profitMargin, bcvRate]);

    const getFinalPrice = useCallback((product: Product) => {
        if (product.isFixedPrice && product.fixedPrice && product.fixedPrice > 0) {
            return product.fixedPrice;
        }
        if (product.hasCustomMargin && product.customMargin !== undefined) {
            return getDynamicPrice(product.costPrice, product.customMargin);
        }
        return getDynamicPrice(product.costPrice);
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
