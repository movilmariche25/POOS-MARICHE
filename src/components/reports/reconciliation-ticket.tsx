
'use client';

import type { DailyReconciliation, PaymentMethod } from "@/lib/types";
import { format as formatDate, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { renderToString } from "react-dom/server";
import { useCurrency } from "@/hooks/use-currency";

type ReconciliationTicketProps = {
    reconciliation: DailyReconciliation;
    currency: ReturnType<typeof useCurrency>;
    businessName?: string;
}

const paymentMethodsOrder: PaymentMethod[] = ['Efectivo USD', 'Efectivo Bs', 'Tarjeta', 'Pago Móvil', 'Transferencia'];

export function ReconciliationTicket({ reconciliation, currency, businessName }: ReconciliationTicketProps) {
    const { format, getSymbol } = currency;
    
    // Determinamos el estado global del cuadre para el ticket (Sin emojis para evitar errores de impresión)
    let globalStatus = "CAJA CUADRADA";
    if (reconciliation.totalDifference > 0.01) globalStatus = "SOBRANTE DETECTADO";
    else if (reconciliation.totalDifference < -0.01) globalStatus = "FALTANTE DETECTADO";

    return (
        <div className="recon-ticket">
            <div className="text-center mb-4">
                <h3 className="recon-header bold-header">CIERRE DE CAJA</h3>
                <h2 className="business-name bold-header" style={{ fontSize: '12pt', marginTop: '4px' }}>{businessName || 'SISTEMA POS'}</h2>
                <p className="meta-info mt-2 font-bold">FECHA: {formatDate(parseISO(reconciliation.closedAt), "dd/MM/yy hh:mm a", { locale: es })}</p>
                <p className="meta-info">ID CIERRE: {reconciliation.id}</p>
            </div>

            <div className="status-banner mt-4 mb-4 border-y py-2 text-center" style={{ borderTopStyle: 'solid', borderBottomStyle: 'solid', borderWidth: '1px' }}>
                <p className="bold-header" style={{ fontSize: '10pt' }}>{globalStatus}</p>
            </div>

            {reconciliation.notes && (
                <div className="notes-section mb-4 border p-2" style={{ borderStyle: 'solid', borderWidth: '1px' }}>
                    <p className="bold-header text-[9pt] text-center mb-1">OBSERVACIONES:</p>
                    <p className="meta-info text-center italic uppercase">{reconciliation.notes}</p>
                </div>
            )}

            <div className="summary-section uppercase mt-6">
                <div className="flex-row">
                    <span>VENTAS TOTALES:</span>
                    <span className="bold-header">${format(reconciliation.totalSales, 'USD')}</span>
                </div>
                 <div className="flex-row">
                    <span>TRANSACCIONES:</span>
                    <span>{reconciliation.totalTransactions}</span>
                </div>
            </div>
            
            <div className="cash-flow-section uppercase mt-4">
                 <div className="flex-row">
                    <span>PAGOS RECIBIDOS:</span>
                    <span className="bold-header">+${format(reconciliation.totalPaymentsReceived ?? 0, 'USD')}</span>
                </div>
                <div className="flex-row">
                    <span>VUELTOS ENTREGADOS:</span>
                    <span className="bold-header">-${format(reconciliation.totalChangeGiven ?? 0, 'USD')}</span>
                </div>
                <div className="flex-row net-expected mt-2 bold-header border-t pt-1" style={{ borderTopStyle: 'dotted', borderTopWidth: '1px' }}>
                    <span>NETO ESPERADO ($):</span>
                    <span>${format(reconciliation.totalExpected, 'USD')}</span>
                </div>
            </div>

            <div className="methods-breakdown mt-6">
                <p className="section-title bold-header border-b pb-1 mb-2" style={{ borderBottomStyle: 'solid', borderBottomWidth: '1px' }}>DESGLOSE POR MÉTODO:</p>
                {paymentMethodsOrder.map(method => {
                    if (!reconciliation.paymentMethods || !reconciliation.paymentMethods[method]) return null;
                    const details = reconciliation.paymentMethods[method]!;
                    const isUSD = method === 'Efectivo USD';
                    const symbol = isUSD ? '$' : 'Bs';
                    
                    let methodStatus = "CUADRADO";
                    if (details.difference > 0.01) methodStatus = "SOBRANTE";
                    else if (details.difference < -0.01) methodStatus = "FALTANTE";

                    return (
                        <div key={method} className="method-box mt-4">
                            <p className="method-name-header bold-header">{method}</p>
                            <div className="flex-row"><span>ESPERADO:</span><span>{symbol}{format(details.expected)}</span></div>
                            <div className="flex-row"><span>CONTADO:</span><span>{symbol}{format(details.counted)}</span></div>
                            <div className="flex-row diff-row mt-1">
                                <span className="bold-header">DIFERENCIA:</span>
                                <span className="bold-header">{details.difference >= 0 ? '+' : ''}{symbol}{format(details.difference)}</span>
                            </div>
                            <p className="text-center text-[8pt] font-bold mt-1">[{methodStatus}]</p>
                        </div>
                    );
                })}
            </div>

             <div className="grand-total-container mt-8 pt-4" style={{ borderTop: '2px solid #000' }}>
                <div className="flex-row bold-header" style={{ fontSize: '12pt' }}>
                    <span>DIFERENCIA TOTAL:</span>
                    <span>{reconciliation.totalDifference >= 0 ? '+' : ''}${format(reconciliation.totalDifference, 'USD')}</span>
                </div>
             </div>
             
             <div className="text-center mt-10 footer-note">
                <p className="bold-header">REPORTE GENERADO POR SISTEMA</p>
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
                    .business-name { margin: 2px 0; text-transform: uppercase; }
                    .meta-info { font-size: 9pt; margin: 1px 0; }
                    .net-expected { padding-top: 4px; }
                    .section-title { text-align: center; margin-bottom: 6px; text-transform: uppercase; }
                    .method-box { margin-bottom: 12px; }
                    .method-name-header { text-align: center; border: 1px solid #000 !important; padding: 2px; margin-bottom: 4px; text-transform: uppercase; }
                    .diff-row { padding-top: 2px; }
                    .grand-total { text-transform: uppercase; border-top: 2px solid #000 !important; margin-top: 8px; padding-top: 8px; }
                    .footer-note { font-size: 8pt; text-transform: uppercase; font-weight: 900; }
                    .uppercase { text-transform: uppercase; }
                    .mt-2 { margin-top: 0.5rem; }
                    .mt-4 { margin-top: 1rem; }
                    .mt-6 { margin-top: 1.5rem; }
                    .mt-10 { margin-top: 2.5rem; }
                    .mb-4 { margin-bottom: 1rem; }
                    .border-t { border-top: 1px solid #000; }
                    .border-b { border-bottom: 1px solid #000; }
                    .border-y { border-top: 1px solid #000; border-bottom: 1px solid #000; }
                    .italic { font-style: italic; }
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
