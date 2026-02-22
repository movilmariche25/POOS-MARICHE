
"use client";

import type { Sale, Payment, UserProfile } from "@/lib/types";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { renderToString } from 'react-dom/server';
import { useCurrency } from "@/hooks/use-currency";

type ReceiptViewProps = {
    sale: Sale;
    currency: {
        format: (value: number, targetCurrency?: any) => string;
        getSymbol: (targetCurrency?: any) => string;
        convert: (value: number, from: any, to: any) => number;
    };
    businessName?: string;
    profile?: UserProfile | null;
}

export function ReceiptView({ sale, currency, businessName, profile }: ReceiptViewProps) {
    const { format: formatCurrency, getSymbol } = currency;

    const getPaymentAmountInCorrectCurrency = (payment: Payment) => {
        const isUSD = payment.method === 'Efectivo USD';
        const symbol = isUSD ? getSymbol('USD') : getSymbol('Bs');
        return `${symbol}${formatCurrency(payment.amount, isUSD ? 'USD' : 'Bs')}`;
    };

    const showInfo = profile?.showInfoOnReceipt;

    return (
         <div className="receipt-content">
            <div className="text-center mb-4">
                <h3 className="business-name bold-header">{businessName || 'POOS MARICHE'}</h3>
                {showInfo && profile?.businessRIF && (
                    <p className="meta-info font-bold">RIF: {profile.businessRIF.toUpperCase()}</p>
                )}
                {showInfo && profile?.businessAddress && (
                    <p className="meta-info text-[8pt] italic leading-tight">{profile.businessAddress}</p>
                )}
                <p className="meta-info mt-2">{format(parseISO(sale.transactionDate), "dd/MM/yy hh:mm a", { locale: es })}</p>
                <p className="meta-info">ID: {sale.id}</p>
            </div>
            
            <div className="flex-header bold-header mt-4">
                <div className="flex-1 text-left">PRODUCTO</div>
                <div className="w-1/3 text-right">TOTAL</div>
            </div>
            
            <div className="items-list mt-2">
                {sale.items.map((item, idx) => (
                    <div key={idx} className="item-row">
                        <div className="item-name">{item.name}</div>
                        <div className="item-details">
                            <span>{item.quantity} x ${formatCurrency(item.price, 'USD')}</span>
                            <span>${formatCurrency(item.price * item.quantity, 'USD')}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="totals-section mt-4">
                 <div className="flex-row">
                    <span>SUB-TOTAL:</span>
                    <span>${formatCurrency(sale.subtotal, 'USD')}</span>
                </div>
                 {sale.discount > 0 && (
                    <div className="flex-row">
                        <span>DESCUENTO:</span>
                        <span>-${formatCurrency(sale.discount, 'USD')}</span>
                    </div>
                )}
                 <div className="flex-row total-row bold-header">
                    <span>TOTAL:</span>
                    <span>${formatCurrency(sale.totalAmount, 'USD')}</span>
                </div>
            </div>
            
            <div className="payments-section mt-4">
                <p className="section-title bold-header">PAGOS RECIBIDOS</p>
                {sale.payments.map((p, index) => (
                    <div key={index} className="flex-row">
                        <span className="method-name">{p.method}{p.reference ? ` (${p.reference})` : ''}:</span>
                        <span className="method-amount">{getPaymentAmountInCorrectCurrency(p)}</span>
                    </div>
                ))}
            </div>

            {sale.changeGiven && sale.changeGiven.length > 0 && (
                 <div className="change-section mt-4">
                    <p className="section-title bold-header">VUELTO ENTREGADO</p>
                    {sale.changeGiven.map((change, index) => {
                        const isUSD = change.method === 'Efectivo USD';
                        const symbol = isUSD ? getSymbol('USD') : getSymbol('Bs');
                        return (
                            <div key={index} className="flex-row">
                                <span className="method-name">{change.method}:</span>
                                <span>{symbol}{formatCurrency(change.amount, isUSD ? 'USD' : 'Bs')}</span>
                            </div>
                        );
                    })}
                </div>
            )}

             <div className="footer-section mt-6">
                <p className="bold-header">¡GRACIAS POR SU COMPRA!</p>
                <p className="guarantee-note">INDISPENSABLE PARA GARANTÍA</p>
             </div>
        </div>
    )
};

export const handlePrintReceipt = (props: ReceiptViewProps, onError: (message: string) => void) => {
    try {
        const receiptHtml = renderToString(<ReceiptView {...props} />);
        const fullHtml = `
            <html>
                <head>
                    <title>Recibo de Venta</title>
                    <style>
                        @media print {
                            @page { margin: 0; size: auto; }
                            body { margin: 0; padding: 0; }
                        }
                        * { 
                            -webkit-print-color-adjust: exact !important; 
                            print-color-adjust: exact !important;
                            box-sizing: border-box;
                            border: none;
                            margin: 0;
                            padding: 0;
                        }
                        body { 
                            font-family: Arial, Helvetica, sans-serif; 
                            font-size: 10pt;
                            line-height: 1.2;
                            background-color: #fff; 
                            color: #000 !important;
                            text-rendering: optimizeLegibility;
                        }
                        .receipt-container { 
                            width: 52mm; 
                            margin: 0 auto; 
                            padding: 10px 2mm;
                        }
                        .text-center { text-align: center; }
                        .bold-header { 
                            font-weight: 900; 
                            font-size: 11pt; 
                        }
                        .business-name { text-transform: uppercase; }
                        .meta-info { font-size: 9pt; margin: 2px 0; }
                        .flex-header { display: flex; text-transform: uppercase; }
                        .flex-1 { flex: 1; }
                        .w-1\\/3 { width: 33.33%; }
                        .text-right { text-align: right; }
                        .text-left { text-align: left; }
                        .item-row { margin-bottom: 6px; }
                        .item-name { font-size: 9pt; text-transform: uppercase; line-height: 1.1; }
                        .item-details { display: flex; justify-content: space-between; font-size: 9pt; font-variant-numeric: tabular-nums; }
                        .totals-section { text-align: right; }
                        .flex-row { display: flex; justify-content: space-between; margin-bottom: 2px; font-variant-numeric: tabular-nums; }
                        .total-row { margin-top: 4px; padding-top: 4px; }
                        .section-title { text-align: center; margin-bottom: 4px; text-transform: uppercase; }
                        .method-name { font-size: 9pt; text-transform: uppercase; flex: 1; }
                        .method-amount { margin-left: 8px; font-size: 9pt; }
                        .footer-section { text-align: center; margin-top: 10px; text-transform: uppercase; }
                        .guarantee-note { font-size: 8pt; margin-top: 4px; font-style: italic; }
                        .mt-2 { margin-top: 0.5rem; }
                        .mt-4 { margin-top: 1rem; }
                        .mt-6 { margin-top: 1.5rem; }
                        .mb-4 { margin-bottom: 1rem; }
                    </style>
                </head>
                <body>
                    <div class="receipt-container">${receiptHtml}</div>
                </body>
            </html>
        `;

        const iframe = document.createElement('iframe');
        iframe.style.visibility = 'hidden';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (doc) {
            doc.open();
            doc.write(fullHtml);
            doc.close();

            setTimeout(() => {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
                setTimeout(() => {
                    document.body.removeChild(iframe);
                }, 1000);
            }, 500);
        } else {
            onError("No se pudo inicializar el canal de impresión.");
        }
    } catch (e: any) {
        onError("Error al generar el recibo: " + e.message);
    }
};
