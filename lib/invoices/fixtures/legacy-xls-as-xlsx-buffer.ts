import XLSX from 'xlsx'

/**
 * Legacy BIFF `.xls` files are not readable by ExcelJS `xlsx.load`. SheetJS reads them and
 * can emit OOXML so production parsers stay unchanged while fixture tests use real invoices.
 */
export function legacyXlsBufferToXlsxBuffer(source: Buffer): Buffer {
  const workbook = XLSX.read(source, { type: 'buffer', cellDates: true })
  return Buffer.from(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }))
}
