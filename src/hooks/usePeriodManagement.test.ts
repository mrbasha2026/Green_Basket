import { describe, it, expect } from 'vitest'

// منطق حساب WAC الشهري — مستخرج من mutationFn في useCalculatePeriodWAC
// (الدالة نفسها مدمجة في الـ hook، هنا نختبر الخوارزمية بمعزل عن Supabase)
function computeProductWAC(params: {
  openingQty: number
  openingWac: number
  purchasedWeight: number
  purchasedValue: number
  salesQty: number      // صافي المبيعات (مرتجعات البيع تُطرح)
  wasteQty: number
}): { wac: number; closingQty: number; closingValue: number } {
  const { openingQty, openingWac, purchasedWeight, purchasedValue, salesQty, wasteQty } = params

  const openingValue = openingQty * openingWac
  const totalValue   = openingValue + purchasedValue
  const availableQty = openingQty + purchasedWeight

  const wac = availableQty > 0
    ? totalValue / availableQty
    : openingWac > 0
      ? openingWac
      : purchasedValue / Math.max(purchasedWeight, 0.001)

  const closingQty   = Math.max(0, openingQty + purchasedWeight - salesQty - wasteQty)
  const closingValue = closingQty * wac

  return { wac, closingQty, closingValue }
}

// منطق احتساب صافي المبيعات (مرتجع البيع يُطرح)
function calcNetSalesQty(
  salesRows: { qty_kg: number; transaction_type: string | null }[]
): number {
  return salesRows.reduce(
    (sum, r) => r.transaction_type === 'مرتجع_بيع' ? sum - r.qty_kg : sum + r.qty_kg,
    0
  )
}

// ── WAC الشهري ────────────────────────────────────────────────────────────────

describe('WAC الشهري — computeProductWAC', () => {
  it('حساب WAC مع مخزون افتتاحي ومشتريات', () => {
    // opening: 100 kg @ 4 SAR = 400 SAR
    // purchased: 200 kg @ 3.5 SAR = 700 SAR
    // WAC = (400 + 700) / (100 + 200) = 1100 / 300 ≈ 3.667
    const result = computeProductWAC({
      openingQty: 100, openingWac: 4,
      purchasedWeight: 200, purchasedValue: 700,
      salesQty: 150, wasteQty: 10,
    })
    expect(result.wac).toBeCloseTo(1100 / 300, 4)
    // closingQty = max(0, 100 + 200 - 150 - 10) = 140
    expect(result.closingQty).toBe(140)
    expect(result.closingValue).toBeCloseTo(140 * (1100 / 300), 2)
  })

  it('مخزون افتتاحي صفري — WAC من المشتريات فقط', () => {
    // 250 SAR على 50 kg → WAC = 5
    const result = computeProductWAC({
      openingQty: 0, openingWac: 0,
      purchasedWeight: 50, purchasedValue: 250,
      salesQty: 20, wasteQty: 5,
    })
    expect(result.wac).toBe(5)
    expect(result.closingQty).toBe(25)
    expect(result.closingValue).toBeCloseTo(125)
  })

  it('الهالك لا يؤثر على WAC (يؤثر فقط على المخزون الختامي)', () => {
    const base = { openingQty: 100, openingWac: 5, purchasedWeight: 100, purchasedValue: 600, salesQty: 50 }
    const withWaste    = computeProductWAC({ ...base, wasteQty: 30 })
    const withoutWaste = computeProductWAC({ ...base, wasteQty: 0 })

    // الـ WAC يجب أن يكون متطابقاً (الهالك لا يدخل في مقام WAC)
    expect(withWaste.wac).toBe(withoutWaste.wac)

    // المخزون الختامي يختلف بمقدار الهدر
    expect(withoutWaste.closingQty - withWaste.closingQty).toBe(30)
  })

  it('مبيعات تتجاوز المتاح — المخزون الختامي لا يقل عن 0', () => {
    const result = computeProductWAC({
      openingQty: 10, openingWac: 5,
      purchasedWeight: 0, purchasedValue: 0,
      salesQty: 20, wasteQty: 5,    // 25 > 10 المتاح
    })
    expect(result.closingQty).toBe(0)
  })

  it('لا كمية متاحة مع WAC افتتاحي — يستخدم WAC الافتتاحي', () => {
    // availableQty = 0, openingWac = 6 → wac = 6
    const result = computeProductWAC({
      openingQty: 0, openingWac: 6,
      purchasedWeight: 0, purchasedValue: 0,
      salesQty: 0, wasteQty: 0,
    })
    expect(result.wac).toBe(6)
  })

  it('لا شيء على الإطلاق — WAC من purchasedValue/purchasedWeight', () => {
    // كل القيم صفر بما في ذلك openingWac → WAC ≈ 0 (0/0.001)
    const result = computeProductWAC({
      openingQty: 0, openingWac: 0,
      purchasedWeight: 0, purchasedValue: 0,
      salesQty: 0, wasteQty: 0,
    })
    expect(result.wac).toBeCloseTo(0)
    expect(result.closingQty).toBe(0)
  })
})

// ── احتساب صافي المبيعات ──────────────────────────────────────────────────────

describe('calcNetSalesQty — مرتجع البيع يُطرح', () => {
  it('مبيعات فقط بدون مرتجعات', () => {
    const rows = [
      { qty_kg: 50, transaction_type: null },
      { qty_kg: 30, transaction_type: 'بيع' },
    ]
    expect(calcNetSalesQty(rows)).toBe(80)
  })

  it('مرتجع بيع يُطرح من المجموع', () => {
    const rows = [
      { qty_kg: 100, transaction_type: null },
      { qty_kg: 20,  transaction_type: 'مرتجع_بيع' },
    ]
    expect(calcNetSalesQty(rows)).toBe(80)
  })

  it('مبيعات متعددة ومرتجعات متعددة', () => {
    const rows = [
      { qty_kg: 60,  transaction_type: null },
      { qty_kg: 40,  transaction_type: null },
      { qty_kg: 15,  transaction_type: 'مرتجع_بيع' },
      { qty_kg: 10,  transaction_type: 'مرتجع_بيع' },
    ]
    expect(calcNetSalesQty(rows)).toBe(75)   // 100 - 25
  })

  it('قائمة فارغة — صفر', () => {
    expect(calcNetSalesQty([])).toBe(0)
  })
})
