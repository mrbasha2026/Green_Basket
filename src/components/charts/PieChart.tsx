import {
  PieChart as RePieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatNumber } from '@/lib/utils'

const COLORS = ['#16a34a', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

const TOOLTIP_STYLE = {
  direction: 'rtl' as const,
  fontFamily: 'Noto Sans Arabic, sans-serif',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  padding: '8px 12px',
}

interface PieChartProps {
  data: { name: string; value: number }[]
  height?: number
}

export function PieChart({ data, height = 300 }: PieChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RePieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          outerRadius={90}
          innerRadius={40}
          dataKey="value"
          paddingAngle={2}
        >
          {data.map((_entry, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} stroke="none" />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: unknown, name: unknown) => [
            `${formatNumber(v as number)} (${total > 0 ? ((v as number / total) * 100).toFixed(1) : 0}%)`,
            name,
          ]}
          contentStyle={TOOLTIP_STYLE}
        />
        <Legend
          wrapperStyle={{ direction: 'rtl', fontSize: 12, paddingTop: 8 }}
          iconType="circle"
          iconSize={8}
          formatter={(value) => <span style={{ color: '#64748b' }}>{value}</span>}
        />
      </RePieChart>
    </ResponsiveContainer>
  )
}
