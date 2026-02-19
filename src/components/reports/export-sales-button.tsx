
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
import type { Product, Sale, RepairJob } from "@/lib/types";
import { es } from "date-fns/locale";
import * as XLSX from "xlsx";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/use-currency";

type ExportSalesButtonProps = {
  sales: Sale[];
  products: Product[];
  repairJobs: RepairJob[];
};

export function ExportSalesButton({ sales, products, repairJobs }: ExportSalesButtonProps) {
  const [date, setDate] = useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(),
  });
  const { toast } = useToast();
  const { bcvRate } = useCurrency();

  const handleExport = () => {
    if (!date?.from) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Por favor, selecciona un rango de fechas.",
      });
      return;
    }
    
    const from = startOfDay(date.from);
    const to = date.to ? endOfDay(date.to) : endOfDay(date.from);

    // Filtramos por fecha y que la venta esté completada (sin reembolsos)
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
    
    const dataToExport = filteredSales.flatMap(sale => {
        return sale.items.map(item => {
            let productName = item.name;
            let costPrice = 0;

            if (item.isRepair) {
                const repairJob = repairJobs.find(job => job.id === sale.repairJobId);
                if (repairJob && repairJob.reservedParts && repairJob.reservedParts.length > 0) {
                    const mainPart = repairJob.reservedParts[0];
                    productName = `Reparación: ${item.name} (${mainPart.productName})`;
                    costPrice = mainPart.costPrice;
                }
            } else if (item.isCustom) {
                costPrice = item.customCostPrice || 0;
            } else {
                const product = products.find(p => p.id === item.productId);
                costPrice = product?.costPrice || 0;
            }

            const totalUSD = item.price * item.quantity;
            const totalProfit = (item.price - costPrice) * item.quantity;
            const totalBs = totalUSD * bcvRate;

            return {
                'Fecha': format(new Date(sale.transactionDate), 'dd/MM/yyyy HH:mm'),
                'Producto/Servicio': productName,
                'Costo ($)': costPrice,
                'Precio Venta ($)': item.price,
                'Cantidad': item.quantity,
                'Total ($)': totalUSD,
                'Ganancia ($)': totalProfit,
                'Total (Bs)': totalBs,
                'Tasa Aplicada': bcvRate,
                'Método de Pago': sale.paymentMethod
            }
        })
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte_Financiero");
    
    // Ajuste automático de ancho de columnas
    const cols = Object.keys(dataToExport[0] || {});
    const colWidths = cols.map(col => ({
        wch: Math.max(...dataToExport.map(row => (row[col as keyof typeof row] ?? '').toString().length), col.length + 2)
    }));
    worksheet["!cols"] = colWidths;

    XLSX.writeFile(workbook, `Reporte_Financiero_${format(from, "yyyy-MM-dd")}.xlsx`);
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
        Generar Reporte Detallado
      </Button>
    </div>
  );
}
