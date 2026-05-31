import {
  PieChart as RePieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatNumber } from '@/lib/utils'

const COLORS = ['#16a34a', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']

interface PieChartProps {
  data: { name: string; value: number }[]
  height?: number
}

export function PieChart({ data, height = 300 }: PieChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RePieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={100}
          dataKey="value"
          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((_entry, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: unknown) => formatNumber(v as number)}
          contentStyle={{ direction: 'rtl', fontFamily: 'Noto Sans Arabic, sans-serif' }}
        />
        <Legend wrapperStyle={{ direction: 'rtl' }} />
      </RePieChart>
    </ResponsiveContainer>
  )
}
