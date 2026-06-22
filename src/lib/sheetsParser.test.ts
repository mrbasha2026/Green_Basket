import { describe, it, expect } from 'vitest'
import { parseCustomerSheet, parsePurchasesSheet } from './sheetsParser'

// ── parseCustomerSheet ────────────────────────────────────────────────────────
// هيكل الصف: [productName, ignored, qty@col2, buyPrice@col3, ignored@col4, sellPrice@col5, total@col6]
// التاريخ في العمود 2 (DATE_START_COL=2) في صف الرأس

describe('parseCustomerSheet', () => {
  it('يُرجع [] للبيانات الفارغة أو القصيرة', () => {
    expect(parseCustomerSheet([])).toEqual([])
    expect(parseCustomerSheet([[]])).toEqual([])
  })

  it('تحليل ورقة عميل بسيطة', () => {
    const rows = [
      ['المنتج', 'الوحدة', '2024-01-15', '', '', '', ''],
      ['طماطم',  '',       '10',          '5', '', '8', '80'],
    ]
    const result = parseCustomerSheet(rows)

    expect(result).toHaveLength(1)
    expect(result[0].productName).toBe('طماطم')
    expect(result[0].qty).toBe(10)
    expect(result[0].buyPrice).toBe(5)
    expect(result[0].sellPrice).toBe(8)
    expect(result[0].total).toBe(80)
  })

  it('تخطي صفوف qty=0', () => {
    const rows = [
      ['المنتج', 'الوحدة', '2024-01-20', '', '', '', ''],
      ['باذنجان', '',       '0',           '5', '', '8', '0'],
      ['كوسا',    '',       '5',           '4', '', '7', '35'],
    ]
    const result = parseCustomerSheet(rows)
    expect(result).toHaveLength(1)
    expect(result[0].productName).toBe('كوسا')
  })

  it('تخطي صفوف الإجمالي والمجاميع', () => {
    const rows = [
      ['المنتج', 'الوحدة', '2024-01-15', '', '', '', ''],
      ['الإجمالي', '',     '100',          '', '', '',  ''],
      ['اجمالي',   '',     '200',          '', '', '',  ''],
      ['المجموع',  '',     '50',           '', '', '',  ''],
      ['بطاطس',    '',     '5',            '3', '', '6', '30'],
    ]
    const result = parseCustomerSheet(rows)
    expect(result).toHaveLength(1)
    expect(result[0].productName).toBe('بطاطس')
  })

  it('تخطي صفوف التاريخ في عمود المنتج', () => {
    const rows = [
      ['المنتج', 'الوحدة', '2024-02-01', '', '', '', ''],
      ['01/02/2024', '',   '999',          '', '', '', ''],  // صف تاريخ — يُتخطى
      ['خيار',       '',   '8',            '3', '', '6', '48'],
    ]
    const result = parseCustomerSheet(rows)
    expect(result.every(r => r.productName === 'خيار')).toBe(true)
  })

  it('أرقام عربية (٥٠٫٥ و٣)', () => {
    const rows = [
      ['المنتج', 'الوحدة', '2024-02-10', '', '', '', ''],
      ['خيار',   '',       '٥٠٫٥',        '٣', '', '٦٫٥', '٣٢٧٫٧٥'],
    ]
    const result = parseCustomerSheet(rows)
    expect(result[0].qty).toBeCloseTo(50.5)
    expect(result[0].buyPrice).toBe(3)
    expect(result[0].sellPrice).toBeCloseTo(6.5)
  })

  it('تاريخ serial من Excel (45306 ≈ 2024-01-15)', () => {
    const rows = [
      ['المنتج', 'الوحدة', 45306, '', '', '', ''],
      ['فلفل',   '',       '20',  '4', '', '7', '140'],
    ]
    const result = parseCustomerSheet(rows)
    expect(result).toHaveLength(1)
    expect(result[0].date.getUTCFullYear()).toBe(2024)
    expect(result[0].date.getUTCMonth()).toBe(0)    // يناير
    expect(result[0].date.getUTCDate()).toBe(15)
  })

  it('تنسيق DD/MM/YYYY — أول رقم أكبر من 12 → يوم', () => {
    const rows = [
      ['المنتج', 'الوحدة', '25/03/2024', '', '', '', ''],
      ['زعتر',   '',       '3',           '10', '', '15', '45'],
    ]
    const result = parseCustomerSheet(rows)
    expect(result[0].date.getUTCDate()).toBe(25)
    expect(result[0].date.getUTCMonth()).toBe(2)    // مارس
    expect(result[0].date.getUTCFullYear()).toBe(2024)
  })

  it('تنسيق YYYY-MM-DD', () => {
    const rows = [
      ['المنتج', 'الوحدة', '2024-07-04', '', '', '', ''],
      ['تفاح',   '',       '15',          '8', '', '12', '180'],
    ]
    const result = parseCustomerSheet(rows)
    expect(result[0].date.getUTCFullYear()).toBe(2024)
    expect(result[0].date.getUTCMonth()).toBe(6)    // يوليو
    expect(result[0].date.getUTCDate()).toBe(4)
  })

  it('تواريخ متعددة في نفس الورقة — سجل لكل تاريخ', () => {
    const rows = [
      ['المنتج', 'الوحدة', '2024-01-01', '', '', '', '', '2024-01-02', '', '', '', ''],
      ['بندورة',  '',       '10',          '3', '', '5', '50', '8', '3', '', '5', '40'],
    ]
    const result = parseCustomerSheet(rows)
    expect(result).toHaveLength(2)
    expect(result[0].date.getUTCDate()).toBe(1)
    expect(result[1].date.getUTCDate()).toBe(2)
  })
})

