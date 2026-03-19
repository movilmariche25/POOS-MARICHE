
import type { RepairJob, UserProfile } from "@/lib/types";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { renderToString } from "react-dom/server";

type RepairTicketProps = {
    repairJob: RepairJob;
    businessName?: string;
    profile?: UserProfile | null;
    bcvRate?: number;
}

// SECCIÓN 1: NOTA DE ENTREGA (CLIENTE)
export function CustomerTicket({ repairJob, businessName, profile, bcvRate = 1 }: RepairTicketProps) {
    const total = repairJob.estimatedCost || 0;
    const abono = repairJob.amountPaid || 0;
    const saldo = Math.max(0, total - abono);
    const date = repairJob.createdAt ? parseISO(repairJob.createdAt) : new Date();
    const fecha = format(date, "dd/MM/yy hh:mm a", { locale: es });

    const totalBs = total * bcvRate;
    const saldoBs = saldo * bcvRate;

    // Fallbacks para políticas si no están configuradas
    const warranty = profile?.repairWarrantyPolicy || "4 DÍAS POR EL SERVICIO REALIZADO.";
    const pickup = profile?.repairPickupPolicy || "7 DÍAS MÁXIMO UNA VEZ NOTIFICADO. EL NEGOCIO NO SE HACE RESPONSABLE PASADO ESTE TIEMPO.";
    const disclaimer = profile?.repairDisclaimer || "NO NOS HACEMOS RESPONSABLES POR TELÉFONOS MOJADOS O QUE SUFRIERON CAÍDAS.";

    return (
        <div className="ticket-body">
            <div className="text-center mb-2">
                <h3 className="business-title bold-header">{businessName || 'POOS MARICHE'}</h3>
                <p className="ticket-type mt-1 bold-header">NOTA DE ENTREGA (CLIENTE)</p>
            </div>
            
            <div className="flex-row-between text-[7pt] mb-2">
                <span>{fecha}</span>
                <span>ID: {repairJob.id}</span>
            </div>

            <div className="details-section text-[8pt]">
                <p><span className="bold-header">CLIENTE:</span> {repairJob.customerName.toUpperCase()}</p>
                <p><span className="bold-header">CÉDULA:</span> {repairJob.customerID || 'N/A'}</p>
                <p><span className="bold-header">TÉLF:</span> {repairJob.customerPhone}</p>
                {repairJob.customerAddress && <p><span className="bold-header">DIR:</span> {repairJob.customerAddress.toUpperCase()}</p>}
                
                <div className="mt-2">
                    <p><span className="bold-header">EQUIPO:</span> {repairJob.deviceMake.toUpperCase()} {repairJob.deviceModel.toUpperCase()}</p>
                    <p><span className="bold-header">FALLA:</span> {repairJob.reportedIssue.toUpperCase()}</p>
                </div>
            </div>

            <div className="billing-section mt-3 text-[8pt]">
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
                
                {!repairJob.isPromo && (
                    <div className="mt-2 pt-1 border-t" style={{ borderTopStyle: 'dotted', borderTopWidth: '1px' }}>
                        <div className="flex-row-between text-[9pt] font-black">
                            <span>TOTAL EN BS:</span>
                            <span>Bs {totalBs.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex-row-between text-[9pt] font-black mt-0.5">
                            <span>SALDO EN BS:</span>
                            <span>Bs {saldoBs.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="disclaimer-section mt-3 italic text-[7pt]">
                <p><span className="bold-header">GARANTÍA:</span> {warranty.toUpperCase()}</p>
                <p><span className="bold-header">RETIRO:</span> {pickup.toUpperCase()}</p>
                <p className="mt-1"><span className="bold-header">AVISO:</span> {disclaimer.toUpperCase()}</p>
                <p className="text-center uppercase mt-2 bold-header">INDISPENSABLE PRESENTAR TICKET</p>
            </div>
            <div className="text-center mt-3 footer-thanks">
                <p className="bold-header text-[8pt]">¡GRACIAS POR SU CONFIANZA!</p>
                <p className="meta-info text-[6pt] mt-1 italic">TASA REF: {bcvRate.toFixed(2)} Bs/$</p>
            </div>
        </div>
    );
}

// SECCIÓN 2: CONTROL INTERNO (NEGOCIO)
export function InternalTicket({ repairJob, bcvRate = 1 }: RepairTicketProps) {
    const total = repairJob.estimatedCost || 0;
    const abono = repairJob.amountPaid || 0;
    const saldo = Math.max(0, total - abono);
    const date = repairJob.createdAt ? parseISO(repairJob.createdAt) : new Date();
    const fecha = format(date, "dd/MM/yy", { locale: es });
    const hora = format(date, "hh:mm a", { locale: es });

    const saldoBs = saldo * bcvRate;

    return (
        <div className="ticket-body internal">
            <div className="text-center mb-2">
                <h3 className="section-header bold-header text-[9pt]">CONTROL INTERNO</h3>
                <p className="meta-info mt-0.5 text-[7pt]">ID: {repairJob.id} | {fecha} | {hora}</p>
            </div>

            <div className="service-info mt-2 text-[8pt]">
                <p className="bold-header mb-1">DATOS DEL SERVICIO:</p>
                <p><span className="bold-header">CLIENTE:</span> {repairJob.customerName.toUpperCase()}</p>
                <p><span className="bold-header">EQUIPO:</span> {repairJob.deviceMake.toUpperCase()} {repairJob.deviceModel.toUpperCase()}</p>
                <p><span className="bold-header">FALLA:</span> {repairJob.reportedIssue.toUpperCase()}</p>
                
                <div className="mt-2 p-1 border" style={{ borderStyle: 'solid', borderWeight: '1px' }}>
                    <div className="flex-row-between bold-header">
                        <span>SALDO ($):</span>
                        <span>${saldo.toFixed(2)}</span>
                    </div>
                    {!repairJob.isPromo && (
                        <div className="flex-row-between text-[9pt] font-black mt-0.5">
                            <span>SALDO (BS):</span>
                            <span>Bs {saldoBs.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="signatures-container mt-8">
                <div className="signature-box" style={{ borderTop: '1px solid #000', paddingTop: '4px' }}>
                    <p className="bold-header text-[8pt]">FIRMA CLIENTE</p>
                    <p className="text-[6pt] mt-0.5">ACEPTO TÉRMINOS Y GARANTÍA</p>
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
                <p className="sticker-id bold-header text-[10pt]">ID: {repairJob.id}</p>
                <p className="sticker-text uppercase bold-header text-[8pt]">{repairJob.customerName}</p>
                <p className="sticker-text uppercase text-[8pt]">{repairJob.deviceMake} {repairJob.deviceModel}</p>
                
                <div className="sticker-issue-box mt-1">
                    <p className="sticker-issue-label bold-header text-[6pt]">FALLA:</p>
                    <p className="sticker-issue-text uppercase text-[7pt]">{repairJob.reportedIssue}</p>
                </div>

                <div className="sticker-balance-row mt-1">
                    <p className="sticker-balance bold-header text-[11pt]">SALDO: ${saldo.toFixed(2)}</p>
                </div>
            </div>
        </div>
    );
}

const printStyles = `
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
        font-size: 8pt;
        line-height: 1.1;
        background-color: #fff; 
        color: #000 !important;
        text-rendering: optimizeLegibility;
    }
    .ticket-container { 
        width: 52mm; 
        margin: 0 auto; 
        padding: 5px 1mm;
    }
    .text-center { text-align: center; }
    .flex-row-between { display: flex; justify-content: space-between; align-items: center; font-variant-numeric: tabular-nums; }
    .bold-header { 
        font-weight: 900; 
        font-size: 9pt; 
    }
    .business-title { text-transform: uppercase; }
    .ticket-type { text-transform: uppercase; }
    .details-section p, .service-info p { margin: 2px 0; line-height: 1.1; }
    .total-row { padding-top: 2px; }
    .disclaimer-section { font-size: 7pt; line-height: 1.1; }
    .footer-thanks { padding-top: 5px; }
    
    .section-header { margin: 0; }
    .meta-info { font-size: 7pt; }
    .balance-box { border: 1px solid #000 !important; padding: 4px; text-align: center; font-variant-numeric: tabular-nums; }
    
    .signature-box { text-align: center; margin-top: 20px; }
    .signature-box p { font-size: 7pt; margin: 0; }
    
    .sticker-border { border: 1.5px solid #000 !important; padding: 4px; text-align: center; }
    .sticker-id { font-size: 10pt; margin: 0; }
    .sticker-text { font-size: 8pt; margin: 1px 0; line-height: 1.1; }
    
    .sticker-issue-box { border: 1px solid #000 !important; margin: 2px 0; padding: 2px; text-align: left; }
    .sticker-issue-label { font-size: 6pt; margin-bottom: 1px; }
    .sticker-issue-text { font-size: 7pt; line-height: 1.1; }

    .sticker-balance-row { padding-top: 2px; }
    .sticker-balance { font-size: 11pt; margin: 0; font-variant-numeric: tabular-nums; }
    
    .cut-line { 
        border-top: 1px dashed #000 !important; 
        margin: 15px 0; 
        position: relative;
        height: 1px;
        width: 100%;
    }
    .mt-1 { margin-top: 0.25rem; }
    .mt-2 { margin-top: 0.5rem; }
    .mt-3 { margin-top: 0.75rem; }
    .mt-8 { margin-top: 2rem; }
    .mb-1 { margin-bottom: 0.25rem; }
    .mb-2 { margin-bottom: 0.5rem; }
    .font-black { font-weight: 900; }
`;

function iframePrint(html: string) {
    try {
        const iframe = document.createElement('iframe');
        iframe.style.visibility = 'hidden';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
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
    } catch (e) {
        console.error("Print Error:", e);
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
