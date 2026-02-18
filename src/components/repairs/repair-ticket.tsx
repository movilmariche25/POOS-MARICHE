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
        <div className="text-black bg-white font-mono text-[12px] max-w-[215px] mx-auto leading-tight" style={{ color: '#000', fontWeight: 'bold' }}>
            <div className="text-center mb-3">
                <h3 className="font-black text-[16px] uppercase" style={{ margin: 0 }}>{businessName || 'MARICHE MOVIL'}</h3>
                <p className="text-[12px] font-black underline">NOTA DE ENTREGA (CLIENTE)</p>
            </div>
            
            <div className="flex justify-between text-[11px] font-black mb-2">
                <span>{fecha}</span>
                <span>ID: {repairJob.id}</span>
            </div>

            <div className="space-y-1">
                <p><span className="font-black">CLIENTE:</span> {repairJob.customerName.toUpperCase()}</p>
                <p><span className="font-black">CÉDULA:</span> {repairJob.customerID || 'N/A'}</p>
                <p><span className="font-black">TÉLF:</span> {repairJob.customerPhone}</p>
                {repairJob.customerAddress && <p><span className="font-black">DIR:</span> {repairJob.customerAddress.toUpperCase()}</p>}
                
                <div style={{ borderTop: '2px dashed #000', margin: '6px 0' }}></div>
                
                <p><span className="font-black">EQUIPO:</span> {repairJob.deviceMake.toUpperCase()} {repairJob.deviceModel.toUpperCase()}</p>
                {repairJob.deviceImei && <p><span className="font-black">IMEI:</span> {repairJob.deviceImei}</p>}
                <p><span className="font-black">FALLA:</span> {repairJob.reportedIssue.toUpperCase()}</p>
            </div>

            <div className="border-t-2 border-black mt-3 pt-2 space-y-1">
                <div className="flex justify-between text-[13px]">
                    <span>COSTO TOTAL:</span>
                    <span className="font-black">${total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[13px]">
                    <span>ABONO:</span>
                    <span className="font-black">${abono.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-black text-[16px] border-t-2 border-black pt-1 mt-1">
                    <span>PENDIENTE:</span>
                    <span>${saldo.toFixed(2)}</span>
                </div>
            </div>

            <div className="border-t border-black mt-4 pt-2 text-[10px] leading-tight space-y-1 italic font-bold">
                <p><span className="font-black">GARANTÍA:</span> 4 DÍAS POR EL SERVICIO REALIZADO.</p>
                <p><span className="font-black">RETIRO:</span> 7 DÍAS MÁXIMO UNA VEZ NOTIFICADO. EL TALLER NO SE HACE RESPONSABLE PASADO ESTE TIEMPO.</p>
                <p className="text-center font-black uppercase mt-2">INDISPENSABLE PRESENTAR TICKET</p>
            </div>
            <div className="text-center mt-4 font-black text-[12px]">
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

    const checklistItems = [
        ['Encendido', 'Cámaras'],
        ['Carga/PIN', 'Audio/Mic'],
        ['Touch/LCD', 'Botones'],
        ['Señal/WiFi', 'Biometría']
    ];

    return (
        <div className="text-black bg-white font-mono text-[11px] max-w-[215px] mx-auto leading-tight" style={{ color: '#000', fontWeight: 'bold' }}>
            <div className="text-center mb-3">
                <h3 className="font-black text-[14px] uppercase">CONTROL INTERNO</h3>
                <p className="text-[10px] font-black">ID: {repairJob.id} | {fecha} | {hora}</p>
            </div>

            <div className="border-t-2 border-black pt-2 mb-3">
                <p className="font-black text-[12px] mb-1">DATOS DEL SERVICIO:</p>
                <p><span className="font-black">CLIENTE:</span> {repairJob.customerName.toUpperCase()}</p>
                <p><span className="font-black">EQUIPO:</span> {repairJob.deviceMake.toUpperCase()} {repairJob.deviceModel.toUpperCase()}</p>
                <p><span className="font-black">FALLA:</span> {repairJob.reportedIssue.toUpperCase()}</p>
                <p className="text-[13px] font-black mt-1">COSTO: ${total.toFixed(2)} | SALDO: ${saldo.toFixed(2)}</p>
            </div>

            <div className="border-t-2 border-black pt-2 mb-3">
                <p className="font-black mb-1">CHECKLIST (E = Entrada | S = Salida):</p>
                <table className="w-full border-collapse text-[10px] font-black">
                    <thead>
                        <tr className="border-b-2 border-black">
                            <th className="text-left py-1">FUNCIÓN</th>
                            <th className="text-center py-1">E</th>
                            <th className="text-center py-1">S</th>
                        </tr>
                    </thead>
                    <tbody>
                        {checklistItems.flat().map((item, idx) => (
                            <tr key={idx} className="border-b border-black">
                                <td className="py-1 uppercase">{item}</td>
                                <td className="text-center font-black">[ ]</td>
                                <td className="text-center font-black">[ ]</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {repairJob.devicePatternOrPassword && (
                <div className="mb-3 p-2 bg-white border-2 border-black rounded text-center">
                    <p className="font-black text-[11px] uppercase">CLAVE / PATRÓN:</p>
                    <p className="text-[18px] font-black">{repairJob.devicePatternOrPassword}</p>
                </div>
            )}

            <div className="mb-4 space-y-2">
                <p className="font-black underline">OBSERVACIONES TÉCNICAS:</p>
                <div className="border-b border-black h-6"></div>
                <div className="border-b border-black h-6"></div>
            </div>

            <div className="border-t-2 border-black pt-4 mb-6">
                <div className="mt-6 border-b-2 border-black w-3/4 mx-auto"></div>
                <p className="text-center font-black text-[10px] mt-1">FIRMA RECEPCIÓN</p>
            </div>

            <div className="border-t-2 border-black pt-4">
                <div className="mt-6 border-b-2 border-black w-3/4 mx-auto"></div>
                <p className="text-center font-black text-[10px] mt-1">FIRMA ENTREGA</p>
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
        <div className="text-black bg-white font-mono text-[12px] max-w-[215px] mx-auto p-1 leading-tight" style={{ color: '#000' }}>
            <div className="border-4 border-black p-2 space-y-1 text-center">
                <p className="font-black text-[18px]">ID: {repairJob.id}</p>
                <p className="font-black text-[14px] uppercase">{repairJob.customerName}</p>
                <p className="font-black text-[14px] uppercase">{repairJob.deviceMake} {repairJob.deviceModel}</p>
                <p className="font-black text-[18px] pt-1 border-t-2 border-black">SALDO: ${saldo.toFixed(2)}</p>
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
    }
    .ticket-container { 
        width: 58mm; 
        margin: 0 auto; 
        box-sizing: border-box; 
    }
    .text-center { text-align: center; }
    .font-black { font-weight: 900 !important; }
    .font-bold { font-weight: 700 !important; }
    .flex { display: flex; }
    .justify-between { justify-content: space-between; }
    .border-t-2 { border-top: 2px solid #000; }
    .border-b-2 { border-bottom: 2px solid #000; }
    .border-black { border-color: #000 !important; }
    .w-full { width: 100%; }
    .mx-auto { margin-left: auto; margin-right: auto; }
    .uppercase { text-transform: uppercase; }
    .italic { font-style: italic; }
    .underline { text-decoration: underline; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: none; padding: 4px 2px; color: #000 !important; }
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
                <div style={{ margin: '20px 0', borderTop: '3px dashed #000' }}></div>
                <InternalTicket {...props} />
                <div style={{ margin: '20px 0', borderTop: '3px dashed #000' }}></div>
                <StickerTicket {...props} />
            </>
        );
        iframePrint(html);
    } catch (e: any) {
        onError(e.message);
    }
};