// ── parsePurchasesSheet ───────────────────────────────────────────────────────
// هيكل الصف (step=7): [productName, cartons@col1, price@col2, ignored@col3, weight@col4, @col5, @col6, waste@col7]
// التاريخ في العمود 1 (DATE_START_COL=1) في صف الرأس

describe('parsePurchasesSheet', () => {
  it('يُرجع [] للبيانات الفارغة', () => {
    expect(parsePurchasesSheet([])).toEqual([])
    expect(parsePurchasesSheet([[]])).toEqual([])
  })

  it('تحليل ورقة مشتريات بسيطة (تاريخ واحد, step=7)', () => {
    // col1=date في الرأس → cartons@1, price@2, weight@4, waste@7
    const rows = [
      ['المنتج', '2024-03-01', '', '', '', '', '', ''],
      ['تفاح',    '10',         '50', '', '25', '', '', '2'],
    ]
    const result = parsePurchasesSheet(rows)

    expect(result).toHaveLength(1)
    expect(result[0].productName).toBe('تفاح')
    expect(result[0].cartons).toBe(10)
    expect(result[0].price).toBe(50)
    expect(result[0].weight).toBe(25)
    expect(result[0].waste).toBe(2)
  })

  it('تخطي صفوف الاجمالي والمجاميع', () => {
    const rows = [
      ['المنتج',           '2024-03-01', '', '', '', '', '', ''],
      ['اجمالي المشتريات', '10',          '50', '', '25', '', '', '2'],
      ['عنب',               '5',           '60', '', '15', '', '', '1'],
    ]
    const result = parsePurchasesSheet(rows)
    expect(result).toHaveLength(1)
    expect(result[0].productName).toBe('عنب')
  })

  it('تخطي صفوف cartons=0 و waste=0 معاً', () => {
    const rows = [
      ['المنتج', '2024-03-01', '', '', '', '', '', ''],
      ['فراولة',  '0',          '30', '', '0', '', '', '0'],
      ['موز',     '3',          '20', '', '12', '', '', '0'],
    ]
    const result = parsePurchasesSheet(rows)
    expect(result).toHaveLength(1)
    expect(result[0].productName).toBe('موز')
  })

  it('إدراج صف بـ waste>0 حتى مع cartons=0 (تسجيل الهدر فقط)', () => {
    const rows = [
      ['المنتج', '2024-03-05', '', '', '', '', '', ''],
      ['ليمون',   '0',          '0', '', '0', '', '', '3'],
    ]
    const result = parsePurchasesSheet(rows)
    expect(result).toHaveLength(1)
    expect(result[0].waste).toBe(3)
  })

  it('تاريخ serial من Excel', () => {
    // 45353 ≈ 2024-03-01
    const rows = [
      ['المنتج', 45353, '', '', '', '', '', ''],
      ['برتقال',  '6',   '40', '', '18', '', '', '1'],
    ]
    const result = parsePurchasesSheet(rows)
    expect(result).toHaveLength(1)
    expect(result[0].date.getUTCFullYear()).toBe(2024)
    expect(result[0].date.getUTCMonth()).toBe(2)    // مارس
  })
})
