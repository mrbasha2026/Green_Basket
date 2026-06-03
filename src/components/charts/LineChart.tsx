import {
  LineChart as ReLineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatNumber, getChartStyle } from '@/lib/utils'

interface LineChartProps {
  data: Record<string, unknown>[]
  lines: { dataKey: string; name: string; color: string }[]
  xAxisKey: string
  height?: number
}

export function LineChart({ data, lines, xAxisKey, height = 300 }: LineChartProps) {
  const cs = getChartStyle()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ReLineChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={cs.gridStroke} />
        <XAxis
          dataKey={xAxisKey}
          tick={{ fontSize: 11, fill: cs.tickColor }}
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
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => formatNumber(v as number)}
          contentStyle={cs.tooltipStyle}
          cursor={{ stroke: 'rgba(100,116,139,0.2)', strokeWidth: 1 }}
        />
        <Legend
          wrapperStyle={{ direction: 'rtl', fontSize: 13, paddingTop: 8, color: cs.tickColor }}
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
