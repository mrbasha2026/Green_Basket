import type { CostAllocationResult, MonthlyPLResult } from '@/types'

export function calcWeightedAvgCost(
  openingStock: number,
  openingCostPerKg: number,
  purchasedWeight: number,
  purchaseCost: number,
  wasteKg: number
): number {
  const totalValue = openingStock * openingCostPerKg + purchaseCost
  const availableStock = openingStock + purchasedWeight - wasteKg
  if (availableStock <= 0) return 0
  return totalValue / availableStock
}

export function calcCostPerKg(
  totalCost: number,
  totalWeight: number,
  wasteKg: number
): number {
  const net = totalWeight - wasteKg
  if (net <= 0) return 0
  return totalCost / net
}

export function computeProductAllocation(
  productId: string,
  revenue: number,
  totalRevenue: number,
  totalOverhead: number,
  directCost: number,
  wasteCost: number,
  qtySoldKg: number
): CostAllocationResult {
  const revenueSharePct = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0
  const allocatedOverhead = (revenueSharePct / 100) * totalOverhead
  const totalFullCost = directCost + wasteCost + allocatedOverhead
  const grossProfit = revenue - directCost - wasteCost
  const netProfit = revenue - totalFullCost
  const fullCostPerKg = qtySoldKg > 0 ? totalFullCost / qtySoldKg : 0
  const breakevenPriceKg = fullCostPerKg
  const contributionMargin = revenue - directCost
  const contributionMarginPct = revenue > 0 ? (contributionMargin / revenue) * 100 : 0

  return {
    product_id: productId,
    revenue,
    revenue_share_pct: revenueSharePct,
    direct_cost: directCost,
    waste_cost: wasteCost,
    allocated_overhead: allocatedOverhead,
    total_full_cost: totalFullCost,
    gross_profit: grossProfit,
    net_profit: netProfit,
    qty_sold_kg: qtySoldKg,
    full_cost_per_kg: fullCostPerKg,
    breakeven_price_kg: breakevenPriceKg,
    contribution_margin: contributionMargin,
    contribution_margin_pct: contributionMarginPct,
  }
}

export function computeMonthlyPL(
  allocations: CostAllocationResult[],
  overheadByCategory: Record<string, number>,
  totalRevenue: number
): MonthlyPLResult {
  const totalPurchaseCost = allocations.reduce((s, r) => s + r.direct_cost, 0)
  const totalWasteCost = allocations.reduce((s, r) => s + r.waste_cost, 0)
  const grossProfit = allocations.reduce((s, r) => s + r.gross_profit, 0)
  const netProfit = allocations.reduce((s, r) => s + r.net_profit, 0)
  const totalOverhead = Object.values(overheadByCategory).reduce((s, v) => s + v, 0)

  const salaries = Object.entries(overheadByCategory)
    .filter(([k]) => k.includes('رواتب'))
    .reduce((s, [, v]) => s + v, 0)
  const rent = Object.entries(overheadByCategory)
    .filter(([k]) => k.includes('إيجار'))
    .reduce((s, [, v]) => s + v, 0)
  const transport = Object.entries(overheadByCategory)
    .filter(([k]) => k.includes('نقل'))
    .reduce((s, [, v]) => s + v, 0)
  const utilities = Object.entries(overheadByCategory)
    .filter(([k]) => k.includes('كهرباء') || k.includes('مياه'))
    .reduce((s, [, v]) => s + v, 0)
  const other = totalOverhead - salaries - rent - transport - utilities

  return {
    total_revenue: totalRevenue,
    total_purchase_cost: totalPurchaseCost,
    total_waste_cost: totalWasteCost,
    gross_profit: grossProfit,
    gross_margin_pct: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
    overhead_salaries: salaries,
    overhead_rent: rent,
    overhead_transport: transport,
    overhead_utilities: utilities,
    overhead_other: other,
    total_overhead: totalOverhead,
    net_profit: netProfit,
    net_margin_pct: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
  }
}
