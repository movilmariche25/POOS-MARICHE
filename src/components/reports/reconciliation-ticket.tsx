'use client';

import type { DailyReconciliation, PaymentMethod } from "@/lib/types";
import { format as formatDate, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { renderToString } from "react-dom/server";
import { useCurrency } from "@/hooks/use-currency";

type ReconciliationTicketProps = {
    reconciliation: DailyReconciliation;
    currency: ReturnType<typeof useCurrency>;
}

const paymentMethodsOrder: PaymentMethod[] = ['Efectivo USD', 'Efectivo Bs', 'Tarjeta', 'Pago Móvil', 'Transferencia'];

export function ReconciliationTicket({ reconciliation, currency }: ReconciliationTicketProps) {
    const { format, getSymbol } = currency;
    
    return (
        <div className="text-black bg-white p-1 font-mono text-[12px] max-w-[215px] mx-auto leading-tight" style={{ color: '#000', fontWeight: 'bold' }}>
            <div className="text-center mb-3">
                <h3 className="font-black text-[16px] uppercase" style={{ margin: 0 }}>CIERRE DE CAJA</h3>
                <p className="font-black text-[14px]">MARICHE MOVIL</p>
                <p className="text-[11px] font-black">FECHA: {formatDate(parseISO(reconciliation.closedAt), "dd/MM/yy hh:mm a", { locale: es })}</p>
                <p className="font-black text-[12px]">ID: {reconciliation.id}</p>
            </div>

            <div style={{ borderTop: '2px dashed #000', margin: '6px 0' }}></div>

            <div className="space-y-1 font-black uppercase">
                <div className="flex justify-between">
                    <span>VENTAS TOTALES:</span>
                    <span>{getSymbol('USD')}{format(reconciliation.totalSales, 'USD')}</span>
                </div>
                 <div className="flex justify-between">
                    <span>TRANSACCIONES:</span>
                    <span>{reconciliation.totalTransactions}</span>
                </div>
            </div>
            
             <div style={{ borderTop: '2px dashed #000', margin: '6px 0' }}></div>

            <div className="space-y-1 font-bold uppercase text-[11px]">
                 <div className="flex justify-between">
                    <span>PAGOS RECIBIDOS:</span>
                    <span className="font-black">+{getSymbol('USD')}{format(reconciliation.totalPaymentsReceived ?? 0, 'USD')}</span>
                </div>
                <div className="flex justify-between">
                    <span>VUELTOS ENTREGADOS:</span>
                    <span className="font-black">-{getSymbol('USD')}{format(reconciliation.totalChangeGiven ?? 0, 'USD')}</span>
                </div>
                <div className="flex justify-between font-black text-[14px] border-t-2 border-black pt-1 mt-1">
                    <span>NETO ESPERADO:</span>
                    <span>{getSymbol('USD')}{format(reconciliation.totalExpected, 'USD')}</span>
                </div>
            </div>

            <div style={{ borderTop: '2px dashed #000', margin: '8px 0' }}></div>

            <div className="space-y-3">
                <p className="font-black text-center text-[13px] underline">DESGLOSE POR MÉTODO:</p>
                {paymentMethodsOrder.map(method => {
                    if (!reconciliation.paymentMethods || !reconciliation.paymentMethods[method]) return null;
                    const details = reconciliation.paymentMethods[method]!;
                    const symbol = getSymbol(method === 'Efectivo USD' ? 'USD' : 'Bs');
                    return (
                        <div key={method} className="space-y-0.5">
                            <p className="font-black text-[12px] uppercase text-center bg-black text-white" style={{ color: '#fff', backgroundColor: '#000', padding: '2px' }}>{method}</p>
                            <div className="flex justify-between font-bold"><span>ESPERADO:</span><span>{symbol}{format(details.expected)}</span></div>
                            <div className="flex justify-between font-bold"><span>CONTADO:</span><span>{symbol}{format(details.counted)}</span></div>
                            <div className="flex justify-between font-black border-t border-black">
                                <span>DIFERENCIA:</span><span>{details.difference >= 0 ? '+' : ''}{symbol}{format(details.difference)}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

             <div style={{ borderTop: '2px dashed #000', margin: '10px 0' }}></div>

             <div className="flex justify-between font-black text-[16px] uppercase pt-1">
                <p>DIF. TOTAL ($):</p>
                 <p>
                    {reconciliation.totalDifference >= 0 ? '+' : ''}{getSymbol('USD')}{format(reconciliation.totalDifference, 'USD')}
                </p>
             </div>
             
             <div className="text-center mt-6 font-black text-[10px] uppercase">
                <p>REPORTE GENERADO POR SISTEMA</p>
             </div>
        </div>
    );
}

export const handlePrintReconciliation = (props: ReconciliationTicketProps, onError: (message: string) => void) => {
    const ticketHtml = renderToString(<ReconciliationTicket {...props} />);
    const fullHtml = `
        <html>
            <head>
                <title>Reporte de Cierre de Caja</title>
                <style>
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    body { 
                        margin: 0; 
                        padding: 0;
                        font-family: 'Courier New', Courier, monospace; 
                        background-color: #fff;
                        color: #000 !important;
                        -webkit-font-smoothing: none;
                        font-smooth: never;
                    }
                    .ticket-container { 
                        width: 58mm; 
                        padding: 2mm; 
                        box-sizing: border-box; 
                    }
                    .text-black { color: #000 !important; } 
                    .bg-white { background-color: #fff !important; } 
                    .font-black { font-weight: 900 !important; }
                    .font-bold { font-weight: 700 !important; }
                    .flex { display: flex; }
                    .justify-between { justify-content: space-between; }
                    .text-center { text-align: center; }
                    .uppercase { text-transform: uppercase; }
                    .space-y-1 > * + * { margin-top: 0.25rem; }
                    .space-y-3 > * + * { margin-top: 0.75rem; }
                    .border-t-2 { border-top: 2px solid #000; }
                    .underline { text-decoration: underline; }
                </style>
            </head>
            <body>
                <div class="ticket-container">${ticketHtml}</div>
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
}