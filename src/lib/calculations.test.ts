import { describe, it, expect } from 'vitest'
import {
  calcWeightedAvgCost,
  calcCostPerKg,
  computeOverheadShare,
  computeProductAllocation,
  computeMonthlyPL,
} from './calculations'
import type { CostAllocationResult } from '@/types'

// ── calcWeightedAvgCost ───────────────────────────────────────────────────────

describe('calcWeightedAvgCost', () => {
  it('حساب WAC طبيعي مع مخزون افتتاحي ومشتريات', () => {
    // opening: 10 kg @ 5 SAR/kg = 50 SAR
    // purchased: 20 kg, cost 80 SAR
    // WAC = (50 + 80) / (10 + 20) = 130 / 30 ≈ 4.333
    expect(calcWeightedAvgCost(10, 5, 20, 80)).toBeCloseTo(4.333, 2)
  })

  it('مخزون افتتاحي صفري — WAC من المشتريات فقط', () => {
    // 300 SAR على 100 kg → WAC = 3
    expect(calcWeightedAvgCost(0, 0, 100, 300)).toBe(3)
  })

  it('لا مخزون ولا مشتريات — يُرجع 0', () => {
    expect(calcWeightedAvgCost(0, 0, 0, 0)).toBe(0)
  })

  it('كمية متاحة صفرية (opening=0, purchased=0) — يُرجع 0 حتى مع وجود تكلفة', () => {
    // totalValue = 0*5 + 100 = 100, availableStock = 0 → return 0
    expect(calcWeightedAvgCost(0, 5, 0, 100)).toBe(0)
  })

  it('تكلفة شراء صفرية — WAC يعتمد فقط على المخزون الافتتاحي', () => {
    // opening: 50 kg @ 4 SAR = 200 SAR, purchased: 50 kg @ 0 SAR
    // WAC = 200 / 100 = 2
    expect(calcWeightedAvgCost(50, 4, 50, 0)).toBe(2)
  })

  it('مشتريات فقط بدون مخزون افتتاحي — WAC = تكلفة الوحدة المشتراة', () => {
    // 0 opening + 40 kg @ 6 SAR/kg = 240 SAR → WAC = 6
    expect(calcWeightedAvgCost(0, 0, 40, 240)).toBe(6)
  })

  it('WAC صحيح عندما تكلفة الافتتاح أعلى من تكلفة المشتريات', () => {
    // opening: 20 kg @ 10 = 200, purchased: 80 kg, cost 160 SAR
    // WAC = (200 + 160) / (20 + 80) = 360 / 100 = 3.6
    expect(calcWeightedAvgCost(20, 10, 80, 160)).toBeCloseTo(3.6)
  })
})

// ── calcCostPerKg ─────────────────────────────────────────────────────────────

describe('calcCostPerKg', () => {
  it('حساب تكلفة الكيلو بعد خصم الهدر', () => {
    // 100 SAR على 50 kg بعد هدر 10 kg → 100 / 40 = 2.5
    expect(calcCostPerKg(100, 50, 10)).toBe(2.5)
  })

  it('هدر مساوٍ للوزن — يُرجع 0', () => {
    expect(calcCostPerKg(200, 20, 20)).toBe(0)
  })

  it('هدر أكبر من الوزن — يُرجع 0', () => {
    expect(calcCostPerKg(100, 30, 40)).toBe(0)
  })

  it('وزن وهدر صفر — يُرجع 0', () => {
    expect(calcCostPerKg(0, 0, 0)).toBe(0)
  })

  it('بدون هدر — تكلفة على الوزن الكامل', () => {
    expect(calcCostPerKg(500, 100, 0)).toBe(5)
  })

  it('هدر ضئيل جداً — لا يؤثر تقريباً', () => {
    // 1000 SAR / (200 - 1) = 1000 / 199 ≈ 5.025
    expect(calcCostPerKg(1000, 200, 1)).toBeCloseTo(1000 / 199, 5)
  })
})

// ── computeOverheadShare ──────────────────────────────────────────────────────

