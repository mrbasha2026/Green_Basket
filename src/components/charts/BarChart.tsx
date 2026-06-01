import {
  BarChart as ReBarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatNumber } from '@/lib/utils'

const TOOLTIP_STYLE = {
  direction: 'rtl' as const,
  fontFamily: 'Noto Sans Arabic, sans-serif',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  padding: '8px 12px',
}

interface BarChartProps {
  data: Record<string, unknown>[]
  bars: { dataKey: string; name: string; color: string }[]
  xAxisKey: string
  height?: number
  layout?: 'horizontal' | 'vertical'
}

export function BarChart({ data, bars, xAxisKey, height = 300, layout = 'horizontal' }: BarChartProps) {
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
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.15)" />
        {layout === 'horizontal' ? (
          <>
            <XAxis
              dataKey={xAxisKey}
              tick={{ fontSize: 11, fill: '#64748b' }}
              angle={-25}
              textAnchor="end"
              interval={0}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => formatNumber(v as number)}
              tick={{ fontSize: 11, fill: '#64748b' }}
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
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey={xAxisKey}
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
              width={110}
            />
          </>
        )}
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => formatNumber(v as number)}
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: 'rgba(100,116,139,0.06)' }}
        />
        <Legend
          wrapperStyle={{ direction: 'rtl', fontSize: 13, paddingTop: 8 }}
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
