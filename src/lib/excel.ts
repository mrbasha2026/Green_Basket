// ── Export ────────────────────────────────────────────────────────────────────
export async function exportToExcel(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
  sheetName = 'البيانات'
) {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  const ws = wb.addWorksheet(sheetName)

  const headerRow = ws.addRow(headers)
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16A34A' } }
    cell.alignment = { horizontal: 'right' }
  })

  rows.forEach(r => {
    const row = ws.addRow(r.map(v => v ?? ''))
    row.eachCell(cell => { cell.alignment = { horizontal: 'right' } })
  })

  ws.columns.forEach(col => {
    let max = 12
    col.eachCell?.({ includeEmpty: false }, cell => {
      const len = String(cell.value ?? '').length
      if (len > max) max = len
    })
    col.width = Math.min(max + 2, 35)
  })

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// ── Template download ─────────────────────────────────────────────────────────
export async function downloadTemplate(filename: string, headers: string[], exampleRows: (string | number)[][]) {
  await exportToExcel(filename, headers, exampleRows, 'نموذج')
}

// ── Parse uploaded Excel file ─────────────────────────────────────────────────
export async function parseExcelFile(file: File): Promise<Record<string, string | number>[]> {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) return []

  const headers: string[] = []
  const result: Record<string, string | number>[] = []

  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) {
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        headers[colNum - 1] = String(cell.value ?? `col${colNum}`).trim()
      })
      return
    }
    const obj: Record<string, string | number> = {}
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const h = headers[colNum - 1]
      if (!h) return
      const v = cell.value
      if (v instanceof Date) obj[h] = v.toISOString().split('T')[0]
      else if (v !== null && v !== undefined && typeof v === 'object' && 'result' in v)
        obj[h] = (v as { result: number | string }).result
      else obj[h] = (v ?? '') as string | number
    })
    result.push(obj)
  })

  return result.filter(r => Object.values(r).some(v => v !== '' && v !== 0))
}
