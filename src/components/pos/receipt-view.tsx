"use client";

import type { Sale, Payment, UserProfile } from "@/lib/types";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { renderToString } from 'react-dom/server';
import { useCurrency } from "@/hooks/use-currency";

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
         <div className="text-black bg-white p-1 font-mono text-[13px] max-w-[215px] mx-auto leading-tight" style={{ color: '#000', fontWeight: 900 }}>
            <div className="text-center mb-4">
                <h3 className="font-black text-[18px] uppercase" style={{ margin: 0, borderBottom: '2px solid #000', paddingBottom: '4px' }}>{businessName || 'NOTA DE ENTREGA'}</h3>
                <p className="text-[12px] font-black mt-2">{format(parseISO(sale.transactionDate), "dd/MM/yy hh:mm a", { locale: es })}</p>
                <p className="text-[12px] font-black">ID: {sale.id}</p>
            </div>
            
            <div style={{ borderTop: '2px dashed #000', margin: '6px 0' }}></div>
            
            <div className="flex font-black text-[14px]">
                <div className="flex-1 text-left">PRODUCTO</div>
                <div className="w-1/3 text-right">TOTAL</div>
            </div>
            
            <div style={{ borderTop: '1px solid #000', margin: '4px 0' }}></div>

            <div className="space-y-3">
                {sale.items.map((item, idx) => (
                    <div key={idx} className="font-black">
                        <div className="break-words text-[13px] uppercase leading-none mb-1">{item.name}</div>
                        <div className="flex justify-between text-[12px]">
                            <span>{item.quantity} x ${formatCurrency(item.price, 'USD')}</span>
                            <span className="font-black">${formatCurrency(item.price * item.quantity, 'USD')}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ borderTop: '2px dashed #000', margin: '8px 0' }}></div>

            <div className="space-y-1 text-right font-black text-[14px]">
                 <div className="flex justify-between">
                    <span>SUB-TOTAL:</span>
                    <span>${formatCurrency(sale.subtotal, 'USD')}</span>
                </div>
                 {sale.discount > 0 && (
                    <div className="flex justify-between">
                        <span>DESCUENTO:</span>
                        <span>-${formatCurrency(sale.discount, 'USD')}</span>
                    </div>
                )}
                 <div className="flex justify-between font-black text-[18px] pt-2 mt-1" style={{ borderTop: '2px solid #000' }}>
                    <span>TOTAL:</span>
                    <span>${formatCurrency(sale.totalAmount, 'USD')}</span>
                </div>
            </div>
            
            <div style={{ borderTop: '2px dashed #000', margin: '10px 0' }}></div>

            <div className="space-y-1 text-[12px]">
                <p className="font-black mb-2 text-center text-[13px] underline">PAGOS RECIBIDOS</p>
                {sale.payments.map((p, index) => (
                    <div key={index} className="flex justify-between font-black">
                        <span className="uppercase text-[11px] flex-1">{p.method}{p.reference ? ` (${p.reference})` : ''}:</span>
                        <span className="font-black ml-2">{getPaymentAmountInCorrectCurrency(p)}</span>
                    </div>
                ))}
            </div>

            {sale.changeGiven && sale.changeGiven.length > 0 && (
                 <>
                <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }}></div>
                <div className="space-y-1 text-[12px]">
                    <p className="font-black mb-2 text-center text-[13px] underline">VUELTO ENTREGADO</p>
                    {sale.changeGiven.map((change, index) => {
                        const isUSD = change.method === 'Efectivo USD';
                        const symbol = isUSD ? getSymbol('USD') : getSymbol('Bs');
                        return (
                            <div key={index} className="flex justify-between font-black">
                                <span className="uppercase text-[11px]">{change.method}:</span>
                                <span className="font-black">{symbol}{formatCurrency(change.amount, isUSD ? 'USD' : 'Bs')}</span>
                            </div>
                        );
                    })}
                </div>
                </>
            )}

             <div style={{ borderTop: '2px dashed #000', margin: '12px 0' }}></div>
             <div className="text-center mt-2 font-black text-[12px] uppercase space-y-1">
                <p>¡GRACIAS POR SU COMPRA!</p>
                <p className="text-[10px]">INDISPENSABLE PARA GARANTÍA</p>
             </div>
        </div>
    )
};

export const handlePrintReceipt = (props: ReceiptViewProps, onError: (message: string) => void) => {
    const receiptHtml = renderToString(<ReceiptView {...props} />);
    const fullHtml = `
        <html>
            <head>
                <title>Recibo de Venta</title>
                <style>
                    @media print {
                        @page { margin: 0; size: auto; }
                        body { margin: 0; padding: 5px; }
                    }
                    * { 
                        -webkit-print-color-adjust: exact !important; 
                        print-color-adjust: exact !important;
                        -webkit-font-smoothing: none !important;
                        font-smooth: never !important;
                    }
                    body { 
                        margin: 0; 
                        padding: 10px; 
                        font-family: 'Courier New', Courier, monospace; 
                        background-color: #fff; 
                        color: #000 !important;
                    }
                    .receipt-container { 
                        width: 58mm; 
                        margin: 0 auto; 
                        box-sizing: border-box; 
                    }
                    .text-center { text-align: center; }
                    .font-black { font-weight: 900 !important; }
                    .font-bold { font-weight: 700 !important; }
                    .flex { display: flex; }
                    .justify-between { justify-content: space-between; }
                    .border-t-2 { border-top: 2px solid #000; }
                    .border-b-2 { border-bottom: 2px solid #000; }
                    .border-black { border-color: #000 !important; }
                    .w-full { width: 100%; }
                    .mx-auto { margin-left: auto; margin-right: auto; }
                    .uppercase { text-transform: uppercase; }
                    .italic { font-style: italic; }
                    .underline { text-decoration: underline; }
                    .space-y-1 > * + * { margin-top: 0.25rem; }
                    .space-y-3 > * + * { margin-top: 0.75rem; }
                    .mt-2 { margin-top: 0.5rem; }
                    .pt-2 { padding-top: 0.5rem; }
                    .flex-1 { flex: 1 1 0%; }
                    .w-1\\/3 { width: 33.333333%; }
                    .text-right { text-align: right; }
                    .text-left { text-align: left; }
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