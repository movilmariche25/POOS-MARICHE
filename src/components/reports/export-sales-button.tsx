
"use client";

import { useState } from "react";
import { format, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, FileDown } from "lucide-react";
import type { Product, Sale, RepairJob, Fiado } from "@/lib/types";
import { es } from "date-fns/locale";
import * as XLSX from "xlsx";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/use-currency";

type ExportSalesButtonProps = {
  sales: Sale[];
  products: Product[];
  repairJobs: RepairJob[];
  fiados: Fiado[];
};

export function ExportSalesButton({ sales, products, repairJobs, fiados }: ExportSalesButtonProps) {
  const [date, setDate] = useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(),
  });
  const { toast } = useToast();
  const { bcvRate: currentBcvRate } = useCurrency();

  const handleExport = () => {
    if (!date?.from || !sales || !repairJobs || !products) {
      toast({
        variant: "destructive",
        title: "Error de Datos",
        description: "Asegúrate de seleccionar fechas y que los datos hayan cargado.",
      });
      return;
    }
    
    const from = startOfDay(date.from);
    const to = date.to ? endOfDay(date.to) : endOfDay(date.from);

    const filteredSales = sales.filter((sale) => {
      if (!sale.transactionDate || sale.status !== 'completed') return false;
      const saleDate = new Date(sale.transactionDate);
      return isWithinInterval(saleDate, { start: from, end: to });
    });

    if (filteredSales.length === 0) {
        toast({
            title: "No hay datos",
            description: "No se encontraron ventas completadas en el rango seleccionado."
        });
        return;
    }
    
    // Map para consolidar actividad de reparaciones en el periodo
    const repairsActivity = new Map<string, {
        revenue: number,
        repairJob: RepairJob,
        lastDate: string,
        lastSaleId: string,
        paymentMethods: Set<string>,
        bcvRate: number
    }>();

    const productLines: any[] = [];

    filteredSales.forEach(sale => {
        const totalCollected = sale.actualPaidAmount ?? sale.totalAmount;
        const saleBcvRate = sale.bcvRateAtTime || currentBcvRate;
        
        // Calculamos el ratio de cobro (qué % del total solicitado se cobró realmente en esta transacción)
        const itemsTotalBillable = sale.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const collectionRatio = itemsTotalBillable > 0 ? totalCollected / itemsTotalBillable : 1;

        // Procesar productos que NO son reparaciones (incluye servicios manuales y fiados)
        const productItemsInSale = sale.items.filter(i => !i.isRepair);
        
        productItemsInSale.forEach(item => {
            const revenue = (item.price * item.quantity) * collectionRatio;
            let cost = 0;

            if (sale.fiadoId) {
                // Es un abono a un fiado: el costo es proporcional al abono basado en el costo inicial registrado
                const fiado = fiados.find(f => f.id === sale.fiadoId);
                if (fiado) {
                    const costRatio = fiado.totalAmount > 0 ? (fiado.totalCost || 0) / fiado.totalAmount : 0;
                    cost = revenue * costRatio;
                }
            } else if (item.isCustom) {
                // Venta rápida manual
                cost = (item.customCostPrice || 0) * item.quantity * collectionRatio;
            } else {
                // Producto estándar del inventario
                const product = products.find(p => p.id === item.productId);
                cost = (product?.costPrice || 0) * item.quantity * collectionRatio;
            }
            
            const profit = revenue - cost;
            
            productLines.push({
                'Fecha': format(new Date(sale.transactionDate), 'dd/MM/yyyy HH:mm'),
                'Producto/Servicio': item.name,
                'ID Transacción': sale.id,
                'Costo Inversión ($)': Number(cost.toFixed(2)),
                'Precio Venta ($)': Number(item.price.toFixed(2)),
                'Cantidad': item.quantity,
                'Ingreso Recibido ($)': Number(revenue.toFixed(2)),
                'Ganancia Est. ($)': Number(profit.toFixed(2)),
                'Total (Bs)': Number((revenue * saleBcvRate).toFixed(2)),
                'Tasa BCV Aplicada': Number(saleBcvRate.toFixed(2)),
                'Método de Pago': sale.paymentMethod
            });
        });

        // Agrupar actividad de reparaciones
        const repairItem = sale.items.find(i => i.isRepair);
        const rId = sale.repairJobId || repairItem?.productId;
        
        if (rId) {
            const repairRevenueInThisSale = (repairItem ? (repairItem.price * repairItem.quantity) : 0) * collectionRatio;
            
            if (repairRevenueInThisSale > 0) {
                const repairJob = repairJobs.find(job => job.id === rId);
                if (repairJob) {
                    const existing = repairsActivity.get(rId);
                    if (existing) {
                        existing.revenue += repairRevenueInThisSale;
                        existing.paymentMethods.add(sale.paymentMethod);
                        if (new Date(sale.transactionDate) > new Date(existing.lastDate)) {
                            existing.lastDate = sale.transactionDate;
                            existing.lastSaleId = sale.id!;
                            existing.bcvRate = saleBcvRate;
                        }
                    } else {
                        repairsActivity.set(rId, {
                            revenue: repairRevenueInThisSale,
                            repairJob,
                            lastDate: sale.transactionDate,
                            lastSaleId: sale.id!,
                            paymentMethods: new Set([sale.paymentMethod]),
                            bcvRate: saleBcvRate
                        });
                    }
                }
            }
        }
    });

    // Consolidar líneas de reparación con sus costos prorrateados
    const consolidatedRepairLines = Array.from(repairsActivity.values()).map(entry => {
        const repair = entry.repairJob;
        // Sumamos piezas reservadas y consumidas para tener el costo total del trabajo
        const totalPartsCost = [...(repair.reservedParts || []), ...(repair.consumedParts || [])]
            .reduce((sum, p) => sum + (p.costPrice * p.quantity), 0);
        
        // Ratio de costo: qué porcentaje del precio total es inversión
        const costRatio = repair.estimatedCost > 0 ? totalPartsCost / repair.estimatedCost : 0;
        
        const income = entry.revenue;
        const proratedCost = income * costRatio;
        const profit = income - proratedCost;

        return {
            'Fecha': format(new Date(entry.lastDate), 'dd/MM/yyyy HH:mm'),
            'Producto/Servicio': `REPARACIÓN: ${repair.deviceMake} ${repair.deviceModel} (${repair.customerName})`,
            'ID Transacción': entry.lastSaleId,
            'Costo Inversión ($)': Number(proratedCost.toFixed(2)),
            'Precio Venta ($)': Number(income.toFixed(2)),
            'Cantidad': 1,
            'Ingreso Recibido ($)': Number(income.toFixed(2)),
            'Ganancia Est. ($)': Number(profit.toFixed(2)),
            'Total (Bs)': Number((income * entry.bcvRate).toFixed(2)),
            'Tasa BCV Aplicada': Number(entry.bcvRate.toFixed(2)),
            'Método de Pago': Array.from(entry.paymentMethods).join(' + ')
        };
    });

    const dataToExport = [...productLines, ...consolidatedRepairLines].sort((a, b) => {
        const dateA = new Date(a['Fecha'].split(' ')[0].split('/').reverse().join('-') + ' ' + a['Fecha'].split(' ')[1]).getTime();
        const dateB = new Date(b['Fecha'].split(' ')[0].split('/').reverse().join('-') + ' ' + b['Fecha'].split(' ')[1]).getTime();
        return dateA - dateB;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ventas_PoosMariche");
    
    // Ajustar anchos de columna
    const cols = Object.keys(dataToExport[0] || {});
    const colWidths = cols.map(col => ({
        wch: Math.max(...dataToExport.map(row => (row[col as keyof typeof row] ?? '').toString().length), col.length + 2)
    }));
    worksheet["!cols"] = colWidths;

    XLSX.writeFile(workbook, `Reporte_Ventas_${format(from, "yyyy-MM-dd")}.xlsx`);
    toast({ title: "Excel generado exitosamente" });
  };

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className="w-full sm:w-[300px] justify-start text-left font-normal"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y", { locale: es })} -{" "}
                  {format(date.to, "LLL dd, y", { locale: es })}
                </>
              ) : (
                format(date.from, "LLL dd, y", { locale: es })
              )
            ) : (
              <span>Selecciona una fecha</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={setDate}
            numberOfMonths={2}
            locale={es}
          />
        </PopoverContent>
      </Popover>
      <Button onClick={handleExport} disabled={!date?.from}>
        <FileDown className="mr-2 h-4 w-4" />
        Generar Excel de Periodo
      </Button>
    </div>
  );
}
