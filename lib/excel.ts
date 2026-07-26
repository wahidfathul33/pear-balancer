export type ExcelCellValue = string | number | boolean | Date | null | undefined;

export interface ExcelColumn<Row> {
  header: string;
  value: (row: Row, index: number) => ExcelCellValue;
  width?: number;
}

/** Build and download a real XLSX workbook in the browser. */
export async function downloadXlsx<Row>(options: {
  filename: string;
  sheetName: string;
  rows: Row[];
  columns: ExcelColumn<Row>[];
}): Promise<void> {
  const { utils, writeFileXLSX } = await import("xlsx");
  const data = [
    options.columns.map((column) => column.header),
    ...options.rows.map((row, index) =>
      options.columns.map((column) => column.value(row, index))
    ),
  ];
  const worksheet = utils.aoa_to_sheet(data, { cellDates: true });
  worksheet["!cols"] = options.columns.map((column) => ({ wch: column.width ?? 16 }));

  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, options.sheetName.slice(0, 31));
  const filename = options.filename.toLowerCase().endsWith(".xlsx")
    ? options.filename
    : `${options.filename}.xlsx`;

  writeFileXLSX(workbook, filename, { compression: true });
}
