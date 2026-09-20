import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export type ExportColumn = {
  header: string
  key: string
  width?: number
}

function safeName(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120)
}

function normalizedFileName(name: string, extension: 'xlsx' | 'pdf') {
  const base = safeName(name.replace(/\.(xlsx|xls|csv|pdf)$/i, '')) || 'KOMTROL_Export'
  return `${base}.${extension}`
}

function cellText(value: unknown): string | number | boolean {
  if (value == null) return ''
  if (value instanceof Date) return value.toLocaleString('es-PE')
  if (typeof value === 'number' || typeof value === 'boolean') return value
  return String(value)
}

export function exportRowsToExcel(
  filename: string,
  sheetName: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  summary?: Array<[string, unknown]>
) {
  const workbook = XLSX.utils.book_new()
  const matrix: any[][] = [
    columns.map((column) => column.header),
    ...rows.map((row) => columns.map((column) => cellText(row[column.key]))),
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(matrix)
  worksheet['!cols'] = columns.map((column) => ({ wch: column.width ?? 18 }))
  if (rows.length) {
    worksheet['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: rows.length, c: Math.max(0, columns.length - 1) },
      }),
    }
  }
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31) || 'Datos')

  if (summary?.length) {
    const summaryMatrix: any[][] = [
      ['KOMTROL'],
      ['Generado', new Date().toLocaleString('es-PE')],
      ...summary,
    ]
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryMatrix)
    summarySheet['!cols'] = [{ wch: 28 }, { wch: 72 }]
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen')
  }

  XLSX.writeFile(workbook, normalizedFileName(filename, 'xlsx'))
}

export function exportRowsToPdfPortrait(
  filename: string,
  title: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  options?: {
    subtitle?: string
    summary?: Array<[string, unknown]>
  }
) {
  // Estándar KOMTROL: todos los reportes PDF se generan en A4 vertical.
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 9

  const summaryText = options?.summary?.length
    ? options.summary.map(([label, value]) => `${label}: ${String(value ?? '')}`).join('  ·  ')
    : ''

  // Para mantener legibilidad en vertical, los reportes muy anchos se dividen
  // en bloques de columnas. La primera columna se repite como identificador.
  const maxColumnsPerSection = 8
  const columnSections: ExportColumn[][] = []
  if (columns.length <= maxColumnsPerSection) {
    columnSections.push(columns)
  } else {
    const anchor = columns[0]
    const rest = columns.slice(1)
    const chunkSize = maxColumnsPerSection - 1
    for (let index = 0; index < rest.length; index += chunkSize) {
      columnSections.push([anchor, ...rest.slice(index, index + chunkSize)])
    }
  }

  const drawHeader = (sectionIndex: number) => {
    doc.setFillColor(51, 67, 154)
    doc.rect(0, 0, pageWidth, 22, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text(title, marginX, 9)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text(`Generado: ${new Date().toLocaleString('es-PE')}`, marginX, 15)
    if (columnSections.length > 1) {
      doc.text(
        `Bloque ${sectionIndex + 1} de ${columnSections.length}`,
        pageWidth - marginX,
        15,
        { align: 'right' }
      )
    }
  }

  columnSections.forEach((sectionColumns, sectionIndex) => {
    if (sectionIndex > 0) doc.addPage('a4', 'portrait')
    drawHeader(sectionIndex)

    let startY = 28
    if (options?.subtitle) {
      doc.setTextColor(51, 64, 120)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      const lines = doc.splitTextToSize(options.subtitle, pageWidth - marginX * 2)
      doc.text(lines, marginX, startY)
      startY += Math.max(5, lines.length * 3.5 + 2)
    }

    if (summaryText) {
      doc.setTextColor(109, 120, 158)
      doc.setFontSize(7)
      const lines = doc.splitTextToSize(summaryText, pageWidth - marginX * 2)
      doc.text(lines, marginX, startY)
      startY += Math.max(5, lines.length * 3.5 + 2)
    }

    const count = sectionColumns.length
    const fontSize = count <= 5 ? 7.3 : count <= 7 ? 6.3 : 5.7

    autoTable(doc, {
      startY,
      margin: { left: marginX, right: marginX, top: 26, bottom: 12 },
      head: [sectionColumns.map((column) => column.header)],
      body: rows.map((row) => sectionColumns.map((column) => cellText(row[column.key]))) as any[][],
      theme: 'grid',
      tableWidth: 'auto',
      styles: {
        font: 'helvetica',
        fontSize,
        cellPadding: count >= 7 ? 1.15 : 1.45,
        textColor: [51, 64, 120],
        lineColor: [216, 222, 248],
        lineWidth: 0.15,
        overflow: 'linebreak',
        valign: 'middle',
        minCellHeight: 4.5,
      },
      headStyles: {
        fillColor: [51, 67, 154],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: Math.max(5.5, fontSize),
      },
      alternateRowStyles: { fillColor: [247, 248, 255] },
      didDrawPage: () => {
        // autoTable crea páginas adicionales; se repite el encabezado KOMTROL.
        drawHeader(sectionIndex)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.5)
        doc.setTextColor(135, 145, 176)
        doc.text(
          `KOMTROL · Página ${doc.getNumberOfPages()}`,
          pageWidth - marginX,
          pageHeight - 6,
          { align: 'right' }
        )
      },
    })
  })

  doc.save(normalizedFileName(filename, 'pdf'))
}