describe('computeOverheadShare', () => {
  // ── طريقة الإيراد ──────────────────────────────────────────────────────────

  it('revenue — توزيع نسبي حسب الإيراد', () => {
    // المنتج له 400 من إجمالي 1000 → 40% من overhead 500 = 200
    expect(computeOverheadShare('revenue', 400, 1000, 3, 500)).toBe(200)
  })

  it('revenue — إيراد إجمالي صفري → 0', () => {
    expect(computeOverheadShare('revenue', 0, 0, 3, 500)).toBe(0)
  })

  it('revenue — المنتج له 100% من الإيراد → كامل الـ overhead', () => {
    expect(computeOverheadShare('revenue', 1000, 1000, 1, 800)).toBe(800)
  })

  it('revenue — مجموع نصيب جميع المنتجات = إجمالي الـ overhead', () => {
    const total = 1200
    const overhead = 600
    const shares = [300, 400, 500].map(s =>
      computeOverheadShare('revenue', s, total, 3, overhead)
    )
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(overhead)
  })

  // ── طريقة الكمية ──────────────────────────────────────────────────────────

  it('qty — توزيع نسبي حسب الكمية', () => {
    // 200 kg من 500 kg إجمالي → 40% من overhead 300 = 120
    expect(computeOverheadShare('qty', 200, 500, 3, 300)).toBe(120)
  })

  it('qty — كمية إجمالية صفرية → 0', () => {
    expect(computeOverheadShare('qty', 0, 0, 3, 300)).toBe(0)
  })

  it('qty — مجموع نصيب جميع المنتجات = إجمالي الـ overhead', () => {
    const total = 300
    const overhead = 900
    const shares = [60, 90, 150].map(s =>
      computeOverheadShare('qty', s, total, 3, overhead)
    )
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(overhead)
  })

  // ── طريقة المساواة ────────────────────────────────────────────────────────

  it('equal — توزيع متساوٍ على عدد المنتجات', () => {
    // overhead 900 على 3 منتجات → 300 لكل منتج
    expect(computeOverheadShare('equal', 0, 0, 3, 900)).toBe(300)
  })

  it('equal — منتج واحد → كامل الـ overhead', () => {
    expect(computeOverheadShare('equal', 0, 0, 1, 750)).toBe(750)
  })

  it('equal — عدد منتجات صفري → 0', () => {
    expect(computeOverheadShare('equal', 0, 0, 0, 900)).toBe(0)
  })

  it('equal — مجموع نصيب 4 منتجات = إجمالي الـ overhead', () => {
    const overhead = 800
    const total = [1, 2, 3, 4].reduce(
      (sum) => sum + computeOverheadShare('equal', 0, 0, 4, overhead),
      0
    )
    expect(total).toBe(overhead)
  })

  it('overhead صفري — النتيجة دائماً 0 بصرف النظر عن الطريقة', () => {
    expect(computeOverheadShare('revenue', 500, 1000, 3, 0)).toBe(0)
    expect(computeOverheadShare('qty', 100, 300, 3, 0)).toBe(0)
    expect(computeOverheadShare('equal', 0, 0, 5, 0)).toBe(0)
  })
})

// ── computeProductAllocation ──────────────────────────────────────────────────

