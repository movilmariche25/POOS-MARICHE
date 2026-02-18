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
        <div className="text-black bg-white font-mono text-[14px] max-w-[215px] mx-auto leading-tight" style={{ color: '#000' }}>
            <div className="text-center mb-3">
                <h3 className="text-[20px] uppercase" style={{ margin: 0, borderBottom: '2px solid #000', paddingBottom: '4px' }}>{businessName || 'MARICHE MOVIL'}</h3>
                <p className="text-[13px] underline mt-2">NOTA DE ENTREGA (CLIENTE)</p>
            </div>
            
            <div className="flex justify-between text-[12px] mb-2">
                <span>{fecha}</span>
                <span>ID: {repairJob.id}</span>
            </div>

            <div className="space-y-1">
                <p><span>CLIENTE:</span> {repairJob.customerName.toUpperCase()}</p>
                <p><span>CÉDULA:</span> {repairJob.customerID || 'N/A'}</p>
                <p><span>TÉLF:</span> {repairJob.customerPhone}</p>
                {repairJob.customerAddress && <p><span>DIR:</span> {repairJob.customerAddress.toUpperCase()}</p>}
                
                <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>
                
                <p><span>EQUIPO:</span> {repairJob.deviceMake.toUpperCase()} {repairJob.deviceModel.toUpperCase()}</p>
                <p><span>FALLA:</span> {repairJob.reportedIssue.toUpperCase()}</p>
            </div>

            <div className="border-t-2 border-black mt-4 pt-2 space-y-1">
                <div className="flex justify-between text-[15px]">
                    <span>COSTO TOTAL:</span>
                    <span>${total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[15px]">
                    <span>ABONO:</span>
                    <span>${abono.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[20px] border-t-2 border-black pt-1 mt-1" style={{ borderTop: '2px solid #000' }}>
                    <span>PENDIENTE:</span>
                    <span>${saldo.toFixed(2)}</span>
                </div>
            </div>

            <div className="border-t border-black mt-5 pt-2 text-[11px] leading-tight space-y-1 italic">
                <p><span>GARANTÍA:</span> 4 DÍAS POR EL SERVICIO REALIZADO.</p>
                <p><span>RETIRO:</span> 7 DÍAS MÁXIMO UNA VEZ NOTIFICADO. EL TALLER NO SE HACE RESPONSABLE PASADO ESTE TIEMPO.</p>
                <p className="text-center uppercase mt-3 underline" style={{ fontSize: '12px' }}>INDISPENSABLE PRESENTAR TICKET</p>
            </div>
            <div className="text-center mt-5 text-[14px] border-t-2 border-black pt-2">
                <p>¡GRACIAS POR SU CONFIANZA!</p>
            </div>
        </div>
    );
}

// SECCIÓN 2: CONTROL INTERNO (NEGOCIO)
export function InternalTicket({ repairJob, businessName }: RepairTicketProps) {
    const total = repairJob.estimatedCost || 0;
    const abono = repairJob.amountPaid || 0;
    const saldo = Math.max(0, total - abono);
    const date = repairJob.createdAt ? parseISO(repairJob.createdAt) : new Date();
    const fecha = format(date, "dd/MM/yy", { locale: es });
    const hora = format(date, "hh:mm a", { locale: es });

    return (
        <div className="text-black bg-white font-mono text-[13px] max-w-[215px] mx-auto leading-tight" style={{ color: '#000' }}>
            <div className="text-center mb-3">
                <h3 className="text-[18px] uppercase" style={{ borderBottom: '2px solid #000' }}>CONTROL INTERNO</h3>
                <p className="text-[12px] mt-1">ID: {repairJob.id} | {fecha} | {hora}</p>
            </div>

            <div className="border-t-2 border-black pt-2 mb-3">
                <p className="text-[14px] mb-1 underline">DATOS DEL SERVICIO:</p>
                <p><span>CLIENTE:</span> {repairJob.customerName.toUpperCase()}</p>
                <p><span>EQUIPO:</span> {repairJob.deviceMake.toUpperCase()} {repairJob.deviceModel.toUpperCase()}</p>
                <p><span>FALLA:</span> {repairJob.reportedIssue.toUpperCase()}</p>
                <p className="text-[16px] mt-2 border border-black p-1 text-center">SALDO: ${saldo.toFixed(2)}</p>
            </div>

            <div className="mb-4 space-y-3">
                <p className="underline">OBSERVACIONES TÉCNICAS:</p>
                <div className="border-b border-black h-8"></div>
                <div className="border-b border-black h-8"></div>
            </div>

            <div className="border-t border-black pt-16 mb-20">
                <div className="mt-14 border-b border-black w-3/4 mx-auto"></div>
                <p className="text-center text-[12px] mt-2">FIRMA RECEPCIÓN</p>
            </div>

            <div className="border-t border-black pt-16">
                <div className="mt-14 border-b border-black w-3/4 mx-auto"></div>
                <p className="text-center text-[12px] mt-2">FIRMA ENTREGA</p>
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
        <div className="text-black bg-white font-mono text-[14px] max-w-[215px] mx-auto p-1 leading-tight" style={{ color: '#000' }}>
            <div className="border-[2px] border-black p-3 space-y-2 text-center">
                <p className="text-[22px]">ID: {repairJob.id}</p>
                <p className="text-[16px] uppercase">{repairJob.customerName}</p>
                <p className="text-[16px] uppercase">{repairJob.deviceMake} {repairJob.deviceModel}</p>
                <div className="pt-2 border-t border-black mt-2">
                    <p className="text-[24px]">SALDO: ${saldo.toFixed(2)}</p>
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
        -webkit-font-smoothing: none !important;
        font-smooth: never !important;
    }
    body { 
        margin: 0; 
        padding: 10px; 
        font-family: 'Courier New', Courier, monospace; 
        background-color: #fff; 
        color: #000 !important;
        font-weight: 600 !important;
    }
    .ticket-container { 
        width: 58mm; 
        margin: 0 auto; 
        box-sizing: border-box; 
    }
    .text-center { text-align: center; }
    .flex { display: flex; }
    .justify-between { justify-content: space-between; }
    .border-t-2 { border-top: 1px solid #000; }
    .border-b-2 { border-bottom: 1px solid #000; }
    .border-black { border-color: #000 !important; }
    .w-full { width: 100%; }
    .mx-auto { margin-left: auto; margin-right: auto; }
    .uppercase { text-transform: uppercase; }
    .italic { font-style: italic; }
    .underline { text-decoration: underline; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: none; padding: 4px 2px; color: #000 !important; }
    .cut-line { 
        border-top: 2px dashed #000; 
        margin: 50px 0; 
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
