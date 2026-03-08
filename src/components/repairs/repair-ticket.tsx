
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
            <div className="text-center mb-3">
                <h3 className="business-title bold-header">{businessName || 'POOS MARICHE'}</h3>
                <p className="ticket-type mt-2 bold-header">NOTA DE ENTREGA (CLIENTE)</p>
            </div>
            
            <div className="flex-row-between text-xs mb-4">
                <span>{fecha}</span>
                <span>ID: {repairJob.id}</span>
            </div>

            <div className="details-section">
                <p><span className="bold-header">CLIENTE:</span> {repairJob.customerName.toUpperCase()}</p>
                <p><span className="bold-header">CÉDULA:</span> {repairJob.customerID || 'N/A'}</p>
                <p><span className="bold-header">TÉLF:</span> {repairJob.customerPhone}</p>
                {repairJob.customerAddress && <p><span className="bold-header">DIR:</span> {repairJob.customerAddress.toUpperCase()}</p>}
                
                <div className="mt-4">
                    <p><span className="bold-header">EQUIPO:</span> {repairJob.deviceMake.toUpperCase()} {repairJob.deviceModel.toUpperCase()}</p>
                    <p><span className="bold-header">FALLA:</span> {repairJob.reportedIssue.toUpperCase()}</p>
                </div>
            </div>

            <div className="billing-section mt-6">
                <div className="flex-row-between">
                    <span>COSTO TOTAL:</span>
                    <span>${total.toFixed(2)}</span>
                </div>
                <div className="flex-row-between">
                    <span>ABONO:</span>
                    <span>${abono.toFixed(2)}</span>
                </div>
                <div className="flex-row-between total-row mt-2 bold-header">
                    <span>PENDIENTE:</span>
                    <span>${saldo.toFixed(2)}</span>
                </div>
                
                {/* Mostramos el monto en BS si NO es una promoción */}
                {!repairJob.isPromo && (
                    <div className="mt-3 pt-2 border-t" style={{ borderTopStyle: 'dotted', borderTopWidth: '1px' }}>
                        <div className="flex-row-between text-[10pt] font-black">
                            <span>TOTAL EN BS:</span>
                            <span>Bs {totalBs.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex-row-between text-[10pt] font-black mt-1">
                            <span>SALDO EN BS:</span>
                            <span>Bs {saldoBs.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="disclaimer-section mt-6 italic">
                <p><span className="bold-header">GARANTÍA:</span> {warranty.toUpperCase()}</p>
                <p><span className="bold-header">RETIRO:</span> {pickup.toUpperCase()}</p>
                <p className="mt-2"><span className="bold-header">AVISO:</span> {disclaimer.toUpperCase()}</p>
                <p className="text-center uppercase mt-4 bold-header">INDISPENSABLE PRESENTAR TICKET</p>
            </div>
            <div className="text-center mt-6 footer-thanks">
                <p className="bold-header">¡GRACIAS POR SU CONFIANZA!</p>
                <p className="meta-info text-[7pt] mt-2 italic">TASA DE REF: {bcvRate.toFixed(2)} Bs/$</p>
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
            <div className="text-center mb-3">
                <h3 className="section-header bold-header">CONTROL INTERNO</h3>
                <p className="meta-info mt-1">ID: {repairJob.id} | {fecha} | {hora}</p>
            </div>

            <div className="service-info mt-4">
                <p className="bold-header mb-2">DATOS DEL SERVICIO:</p>
                <p><span className="bold-header">CLIENTE:</span> {repairJob.customerName.toUpperCase()}</p>
                <p><span className="bold-header">EQUIPO:</span> {repairJob.deviceMake.toUpperCase()} {repairJob.deviceModel.toUpperCase()}</p>
                <p><span className="bold-header">FALLA:</span> {repairJob.reportedIssue.toUpperCase()}</p>
                
                <div className="mt-4 p-2 border" style={{ borderStyle: 'solid', borderWidth: '1px' }}>
                    <div className="flex-row-between bold-header">
                        <span>SALDO ($):</span>
                        <span>${saldo.toFixed(2)}</span>
                    </div>
                    {!repairJob.isPromo && (
                        <div className="flex-row-between text-[10pt] font-black mt-1">
                            <span>SALDO (BS):</span>
                            <span>Bs {saldoBs.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="signatures-container mt-12">
                <div className="signature-box" style={{ borderTop: '1px solid #000', paddingTop: '8px' }}>
                    <p className="bold-header">FIRMA CLIENTE</p>
                    <p className="text-xs mt-1">ACEPTO TÉRMINOS Y GARANTÍA</p>
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
                
                <div className="sticker-issue-box mt-2">
                    <p className="sticker-issue-label bold-header">FALLA A REPARAR:</p>
                    <p className="sticker-issue-text uppercase">{repairJob.reportedIssue}</p>
                </div>

                <div className="sticker-balance-row mt-2">
                    <p className="sticker-balance bold-header">SALDO: ${saldo.toFixed(2)}</p>
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
        font-size: 10pt;
        line-height: 1.2;
        background-color: #fff; 
        color: #000 !important;
        text-rendering: optimizeLegibility;
    }
    .ticket-container { 
        width: 52mm; 
        margin: 0 auto; 
        padding: 10px 2mm;
    }
    .text-center { text-align: center; }
    .flex-row-between { display: flex; justify-content: space-between; align-items: center; font-variant-numeric: tabular-nums; }
    .bold-header { 
        font-weight: 900; 
        font-size: 11pt; 
    }
    .business-title { text-transform: uppercase; }
    .ticket-type { text-transform: uppercase; }
    .details-section p, .service-info p { margin: 4px 0; line-height: 1.2; }
    .total-row { padding-top: 4px; }
    .disclaimer-section { font-size: 8pt; line-height: 1.1; }
    .footer-thanks { padding-top: 10px; }
    
    .section-header { margin: 0; }
    .meta-info { font-size: 9pt; }
    .balance-box { border: 1px solid #000 !important; padding: 6px; text-align: center; font-variant-numeric: tabular-nums; }
    .line-spacer { height: 30px; }
    
    .signature-box { text-align: center; margin-top: 30px; }
    .signature-box p { font-size: 8pt; margin: 0; }
    
    .sticker-border { border: 2px solid #000 !important; padding: 6px; text-align: center; }
    .sticker-id { font-size: 12pt; margin: 0; }
    .sticker-text { font-size: 10pt; margin: 2px 0; line-height: 1.1; }
    
    .sticker-issue-box { border: 1px solid #000 !important; margin: 4px 0; padding: 4px; text-align: left; }
    .sticker-issue-label { font-size: 7pt; margin-bottom: 2px; }
    .sticker-issue-text { font-size: 9pt; line-height: 1.1; }

    .sticker-balance-row { padding-top: 4px; }
    .sticker-balance { font-size: 14pt; margin: 0; font-variant-numeric: tabular-nums; }
    
    .cut-line { 
        border-top: 2px dashed #000 !important; 
        margin: 30px 0; 
        position: relative;
        height: 1px;
        width: 100%;
    }
    .mt-1 { margin-top: 0.25rem; }
    .mt-2 { margin-top: 0.5rem; }
    .mt-4 { margin-top: 1rem; }
    .mt-6 { margin-top: 1.5rem; }
    .mt-12 { margin-top: 3rem; }
    .mb-2 { margin-bottom: 0.5rem; }
    .mb-3 { margin-bottom: 0.75rem; }
    .mb-4 { margin-bottom: 1rem; }
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