describe('computeProductAllocation', () => {
  it('إيراد صفري — نسب الإيراد 0%', () => {
    const result = computeProductAllocation('p1', 0, 1000, 50, 200, 30, 100)
    expect(result.revenue_share_pct).toBe(0)
    expect(result.contribution_margin_pct).toBe(0)
    expect(result.full_cost_per_kg).toBeCloseTo((200 + 30 + 50) / 100)
  })

  it('كمية مباعة صفرية — تكلفة الكيلو 0', () => {
    const result = computeProductAllocation('p1', 500, 1000, 50, 300, 50, 0)
    expect(result.full_cost_per_kg).toBe(0)
    expect(result.breakeven_price_kg).toBe(0)
  })

  it('حساب صحيح لجميع الحقول', () => {
    // revenue=500, totalRevenue=1000, overhead=100, directCost=300, wasteCost=50, qty=100
    const result = computeProductAllocation('p1', 500, 1000, 100, 300, 50, 100)

    expect(result.product_id).toBe('p1')
    expect(result.revenue_share_pct).toBe(50)             // 500/1000 * 100
    expect(result.gross_profit).toBe(150)                 // 500 - 300 - 50
    expect(result.net_profit).toBe(50)                    // 500 - (300 + 50 + 100)
    expect(result.total_full_cost).toBe(450)              // 300 + 50 + 100
    expect(result.full_cost_per_kg).toBeCloseTo(4.5)      // 450 / 100
    expect(result.breakeven_price_kg).toBeCloseTo(4.5)
    expect(result.contribution_margin).toBe(200)          // 500 - 300
    expect(result.contribution_margin_pct).toBe(40)       // 200/500 * 100
  })

  it('إيراد يساوي إجمالي الإيراد — نسبة 100%', () => {
    const result = computeProductAllocation('p2', 1000, 1000, 0, 600, 0, 200)
    expect(result.revenue_share_pct).toBe(100)
  })

  it('خسارة إجمالية — gross_profit سالب عندما COGS > revenue', () => {
    // revenue=300, directCost=400, wasteCost=50 → gross_profit = -150
    const result = computeProductAllocation('p1', 300, 1000, 0, 400, 50, 80)
    expect(result.gross_profit).toBe(-150)
    expect(result.net_profit).toBe(-150)  // no overhead
    expect(result.contribution_margin).toBe(-100) // 300 - 400
  })

  it('خسارة صافية — net_profit سالب بسبب الـ overhead', () => {
    // revenue=500, directCost=300, wasteCost=0, overhead=300 → net = 500-300-300 = -100
    const result = computeProductAllocation('p1', 500, 1000, 300, 300, 0, 100)
    expect(result.gross_profit).toBe(200)   // 500 - 300
    expect(result.net_profit).toBe(-100)    // 500 - 300 - 300
  })

  it('بدون هدر — contribution_margin يساوي gross_profit', () => {
    const result = computeProductAllocation('p1', 800, 1000, 100, 500, 0, 200)
    expect(result.waste_cost).toBe(0)
    expect(result.gross_profit).toBe(result.contribution_margin) // كلاهما = revenue - directCost
  })

  it('بدون overhead — total_full_cost = direct + waste فقط', () => {
    const result = computeProductAllocation('p1', 600, 1000, 0, 350, 50, 100)
    expect(result.allocated_overhead).toBe(0)
    expect(result.total_full_cost).toBe(400)    // 350 + 50
    expect(result.net_profit).toBe(result.gross_profit)
  })

  it('كل القيم صفر — لا يحدث استثناء', () => {
    const result = computeProductAllocation('p0', 0, 0, 0, 0, 0, 0)
    expect(result.revenue_share_pct).toBe(0)
    expect(result.gross_profit).toBe(0)
    expect(result.net_profit).toBe(0)
    expect(result.full_cost_per_kg).toBe(0)
  })

  it('breakeven_price_kg يساوي full_cost_per_kg دائماً', () => {
    const result = computeProductAllocation('p1', 700, 2000, 150, 400, 80, 120)
    expect(result.breakeven_price_kg).toBe(result.full_cost_per_kg)
  })
})

// ── computeMonthlyPL ──────────────────────────────────────────────────────────

