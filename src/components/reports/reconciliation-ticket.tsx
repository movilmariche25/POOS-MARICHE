
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
        <div className="recon-ticket">
            <div className="text-center mb-4">
                <h3 className="recon-header bold-header">CIERRE DE CAJA</h3>
                <p className="business-name bold-header">POOS MARICHE</p>
                <p className="meta-info mt-2">FECHA: {formatDate(parseISO(reconciliation.closedAt), "dd/MM/yy hh:mm a", { locale: es })}</p>
                <p className="meta-info">ID: {reconciliation.id}</p>
            </div>

            <div className="summary-section uppercase mt-6">
                <div className="flex-row">
                    <span>VENTAS TOTALES:</span>
                    <span className="bold-header">{getSymbol('USD')}{format(reconciliation.totalSales, 'USD')}</span>
                </div>
                 <div className="flex-row">
                    <span>TRANSACCIONES:</span>
                    <span>{reconciliation.totalTransactions}</span>
                </div>
            </div>
            
            <div className="cash-flow-section uppercase mt-4">
                 <div className="flex-row">
                    <span>PAGOS RECIBIDOS:</span>
                    <span style={{ color: 'green' }}>+{getSymbol('USD')}{format(reconciliation.totalPaymentsReceived ?? 0, 'USD')}</span>
                </div>
                <div className="flex-row">
                    <span>VUELTOS ENTREGADOS:</span>
                    <span style={{ color: 'red' }}>-{getSymbol('USD')}{format(reconciliation.totalChangeGiven ?? 0, 'USD')}</span>
                </div>
                <div className="flex-row net-expected mt-2 bold-header">
                    <span>NETO ESPERADO:</span>
                    <span>{getSymbol('USD')}{format(reconciliation.totalExpected, 'USD')}</span>
                </div>
            </div>

            <div className="methods-breakdown mt-6">
                <p className="section-title bold-header">DESGLOSE POR MÉTODO:</p>
                {paymentMethodsOrder.map(method => {
                    if (!reconciliation.paymentMethods || !reconciliation.paymentMethods[method]) return null;
                    const details = reconciliation.paymentMethods[method]!;
                    const symbol = getSymbol(method === 'Efectivo USD' ? 'USD' : 'Bs');
                    return (
                        <div key={method} className="method-box mt-4">
                            <p className="method-name-header bold-header">{method}</p>
                            <div className="flex-row"><span>ESPERADO:</span><span>{symbol}{format(details.expected)}</span></div>
                            <div className="flex-row"><span>CONTADO:</span><span>{symbol}{format(details.counted)}</span></div>
                            <div className="flex-row diff-row mt-1">
                                <span className="bold-header">DIFERENCIA:</span>
                                <span className="bold-header">{details.difference >= 0 ? '+' : ''}{symbol}{format(details.difference)}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

             <div className="flex-row grand-total mt-6 bold-header">
                <p>DIF. TOTAL ($):</p>
                 <p>
                    {reconciliation.totalDifference >= 0 ? '+' : ''}{getSymbol('USD')}{format(reconciliation.totalDifference, 'USD')}
                </p>
             </div>
             
             <div className="text-center mt-10 footer-note">
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
                    .recon-container { 
                        width: 52mm; 
                        margin: 0 auto; 
                        padding: 10px 2mm;
                    }
                    .text-center { text-align: center; }
                    .flex-row { display: flex; justify-content: space-between; margin-bottom: 2px; font-variant-numeric: tabular-nums; }
                    .bold-header { 
                        font-weight: 900; 
                        font-size: 11pt; 
                    }
                    .recon-header { text-transform: uppercase; }
                    .business-name { margin: 2px 0; }
                    .meta-info { font-size: 9pt; margin: 1px 0; }
                    .net-expected { padding-top: 4px; }
                    .section-title { text-align: center; margin-bottom: 6px; text-transform: uppercase; }
                    .method-box { margin-bottom: 12px; }
                    .method-name-header { text-align: center; border: 1px solid #000 !important; padding: 2px; margin-bottom: 4px; text-transform: uppercase; }
                    .diff-row { padding-top: 2px; }
                    .grand-total { text-transform: uppercase; border-top: 2px solid #000 !important; margin-top: 8px; padding-top: 8px; }
                    .footer-note { font-size: 8pt; text-transform: uppercase; opacity: 0.8; font-style: italic; }
                    .uppercase { text-transform: uppercase; }
                    .mt-2 { margin-top: 0.5rem; }
                    .mt-4 { margin-top: 1rem; }
                    .mt-6 { margin-top: 1.5rem; }
                    .mt-10 { margin-top: 2.5rem; }
                    .mb-4 { margin-bottom: 1rem; }
                </style>
            </head>
            <body>
                <div class="recon-container">${ticketHtml}</div>
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
