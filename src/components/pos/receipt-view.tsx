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
         <div className="receipt-content">
            <div className="text-center mb-4">
                <h3 className="business-name">{businessName || 'NOTA DE ENTREGA'}</h3>
                <p className="meta-info mt-2">{format(parseISO(sale.transactionDate), "dd/MM/yy hh:mm a", { locale: es })}</p>
                <p className="meta-info">ID: {sale.id}</p>
            </div>
            
            <div className="divider-dashed"></div>
            
            <div className="flex-header">
                <div className="flex-1 text-left">PRODUCTO</div>
                <div className="w-1/3 text-right">TOTAL</div>
            </div>
            
            <div className="divider-solid"></div>

            <div className="items-list">
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

            <div className="divider-dashed"></div>

            <div className="totals-section">
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
                 <div className="flex-row total-row">
                    <span>TOTAL:</span>
                    <span>${formatCurrency(sale.totalAmount, 'USD')}</span>
                </div>
            </div>
            
            <div className="divider-dashed"></div>

            <div className="payments-section">
                <p className="section-title underline">PAGOS RECIBIDOS</p>
                {sale.payments.map((p, index) => (
                    <div key={index} className="flex-row">
                        <span className="method-name">{p.method}{p.reference ? ` (${p.reference})` : ''}:</span>
                        <span className="method-amount">{getPaymentAmountInCorrectCurrency(p)}</span>
                    </div>
                ))}
            </div>

            {sale.changeGiven && sale.changeGiven.length > 0 && (
                 <div className="change-section">
                    <div className="divider-dashed"></div>
                    <p className="section-title underline">VUELTO ENTREGADO</p>
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

             <div className="divider-dashed"></div>
             <div className="footer-section">
                <p>¡GRACIAS POR SU COMPRA!</p>
                <p className="guarantee-note">INDISPENSABLE PARA GARANTÍA</p>
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
                        box-sizing: border-box;
                    }
                    body { 
                        margin: 0; 
                        padding: 10px; 
                        font-family: 'Courier New', Courier, monospace; 
                        font-weight: 600;
                        background-color: #fff; 
                        color: #000 !important;
                    }
                    .receipt-container { 
                        width: 58mm; 
                        margin: 0 auto; 
                    }
                    .text-center { text-align: center; }
                    .business-name { font-size: 18px; text-transform: uppercase; margin: 0; border-bottom: 2px solid #000; padding-bottom: 4px; }
                    .meta-info { font-size: 12px; margin: 2px 0; }
                    .divider-dashed { border-top: 1px dashed #000; margin: 8px 0; }
                    .divider-solid { border-top: 1px solid #000; margin: 4px 0; }
                    .flex-header { display: flex; font-size: 14px; }
                    .flex-1 { flex: 1; }
                    .w-1\\/3 { width: 33.33%; }
                    .text-right { text-align: right; }
                    .text-left { text-align: left; }
                    .item-row { margin-bottom: 8px; }
                    .item-name { font-size: 13px; text-transform: uppercase; line-height: 1.1; }
                    .item-details { display: flex; justify-content: space-between; font-size: 12px; }
                    .totals-section { font-size: 14px; text-align: right; }
                    .flex-row { display: flex; justify-content: space-between; }
                    .total-row { font-size: 18px; border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; }
                    .section-title { text-align: center; font-size: 13px; margin-bottom: 4px; }
                    .method-name { font-size: 11px; text-transform: uppercase; flex: 1; }
                    .method-amount { margin-left: 8px; font-size: 12px; }
                    .footer-section { text-align: center; margin-top: 10px; font-size: 12px; text-transform: uppercase; }
                    .guarantee-note { font-size: 10px; margin-top: 4px; }
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
