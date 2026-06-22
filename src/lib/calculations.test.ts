import { describe, it, expect } from 'vitest'
import {
  calcWeightedAvgCost,
  calcCostPerKg,
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
})

// ── computeProductAllocation ──────────────────────────────────────────────────

describe('computeProductAllocation', () => {
  it('إيراد صفري — نسب الإيراد 0%', () => {
    // revenue=0 → revenue_share_pct=0, contribution_margin_pct=0
    // لكن full_cost_per_kg يعتمد على qtySoldKg لا على revenue
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
    expect(result.revenue_share_pct).toBe(50)              // 500/1000 * 100
    expect(result.gross_profit).toBe(150)                  // 500 - 300 - 50
    expect(result.net_profit).toBe(50)                     // 500 - (300 + 50 + 100)
    expect(result.total_full_cost).toBe(450)               // 300 + 50 + 100
    expect(result.full_cost_per_kg).toBeCloseTo(4.5)       // 450 / 100
    expect(result.breakeven_price_kg).toBeCloseTo(4.5)
    expect(result.contribution_margin).toBe(200)           // 500 - 300
    expect(result.contribution_margin_pct).toBe(40)        // 200/500 * 100
  })

  it('إيراد يساوي إجمالي الإيراد — نسبة 100%', () => {
    const result = computeProductAllocation('p2', 1000, 1000, 0, 600, 0, 200)
    expect(result.revenue_share_pct).toBe(100)
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

    expect(result.total_purchase_cost).toBe(650)    // 400 + 250
    expect(result.total_waste_cost).toBe(50)         // 30 + 20
    expect(result.gross_profit).toBe(300)            // 170 + 130
    expect(result.net_profit).toBe(100)              // 70 + 30
  })

  it('إيراد صفري — هوامش النسبة المئوية 0%', () => {
    const result = computeMonthlyPL([mockAllocation()], {}, 0)
    expect(result.gross_margin_pct).toBe(0)
    expect(result.net_margin_pct).toBe(0)
  })
})
