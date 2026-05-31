import {
  BarChart as ReBarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatNumber } from '@/lib/utils'

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
        margin={{ top: 5, right: 30, left: 20, bottom: layout === 'vertical' ? 5 : 40 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        {layout === 'horizontal' ? (
          <>
            <XAxis dataKey={xAxisKey} tick={{ fontSize: 11 }} angle={-20} textAnchor="end" />
            <YAxis tickFormatter={(v) => formatNumber(v as number)} tick={{ fontSize: 11 }} />
          </>
        ) : (
          <>
            <XAxis type="number" tickFormatter={(v) => formatNumber(v as number)} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey={xAxisKey} tick={{ fontSize: 11 }} width={120} />
          </>
        )}
        <Tooltip
          formatter={(v: unknown) => formatNumber(v as number)}
          contentStyle={{ direction: 'rtl', fontFamily: 'Noto Sans Arabic, sans-serif' }}
        />
        <Legend wrapperStyle={{ direction: 'rtl' }} />
        {bars.map(({ dataKey, name, color }) => (
          <Bar key={dataKey} dataKey={dataKey} name={name} fill={color} radius={[4, 4, 0, 0]} />
        ))}
      </ReBarChart>
    </ResponsiveContainer>
  )
}
