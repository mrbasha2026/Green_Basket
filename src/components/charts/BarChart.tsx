import {
  BarChart as ReBarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatNumber, getChartStyle } from '@/lib/utils'

interface BarChartProps {
  data: Record<string, unknown>[]
  bars: { dataKey: string; name: string; color: string }[]
  xAxisKey: string
  height?: number
  layout?: 'horizontal' | 'vertical'
}

export function BarChart({ data, bars, xAxisKey, height = 300, layout = 'horizontal' }: BarChartProps) {
  const cs = getChartStyle()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ReBarChart
        data={data}
        layout={layout}
        margin={layout === 'vertical'
          ? { top: 5, right: 20, left: 10, bottom: 5 }
          : { top: 10, right: 10, left: 10, bottom: 45 }
        }
      >
        <CartesianGrid strokeDasharray="3 3" stroke={cs.gridStroke} />
        {layout === 'horizontal' ? (
          <>
            <XAxis
              dataKey={xAxisKey}
              tick={{ fontSize: 11, fill: cs.tickColor }}
              angle={-25}
              textAnchor="end"
              interval={0}
              axisLine={{ stroke: cs.gridStroke }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => formatNumber(v as number)}
              tick={{ fontSize: 11, fill: cs.tickColor }}
              axisLine={false}
              tickLine={false}
              width={70}
            />
          </>
        ) : (
          <>
            <XAxis
              type="number"
              tickFormatter={(v) => formatNumber(v as number)}
              tick={{ fontSize: 11, fill: cs.tickColor }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey={xAxisKey}
              tick={{ fontSize: 11, fill: cs.tickColor }}
              axisLine={{ stroke: cs.gridStroke }}
              tickLine={false}
              width={110}
            />
          </>
        )}
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => formatNumber(v as number)}
          contentStyle={cs.tooltipStyle}
          cursor={{ fill: 'rgba(100,116,139,0.06)' }}
        />
        <Legend
          wrapperStyle={{ direction: 'rtl', fontSize: 13, paddingTop: 8, color: cs.tickColor }}
          iconType="circle"
          iconSize={8}
        />
        {bars.map(({ dataKey, name, color }) => (
          <Bar key={dataKey} dataKey={dataKey} name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={48} />
        ))}
      </ReBarChart>
    </ResponsiveContainer>
  )
}
