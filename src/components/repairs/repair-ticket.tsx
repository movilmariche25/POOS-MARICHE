import type { RepairJob } from "@/lib/types";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { renderToString } from "react-dom/server";

type RepairTicketProps = {
    repairJob: RepairJob;
    businessName?: string;
}

// SECCIÓN 1: NOTA DE ENTREGA (CLIENTE)
export function CustomerTicket({ repairJob, businessName }: RepairTicketProps) {
    const total = repairJob.estimatedCost || 0;
    const abono = repairJob.amountPaid || 0;
    const saldo = Math.max(0, total - abono);
    const date = repairJob.createdAt ? parseISO(repairJob.createdAt) : new Date();
    const fecha = format(date, "dd/MM/yy hh:mm a", { locale: es });

    return (
        <div className="ticket-body">
            <div className="text-center mb-3">
                <h3 className="business-title bold-header">{businessName || 'POOS MARICHE'}</h3>
                <p className="ticket-type underline mt-2 bold-header">NOTA DE ENTREGA (CLIENTE)</p>
            </div>
            
            <div className="flex-row-between text-xs mb-2">
                <span>{fecha}</span>
                <span>ID: {repairJob.id}</span>
            </div>

            <div className="details-section">
                <p><span className="bold-header">CLIENTE:</span> {repairJob.customerName.toUpperCase()}</p>
                <p><span className="bold-header">CÉDULA:</span> {repairJob.customerID || 'N/A'}</p>
                <p><span className="bold-header">TÉLF:</span> {repairJob.customerPhone}</p>
                {repairJob.customerAddress && <p><span className="bold-header">DIR:</span> {repairJob.customerAddress.toUpperCase()}</p>}
                
                <div className="divider-dashed"></div>
                
                <p><span className="bold-header">EQUIPO:</span> {repairJob.deviceMake.toUpperCase()} {repairJob.deviceModel.toUpperCase()}</p>
                <p><span className="bold-header">FALLA:</span> {repairJob.reportedIssue.toUpperCase()}</p>
            </div>

            <div className="billing-section mt-4 pt-2">
                <div className="flex-row-between">
                    <span>COSTO TOTAL:</span>
                    <span>${total.toFixed(2)}</span>
                </div>
                <div className="flex-row-between">
                    <span>ABONO:</span>
                    <span>${abono.toFixed(2)}</span>
                </div>
                <div className="flex-row-between total-row mt-1 bold-header">
                    <span>PENDIENTE:</span>
                    <span>${saldo.toFixed(2)}</span>
                </div>
            </div>

            <div className="disclaimer-section mt-5 pt-2 italic">
                <p><span className="bold-header">GARANTÍA:</span> 4 DÍAS POR EL SERVICIO REALIZADO.</p>
                <p><span>RETIRO:</span> 7 DÍAS MÁXIMO UNA VEZ NOTIFICADO. EL TALLER NO SE HACE RESPONSABLE PASADO ESTE TIEMPO.</p>
                <p className="text-center uppercase mt-3 underline bold-header">INDISPENSABLE PRESENTAR TICKET</p>
            </div>
            <div className="text-center mt-5 footer-thanks pt-2">
                <p className="bold-header">¡GRACIAS POR SU CONFIANZA!</p>
            </div>
        </div>
    );
}

// SECCIÓN 2: CONTROL INTERNO (NEGOCIO)
export function InternalTicket({ repairJob }: RepairTicketProps) {
    const total = repairJob.estimatedCost || 0;
    const abono = repairJob.amountPaid || 0;
    const saldo = Math.max(0, total - abono);
    const date = repairJob.createdAt ? parseISO(repairJob.createdAt) : new Date();
    const fecha = format(date, "dd/MM/yy", { locale: es });
    const hora = format(date, "hh:mm a", { locale: es });

    return (
        <div className="ticket-body internal">
            <div className="text-center mb-3">
                <h3 className="section-header bold-header">CONTROL INTERNO</h3>
                <p className="meta-info mt-1">ID: {repairJob.id} | {fecha} | {hora}</p>
            </div>

            <div className="service-info border-t-2 border-black pt-2 mb-3">
                <p className="underline bold-header mb-1">DATOS DEL SERVICIO:</p>
                <p><span className="bold-header">CLIENTE:</span> {repairJob.customerName.toUpperCase()}</p>
                <p><span className="bold-header">EQUIPO:</span> {repairJob.deviceMake.toUpperCase()} {repairJob.deviceModel.toUpperCase()}</p>
                <p><span className="bold-header">FALLA:</span> {repairJob.reportedIssue.toUpperCase()}</p>
                <div className="balance-box mt-2 bold-header">SALDO: ${saldo.toFixed(2)}</div>
            </div>

            <div className="notes-section mb-10">
                <p className="underline">OBSERVACIONES TÉCNICAS:</p>
                <div className="line-input"></div>
                <div className="line-input"></div>
                <div className="line-input"></div>
            </div>

            <div className="signatures-container">
                <div className="signature-box">
                    <div className="signature-line"></div>
                    <p className="bold-header">FIRMA RECEPCIÓN</p>
                </div>

                <div className="signature-box mt-20">
                    <div className="signature-line"></div>
                    <p className="bold-header">FIRMA ENTREGA</p>
                </div>
            </div>
        </div>
    );
}

