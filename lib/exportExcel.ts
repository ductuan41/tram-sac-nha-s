"use client";

export type ExcelColumn = { header: string; key: string; width?: number };
export type ExcelSheet = {
  name: string;
  columns: ExcelColumn[];
  rows: Record<string, unknown>[];
};

function safeValue(value: unknown): string | number | boolean {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  const text = String(value);
  // Data imported from user inputs must not be interpreted as Excel formulas.
  return /^[\s]*[=+@\-]/.test(text) ? "'" + text : text;
}

export async function downloadExcel(filename: string, sheets: ExcelSheet[]) {
  if (typeof window === "undefined") return;
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Trạm sạc nhà S";
  workbook.created = new Date();

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name.slice(0, 31));
    ws.columns = sheet.columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width ?? 22,
    }));
    sheet.rows.forEach((r) => {
      const cleaned: Record<string, string | number | boolean> = {};
      sheet.columns.forEach((col) => { cleaned[col.key] = safeValue(r[col.key]); });
      ws.addRow(cleaned);
    });
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = {
      type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" },
    };
    ws.getRow(1).alignment = { vertical: "middle", wrapText: true };
    ws.getRow(1).height = 29;
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
    ws.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
      }
      row.alignment = { vertical: "top" };
    });
  }
  const bytes = await workbook.xlsx.writeBuffer();
  const blob = new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
