import {
  LineChart as ReLineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatNumber } from '@/lib/utils'

interface LineChartProps {
  data: Record<string, unknown>[]
  lines: { dataKey: string; name: string; color: string }[]
  xAxisKey: string
  height?: number
}

export function LineChart({ data, lines, xAxisKey, height = 300 }: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ReLineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey={xAxisKey} tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={(v) => formatNumber(v as number)} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(v: unknown) => formatNumber(v as number)}
          contentStyle={{ direction: 'rtl', fontFamily: 'Noto Sans Arabic, sans-serif' }}
        />
        <Legend wrapperStyle={{ direction: 'rtl' }} />
        {lines.map(({ dataKey, name, color }) => (
          <Line
            key={dataKey}
            type="monotone"
            dataKey={dataKey}
            name={name}
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </ReLineChart>
    </ResponsiveContainer>
  )
}
