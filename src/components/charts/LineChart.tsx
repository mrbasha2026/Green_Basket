import {
  LineChart as ReLineChart, Line, XAxis, YAxis, CartesianGrid,
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

interface LineChartProps {
  data: Record<string, unknown>[]
  lines: { dataKey: string; name: string; color: string }[]
  xAxisKey: string
  height?: number
}

export function LineChart({ data, lines, xAxisKey, height = 300 }: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ReLineChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.15)" />
        <XAxis
          dataKey={xAxisKey}
          tick={{ fontSize: 11, fill: '#64748b' }}
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
        <Tooltip
          formatter={(v: unknown, name: unknown) => [formatNumber(v as number), name]}
          contentStyle={TOOLTIP_STYLE}
          cursor={{ stroke: 'rgba(100,116,139,0.2)', strokeWidth: 1 }}
        />
        <Legend
          wrapperStyle={{ direction: 'rtl', fontSize: 13, paddingTop: 8 }}
          iconType="circle"
          iconSize={8}
        />
        {lines.map(({ dataKey, name, color }) => (
          <Line
            key={dataKey}
            type="monotone"
            dataKey={dataKey}
            name={name}
            stroke={color}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        ))}
      </ReLineChart>
    </ResponsiveContainer>
  )
}
