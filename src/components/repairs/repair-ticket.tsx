
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
                <h3 className="business-title">{businessName || 'POOS MARICHE'}</h3>
                <p className="ticket-type underline mt-2">NOTA DE ENTREGA (CLIENTE)</p>
            </div>
            
            <div className="flex-row-between text-xs mb-2">
                <span>{fecha}</span>
                <span>ID: {repairJob.id}</span>
            </div>

            <div className="details-section">
                <p><span>CLIENTE:</span> {repairJob.customerName.toUpperCase()}</p>
                <p><span>CÉDULA:</span> {repairJob.customerID || 'N/A'}</p>
                <p><span>TÉLF:</span> {repairJob.customerPhone}</p>
                {repairJob.customerAddress && <p><span>DIR:</span> {repairJob.customerAddress.toUpperCase()}</p>}
                
                <div className="divider-dashed"></div>
                
                <p><span>EQUIPO:</span> {repairJob.deviceMake.toUpperCase()} {repairJob.deviceModel.toUpperCase()}</p>
                <p><span>FALLA:</span> {repairJob.reportedIssue.toUpperCase()}</p>
            </div>

            <div className="billing-section mt-4 pt-2">
                <div className="flex-row-between text-md">
                    <span>COSTO TOTAL:</span>
                    <span>${total.toFixed(2)}</span>
                </div>
                <div className="flex-row-between text-md">
                    <span>ABONO:</span>
                    <span>${abono.toFixed(2)}</span>
                </div>
                <div className="flex-row-between total-row mt-1">
                    <span>PENDIENTE:</span>
                    <span>${saldo.toFixed(2)}</span>
                </div>
            </div>

            <div className="disclaimer-section mt-5 pt-2 italic">
                <p><span>GARANTÍA:</span> 4 DÍAS POR EL SERVICIO REALIZADO.</p>
                <p><span>RETIRO:</span> 7 DÍAS MÁXIMO UNA VEZ NOTIFICADO. EL TALLER NO SE HACE RESPONSABLE PASADO ESTE TIEMPO.</p>
                <p className="text-center uppercase mt-3 underline bold-important">INDISPENSABLE PRESENTAR TICKET</p>
            </div>
            <div className="text-center mt-5 footer-thanks pt-2">
                <p>¡GRACIAS POR SU CONFIANZA!</p>
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
                <h3 className="section-header">CONTROL INTERNO</h3>
                <p className="meta-info mt-1">ID: {repairJob.id} | {fecha} | {hora}</p>
            </div>

            <div className="service-info border-t-2 border-black pt-2 mb-3">
                <p className="underline-title mb-1">DATOS DEL SERVICIO:</p>
                <p><span>CLIENTE:</span> {repairJob.customerName.toUpperCase()}</p>
                <p><span>EQUIPO:</span> {repairJob.deviceMake.toUpperCase()} {repairJob.deviceModel.toUpperCase()}</p>
                <p><span>FALLA:</span> {repairJob.reportedIssue.toUpperCase()}</p>
                <div className="balance-box mt-2">SALDO: ${saldo.toFixed(2)}</div>
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
                    <p>FIRMA RECEPCIÓN</p>
                </div>

                <div className="signature-box mt-20">
                    <div className="signature-line"></div>
                    <p>FIRMA ENTREGA</p>
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
                <p className="sticker-id">ID: {repairJob.id}</p>
                <p className="sticker-text uppercase">{repairJob.customerName}</p>
                <p className="sticker-text uppercase">{repairJob.deviceMake} {repairJob.deviceModel}</p>
                <div className="sticker-balance-row pt-2 mt-2">
                    <p className="sticker-balance">SALDO: ${saldo.toFixed(2)}</p>
                </div>
            </div>
        </div>
    );
}

const printStyles = `
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
    .ticket-container { 
        width: 58mm; 
        margin: 0 auto; 
    }
    .text-center { text-align: center; }
    .flex-row-between { display: flex; justify-content: space-between; }
    .business-title { font-size: 20px; text-transform: uppercase; margin: 0; border-bottom: 2px solid #000; padding-bottom: 4px; }
    .ticket-type { font-size: 13px; font-weight: 600; }
    .details-section p, .service-info p { margin: 2px 0; font-size: 13px; line-height: 1.2; }
    .details-section span, .service-info span { font-weight: 600; }
    .divider-dashed { border-top: 1px dashed #000; margin: 8px 0; }
    .total-row { font-size: 20px; border-top: 2px solid #000; padding-top: 4px; font-weight: 600; }
    .disclaimer-section { font-size: 11px; line-height: 1.1; }
    .footer-thanks { font-size: 14px; border-top: 2px solid #000; font-weight: 600; }
    
    .section-header { font-size: 18px; border-bottom: 2px solid #000; margin: 0; }
    .meta-info { font-size: 12px; }
    .underline-title { font-size: 14px; text-decoration: underline; }
    .balance-box { border: 1px solid #000; padding: 4px; text-align: center; font-size: 16px; font-weight: 600; }
    .line-input { border-bottom: 1px solid #000; height: 30px; margin-bottom: 5px; }
    
    .signature-box { text-align: center; margin-top: 40px; }
    .signature-line { border-bottom: 1px solid #000; width: 80%; margin: 0 auto 4px; }
    .signature-box p { font-size: 12px; margin: 0; }
    
    .sticker-border { border: 2px solid #000; padding: 8px; text-align: center; }
    .sticker-id { font-size: 22px; margin: 0; }
    .sticker-text { font-size: 16px; margin: 2px 0; line-height: 1.1; }
    .sticker-balance-row { border-top: 1px solid #000; }
    .sticker-balance { font-size: 24px; margin: 0; font-weight: 600; }
    
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
        font-size: 11px;
        letter-spacing: 1px;
        font-weight: 600;
    }
    .bold-important { font-weight: 600 !important; }
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
