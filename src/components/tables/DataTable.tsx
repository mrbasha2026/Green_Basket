import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getFilteredRowModel, getPaginationRowModel,
  flexRender, type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, Download, ChevronRight, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  searchPlaceholder?: string
  onExportExcel?: () => Promise<void>
  className?: string
  rowClassName?: (row: T) => string
  showSearch?: boolean       // افتراضي true
  showPagination?: boolean   // افتراضي true — يُخفى تلقائياً عند قِلّة البيانات
  defaultPageSize?: number
}

export function DataTable<T>({
  data, columns, searchPlaceholder = 'بحث...', onExportExcel, className, rowClassName,
  showSearch = true, showPagination = true, defaultPageSize = 20,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [pageSize, setPageSize] = useState(defaultPageSize)

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: defaultPageSize } },
  })

  function handlePageSizeChange(val: string) {
    const n = parseInt(val)
    setPageSize(n)
    table.setPageSize(n)
  }

  const total = table.getFilteredRowModel().rows.length
  const pageIndex = table.getState().pagination.pageIndex
  const pageCount = table.getPageCount()
  const from = pageIndex * pageSize + 1
  const to = Math.min(from + pageSize - 1, total)

  const needsPagination = showPagination && total > pageSize

  return (
    <div className={cn('space-y-3', className)}>
      {/* Toolbar — يظهر فقط إذا كان البحث مطلوباً أو يوجد تصدير */}
      {(showSearch || onExportExcel) && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {showSearch && (
            <Input
              placeholder={searchPlaceholder}
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="max-w-xs h-8 text-sm"
            />
          )}
          {onExportExcel && (
            <Button variant="outline" size="sm" onClick={onExportExcel} className="gap-2 shrink-0">
              <Download className="w-4 h-4" />
              Excel
            </Button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden shadow-sm">
        <div className="overflow-auto max-h-[560px]">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="bg-muted/60 hover:bg-muted/60 sticky top-0 z-10">
                  {hg.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        'text-right text-xs font-semibold text-foreground uppercase tracking-wide py-3 px-4',
                        header.column.getCanSort() && 'cursor-pointer select-none hover:text-primary'
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          header.column.getIsSorted() === 'asc' ? (
                            <ChevronUp className="w-3.5 h-3.5 text-primary" />
                          ) : header.column.getIsSorted() === 'desc' ? (
                            <ChevronDown className="w-3.5 h-3.5 text-primary" />
                          ) : (
                            <ChevronsUpDown className="w-3 h-3 opacity-30" />
                          )
                        )}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-12">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-2xl">📭</span>
                      <span>لا توجد بيانات</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row, i) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      'border-b border-border/50 last:border-b-0 transition-colors',
                      i % 2 === 0 ? 'bg-background' : 'bg-muted/20',
                      'hover:bg-primary/5',
                      rowClassName?.(row.original)
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="text-right py-2.5 px-4 text-sm">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination — يظهر فقط عند الحاجة */}
      {needsPagination && <div className="flex items-center justify-between text-sm text-muted-foreground flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span>عرض</span>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="w-20 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100, 200, 500].map(n => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>سجل</span>
          {total > 0 && (
            <span className="text-foreground font-medium">
              — {from}-{to} من {total}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0"
            onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
            «
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0"
            onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <span className="px-3 py-1 rounded border border-border bg-muted/50 text-xs font-medium min-w-16 text-center">
            {pageIndex + 1} / {pageCount || 1}
          </span>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0"
            onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0"
            onClick={() => table.setPageIndex(pageCount - 1)} disabled={!table.getCanNextPage()}>
            »
          </Button>
        </div>
      </div>}

      {/* عداد بسيط بدون pagination عند قِلّة البيانات */}
      {!needsPagination && total > 0 && (
        <p className="text-xs text-muted-foreground text-left">{total} سجل</p>
      )}
    </div>
  )
}