// SECCIÓN 3: ETIQUETA DE EQUIPO (PEGATINA)
export function StickerTicket({ repairJob }: RepairTicketProps) {
    const total = repairJob.estimatedCost || 0;
    const abono = repairJob.amountPaid || 0;
    const saldo = Math.max(0, total - abono);

    return (
        <div className="sticker-body">
            <div className="sticker-border">
                <p className="sticker-id bold-header">ID: {repairJob.id}</p>
                <p className="sticker-text uppercase bold-header">{repairJob.customerName}</p>
                <p className="sticker-text uppercase">{repairJob.deviceMake} {repairJob.deviceModel}</p>
                
                <div className="divider-dashed" style={{ margin: '4px 0' }}></div>
                
                <div className="sticker-issue-box">
                    <p className="sticker-issue-label underline bold-header">FALLA A REPARAR:</p>
                    <p className="sticker-issue-text uppercase">{repairJob.reportedIssue}</p>
                </div>

                <div className="sticker-balance-row pt-2 mt-2">
                    <p className="sticker-balance bold-header">SALDO: ${saldo.toFixed(2)}</p>
                </div>
            </div>
        </div>
    );
}

const printStyles = `
    @media print {
        @page { margin: 0; size: auto; }
        body { margin: 0; padding: 5px 0; }
    }
    * { 
        -webkit-print-color-adjust: exact !important; 
        print-color-adjust: exact !important;
        box-sizing: border-box;
    }
    body { 
        margin: 0; 
        padding: 10px 4mm; 
        font-family: sans-serif; 
        font-size: 12px;
        line-height: 1.2;
        background-color: #fff; 
        color: #000 !important;
    }
    .ticket-container { 
        width: 58mm; 
        margin: 0 auto; 
    }
    .text-center { text-align: center; }
    .flex-row-between { display: flex; justify-content: space-between; align-items: center; }
    .bold-header { font-weight: bold; font-size: 10pt; }
    .business-title { text-transform: uppercase; margin: 0; border-bottom: 2px solid #000; padding-bottom: 4px; }
    .ticket-type { text-transform: uppercase; }
    .details-section p, .service-info p { margin: 3px 0; line-height: 1.2; }
    .divider-dashed { border-top: 1px dashed #000; margin: 8px 0; }
    .total-row { border-top: 2px solid #000; padding-top: 4px; margin-top: 4px; }
    .disclaimer-section { font-size: 11px; line-height: 1.1; }
    .footer-thanks { border-top: 2px solid #000; }
    
    .section-header { border-bottom: 2px solid #000; margin: 0; }
    .meta-info { font-size: 11px; }
    .balance-box { border: 1px solid #000; padding: 6px; text-align: center; }
    .line-input { border-bottom: 1px solid #000; height: 25px; margin-bottom: 5px; }
    
    .signature-box { text-align: center; margin-top: 30px; }
    .signature-line { border-bottom: 1px solid #000; width: 80%; margin: 0 auto 4px; }
    .signature-box p { font-size: 11px; margin: 0; }
    
    .sticker-border { border: 2px solid #000; padding: 6px; text-align: center; }
    .sticker-id { font-size: 14pt; margin: 0; }
    .sticker-text { font-size: 11pt; margin: 2px 0; line-height: 1.1; }
    
    .sticker-issue-box { border: 1px solid #000; margin: 4px 0; padding: 4px; text-align: left; }
    .sticker-issue-label { font-size: 9px; margin-bottom: 2px; }
    .sticker-issue-text { font-size: 11px; line-height: 1.1; }

    .sticker-balance-row { border-top: 1px solid #000; }
    .sticker-balance { font-size: 16pt; margin: 0; }
    
    .cut-line { 
        border-top: 3px dashed #000; 
        margin: 40px 0; 
        position: relative;
        height: 1px;
        width: 100%;
    }
    .cut-line::after {
        content: "--- CORTAR AQUÍ ---";
        position: absolute;
        top: -12px;
        left: 50%;
        transform: translateX(-50%);
        background: #fff;
        padding: 0 10px;
        font-size: 10px;
        font-weight: bold;
    }
`;

function iframePrint(html: string) {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
        doc.open();
        doc.write(`<html><head><style>${printStyles}</style></head><body><div class="ticket-container">${html}</div></body></html>`);
        doc.close();

        setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            setTimeout(() => {
                document.body.removeChild(iframe);
            }, 1000);
        }, 500);
    }
}

export const handlePrintCustomerTicket = (props: RepairTicketProps, onError: (message: string) => void) => {
    try {
        const html = renderToString(<CustomerTicket {...props} />);
        iframePrint(html);
    } catch (e: any) {
        onError(e.message);
    }
};

export const handlePrintInternalTicket = (props: RepairTicketProps, onError: (message: string) => void) => {
    try {
        const html = renderToString(<InternalTicket {...props} />);
        iframePrint(html);
    } catch (e: any) {
        onError(e.message);
    }
};

export const handlePrintStickerTicket = (props: RepairTicketProps, onError: (message: string) => void) => {
    try {
        const html = renderToString(<StickerTicket {...props} />);
        iframePrint(html);
    } catch (e: any) {
        onError(e.message);
    }
};

export const handlePrintAllTickets = (props: RepairTicketProps, onError: (message: string) => void) => {
    try {
        const html = renderToString(
            <>
                <CustomerTicket {...props} />
                <div className="cut-line"></div>
                <InternalTicket {...props} />
                <div className="cut-line"></div>
                <StickerTicket {...props} />
            </>
        );
        iframePrint(html);
    } catch (e: any) {
        onError(e.message);
    }
};