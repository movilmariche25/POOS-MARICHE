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
            <div className="text-center mb-3">
                <h3 className="recon-header">CIERRE DE CAJA</h3>
                <p className="business-name">MARICHE MOVIL</p>
                <p className="meta-info">FECHA: {formatDate(parseISO(reconciliation.closedAt), "dd/MM/yy hh:mm a", { locale: es })}</p>
                <p className="meta-info">ID: {reconciliation.id}</p>
            </div>

            <div className="divider-dashed"></div>

            <div className="summary-section uppercase">
                <div className="flex-row">
                    <span>VENTAS TOTALES:</span>
                    <span>{getSymbol('USD')}{format(reconciliation.totalSales, 'USD')}</span>
                </div>
                 <div className="flex-row">
                    <span>TRANSACCIONES:</span>
                    <span>{reconciliation.totalTransactions}</span>
                </div>
            </div>
            
             <div className="divider-dashed"></div>

            <div className="cash-flow-section uppercase">
                 <div className="flex-row">
                    <span>PAGOS RECIBIDOS:</span>
                    <span>+{getSymbol('USD')}{format(reconciliation.totalPaymentsReceived ?? 0, 'USD')}</span>
                </div>
                <div className="flex-row">
                    <span>VUELTOS ENTREGADOS:</span>
                    <span>-{getSymbol('USD')}{format(reconciliation.totalChangeGiven ?? 0, 'USD')}</span>
                </div>
                <div className="flex-row net-expected mt-1">
                    <span>NETO ESPERADO:</span>
                    <span>{getSymbol('USD')}{format(reconciliation.totalExpected, 'USD')}</span>
                </div>
            </div>

            <div className="divider-dashed"></div>

            <div className="methods-breakdown">
                <p className="section-title underline">DESGLOSE POR MÉTODO:</p>
                {paymentMethodsOrder.map(method => {
                    if (!reconciliation.paymentMethods || !reconciliation.paymentMethods[method]) return null;
                    const details = reconciliation.paymentMethods[method]!;
                    const symbol = getSymbol(method === 'Efectivo USD' ? 'USD' : 'Bs');
                    return (
                        <div key={method} className="method-box">
                            <p className="method-name-header">{method}</p>
                            <div className="flex-row"><span>ESPERADO:</span><span>{symbol}{format(details.expected)}</span></div>
                            <div className="flex-row"><span>CONTADO:</span><span>{symbol}{format(details.counted)}</span></div>
                            <div className="flex-row diff-row">
                                <span>DIFERENCIA:</span><span>{details.difference >= 0 ? '+' : ''}{symbol}{format(details.difference)}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

             <div className="divider-dashed"></div>

             <div className="flex-row grand-total pt-1">
                <p>DIF. TOTAL ($):</p>
                 <p>
                    {reconciliation.totalDifference >= 0 ? '+' : ''}{getSymbol('USD')}{format(reconciliation.totalDifference, 'USD')}
                </p>
             </div>
             
             <div className="text-center mt-6 footer-note">
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
                    .recon-container { 
                        width: 58mm; 
                        margin: 0 auto; 
                    }
                    .text-center { text-align: center; }
                    .flex-row { display: flex; justify-content: space-between; }
                    .recon-header { font-size: 16px; text-transform: uppercase; margin: 0; }
                    .business-name { font-size: 14px; margin: 2px 0; }
                    .meta-info { font-size: 11px; margin: 1px 0; }
                    .divider-dashed { border-top: 1px dashed #000; margin: 8px 0; }
                    .summary-section { font-size: 12px; }
                    .cash-flow-section { font-size: 11px; }
                    .net-expected { font-size: 14px; border-top: 1px solid #000; padding-top: 2px; font-weight: 600; }
                    .section-title { text-align: center; font-size: 13px; margin-bottom: 6px; }
                    .method-box { margin-bottom: 8px; font-size: 11px; }
                    .method-name-header { text-align: center; border: 1px solid #000; padding: 2px; margin-bottom: 2px; font-weight: 600; }
                    .diff-row { border-top: 1px solid #000; margin-top: 1px; }
                    .grand-total { font-size: 16px; text-transform: uppercase; font-weight: 600; }
                    .footer-note { font-size: 10px; text-transform: uppercase; opacity: 0.8; }
                    .uppercase { text-transform: uppercase; }
                    .underline { text-decoration: underline; }
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