describe('computeMonthlyPL', () => {
  const mockAllocation = (overrides: Partial<CostAllocationResult> = {}): CostAllocationResult => ({
    product_id: 'p1',
    revenue: 1000,
    revenue_share_pct: 100,
    direct_cost: 600,
    waste_cost: 50,
    allocated_overhead: 100,
    total_full_cost: 750,
    gross_profit: 350,
    net_profit: 250,
    qty_sold_kg: 200,
    full_cost_per_kg: 3.75,
    breakeven_price_kg: 3.75,
    contribution_margin: 400,
    contribution_margin_pct: 40,
    ...overrides,
  })

  it('تصنيف التكاليف بالعربية بشكل صحيح', () => {
    const overhead = {
      'رواتب الموظفين': 3000,
      'إيجار المحل': 2000,
      'نقل البضاعة': 1000,
      'كهرباء': 500,
      'مياه': 200,
      'صيانة': 300,
    }
    const result = computeMonthlyPL([mockAllocation()], overhead, 1000)

    expect(result.overhead_salaries).toBe(3000)
    expect(result.overhead_rent).toBe(2000)
    expect(result.overhead_transport).toBe(1000)
    expect(result.overhead_utilities).toBe(700)   // كهرباء + مياه
    expect(result.overhead_other).toBe(300)        // صيانة
    expect(result.total_overhead).toBe(7000)
  })

  it('قائمة دخل فارغة — كل القيم صفر', () => {
    const result = computeMonthlyPL([], {}, 0)
    expect(result.total_revenue).toBe(0)
    expect(result.gross_profit).toBe(0)
    expect(result.net_profit).toBe(0)
    expect(result.gross_margin_pct).toBe(0)
    expect(result.net_margin_pct).toBe(0)
  })

  it('تجميع عدة منتجات', () => {
    const a1 = mockAllocation({ revenue: 600, direct_cost: 400, waste_cost: 30, gross_profit: 170, net_profit: 70, allocated_overhead: 100 })
    const a2 = mockAllocation({ product_id: 'p2', revenue: 400, direct_cost: 250, waste_cost: 20, gross_profit: 130, net_profit: 30, allocated_overhead: 100 })
    const result = computeMonthlyPL([a1, a2], {}, 1000)

    expect(result.total_purchase_cost).toBe(650)   // 400 + 250
    expect(result.total_waste_cost).toBe(50)        // 30 + 20
    expect(result.gross_profit).toBe(300)           // 170 + 130
    expect(result.net_profit).toBe(100)             // 70 + 30
  })

  it('إيراد صفري — هوامش النسبة المئوية 0%', () => {
    const result = computeMonthlyPL([mockAllocation()], {}, 0)
    expect(result.gross_margin_pct).toBe(0)
    expect(result.net_margin_pct).toBe(0)
  })

  it('خسارة صافية — net_profit سالب وnet_margin_pct سالب', () => {
    // gross=200, overhead=500 → net=-300, على إيراد 1000 → margin=-30%
    const alloc = mockAllocation({
      revenue: 1000,
      gross_profit: 200,
      net_profit: -300,
    })
    const result = computeMonthlyPL([alloc], { 'رواتب': 500 }, 1000)
    expect(result.net_profit).toBe(-300)
    expect(result.net_margin_pct).toBe(-30)
  })

  it('خسارة إجمالية — gross_profit سالب', () => {
    const alloc = mockAllocation({ gross_profit: -200, net_profit: -500 })
    const result = computeMonthlyPL([alloc], {}, 1000)
    expect(result.gross_profit).toBe(-200)
    expect(result.gross_margin_pct).toBe(-20)        // -200 / 1000 * 100
  })

  it('منتج واحد — الأرقام تنتقل مباشرة', () => {
    const alloc = mockAllocation({
      revenue: 800,
      direct_cost: 500,
      waste_cost: 40,
      gross_profit: 260,
      net_profit: 160,
      allocated_overhead: 100,
    })
    const result = computeMonthlyPL([alloc], {}, 800)

    expect(result.total_revenue).toBe(800)
    expect(result.total_purchase_cost).toBe(500)
    expect(result.total_waste_cost).toBe(40)
    expect(result.gross_profit).toBe(260)
    expect(result.net_profit).toBe(160)
    expect(result.gross_margin_pct).toBeCloseTo(32.5)  // 260/800*100
    expect(result.net_margin_pct).toBe(20)             // 160/800*100
  })

  it('فئات overhead بدون تطابق — كلها تنتهي في other', () => {
    const overhead = { 'مصاريف متنوعة': 400, 'تأمين': 200 }
    const result = computeMonthlyPL([mockAllocation()], overhead, 1000)

    expect(result.overhead_salaries).toBe(0)
    expect(result.overhead_rent).toBe(0)
    expect(result.overhead_transport).toBe(0)
    expect(result.overhead_utilities).toBe(0)
    expect(result.overhead_other).toBe(600)
    expect(result.total_overhead).toBe(600)
  })

  it('تكلفة overhead صفرية — كل فئات overhead صفر', () => {
    const result = computeMonthlyPL([mockAllocation()], {}, 1000)
    expect(result.overhead_salaries).toBe(0)
    expect(result.overhead_rent).toBe(0)
    expect(result.overhead_transport).toBe(0)
    expect(result.overhead_utilities).toBe(0)
    expect(result.overhead_other).toBe(0)
    expect(result.total_overhead).toBe(0)
  })

  it('gross_margin_pct و net_margin_pct محسوبة بشكل صحيح', () => {
    const alloc = mockAllocation({ gross_profit: 300, net_profit: 150 })
    const result = computeMonthlyPL([alloc], {}, 1500)

    expect(result.gross_margin_pct).toBe(20)   // 300/1500*100
    expect(result.net_margin_pct).toBe(10)     // 150/1500*100
  })
})
