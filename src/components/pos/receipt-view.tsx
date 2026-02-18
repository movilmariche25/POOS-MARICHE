"use client";

import type { Sale, Payment, CartItem, UserProfile } from "@/lib/types";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Separator } from "../ui/separator";
import { renderToString } from 'react-dom/server';
import { useCurrency } from "@/hooks/use-currency";
import { useFirebase, useDoc, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";

type ReceiptViewProps = {
    sale: Sale;
    currency: Pick<ReturnType<typeof useCurrency>, 'format' | 'getSymbol' | 'convert'>;
    businessName?: string;
}

export function ReceiptView({ sale, currency, businessName }: ReceiptViewProps) {
    const { format: formatCurrency, getSymbol } = currency;

    const getPaymentAmountInCorrectCurrency = (payment: Payment) => {
        const isUSD = payment.method === 'Efectivo USD';
        const symbol = isUSD ? getSymbol('USD') : getSymbol('Bs');
        return `${symbol}${formatCurrency(payment.amount, isUSD ? 'USD' : 'Bs')}`;
    };

    return (
         <div className="text-black bg-white p-1 font-mono text-[12px] max-w-[215px] mx-auto leading-tight" style={{ color: '#000', fontWeight: 'bold' }}>
            <div className="text-center mb-3">
                <h3 className="font-black text-[16px] uppercase" style={{ margin: 0 }}>NOTA DE ENTREGA</h3>
                <p className="font-black text-[14px] uppercase">{businessName || 'Taller de Servicio'}</p>
                <p className="text-[11px] font-bold">{format(parseISO(sale.transactionDate), "dd/MM/yy hh:mm a", { locale: es })}</p>
                <p className="text-[11px] font-bold">ID: {sale.id}</p>
            </div>
            
            <div style={{ borderTop: '2px dashed #000', margin: '4px 0' }}></div>
            
            <div className="flex font-black text-[13px]">
                <div className="flex-1">DESCRIPCIÓN</div>
                <div className="w-1/4 text-right">TOTAL</div>
            </div>
            
            <div style={{ borderTop: '1px solid #000', margin: '2px 0' }}></div>

            <div className="space-y-2">
                {sale.items.map(item => (
                    <div key={item.productId} className="font-bold">
                        <div className="break-words text-[13px] uppercase">{item.name}</div>
                        <div className="flex justify-between text-[12px]">
                            <span>{item.quantity} x {getSymbol('USD')}{formatCurrency(item.price, 'USD')}</span>
                            <span className="font-black">${formatCurrency(item.price * item.quantity, 'USD')}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ borderTop: '2px dashed #000', margin: '6px 0' }}></div>

            <div className="space-y-1 text-right font-bold text-[13px]">
                 <div className="flex justify-between">
                    <p>Sub-total:</p>
                    <p>{getSymbol('USD')}{formatCurrency(sale.subtotal, 'USD')}</p>
                </div>
                 {sale.discount > 0 && (
                    <div className="flex justify-between">
                        <p>Descuento:</p>
                        <p>-{getSymbol('USD')}{formatCurrency(sale.discount, 'USD')}</p>
                    </div>
                )}
                 <div className="flex justify-between font-black text-[16px] pt-1" style={{ borderTop: '1px solid #000' }}>
                    <p>TOTAL:</p>
                    <p>{getSymbol('USD')}{formatCurrency(sale.totalAmount, 'USD')}</p>
                </div>
            </div>
            
            <div style={{ borderTop: '2px dashed #000', margin: '6px 0' }}></div>

            <div className="space-y-1 text-[12px]">
                <p className="font-black mb-1 text-center text-[13px]">PAGOS RECIBIDOS:</p>
                {sale.payments.map((p, index) => (
                    <div key={index} className="flex justify-between font-bold">
                        <span className="uppercase">{p.method}{p.reference ? ` (${p.reference})` : ''}:</span>
                        <span className="font-black">{getPaymentAmountInCorrectCurrency(p)}</span>
                    </div>
                ))}
            </div>

            {sale.changeGiven && sale.changeGiven.length > 0 && (
                 <>
                <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}></div>
                <div className="space-y-1 text-[12px]">
                    <p className="font-black mb-1 text-center text-[13px]">VUELTO:</p>
                    {sale.changeGiven.map((change, index) => {
                        const isUSD = change.method === 'Efectivo USD';
                        const symbol = isUSD ? getSymbol('USD') : getSymbol('Bs');
                        return (
                            <div key={index} className="flex justify-between font-bold">
                                <span className="uppercase">{change.method}:</span>
                                <span className="font-black">{symbol}{formatCurrency(change.amount, isUSD ? 'USD' : 'Bs')}</span>
                            </div>
                        );
                    })}
                </div>
                </>
            )}

             <div style={{ borderTop: '2px dashed #000', margin: '8px 0' }}></div>
             <div className="text-center mt-2 font-black text-[12px] uppercase">
                <p>¡Gracias por preferirnos!</p>
             </div>
        </div>
    )
};

export const handlePrintReceipt = (props: ReceiptViewProps, onError: (message: string) => void) => {
    const receiptHtml = renderToString(<ReceiptView {...props} />);
    const fullHtml = `
        <html>
            <head>
                <title>Recibo</title>
                <style>
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    body { 
                        margin: 0; 
                        padding: 0;
                        font-family: 'Courier New', Courier, monospace; 
                        background-color: #fff;
                        color: #000;
                        -webkit-font-smoothing: none;
                        font-smooth: never;
                    }
                    .receipt-container { 
                        width: 58mm; 
                        padding: 2mm; 
                        box-sizing: border-box; 
                    }
                    .text-black { color: #000 !important; } 
                    .bg-white { background-color: #fff !important; } 
                    .p-1 { padding: 0.25rem; }
                    .font-mono { font-family: monospace; }
                    .text-xs { font-size: 12px; }
                    .text-sm { font-size: 14px; }
                    .max-w-\\[215px\\] { max-width: 215px; } 
                    .mx-auto { margin-left: auto; margin-right: auto; }
                    .text-center { text-align: center; } 
                    .mb-3 { margin-bottom: 0.75rem; }
                    .font-black { font-weight: 900 !important; }
                    .font-bold { font-weight: 700 !important; }
                    .flex { display: flex; } 
                    .flex-1 { flex: 1 1 0%; }
                    .w-1\\/4 { width: 25%; } 
                    .text-right { text-align: right; }
                    .space-y-1 > * + * { margin-top: 0.25rem; }
                    .space-y-2 > * + * { margin-top: 0.5rem; }
                    .justify-between { justify-content: space-between; }
                    .uppercase { text-transform: uppercase; }
                    .pt-1 { padding-top: 0.25rem; }
                </style>
            </head>
            <body>
                <div class="receipt-container">${receiptHtml}</div>
            </body>
        </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
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
};