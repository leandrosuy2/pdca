'use client';

import { KpiCard } from './KpiCard';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LabelList } from 'recharts';
import { DollarSign, ArrowUpRight, ArrowDownRight, Users, Briefcase } from 'lucide-react';

export function OverviewTab({ data }: { data: any }) {
  if (!data || !data.kpis) return null;

  const { kpis, chartData, ranking } = data;
  const formatCompactCurrency = (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `R$${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
    if (abs >= 1_000) return `R$${(value / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };
  const renderTopLabel = (color: string) => ({ x = 0, y = 0, width = 0, value = 0 }: any) => (
    <text
      x={x + width / 2}
      y={y - 8}
      fill={color}
      fontSize={10}
      fontWeight={700}
      textAnchor="middle"
      stroke="hsl(var(--card))"
      strokeWidth={3}
      paintOrder="stroke"
    >
      {formatCompactCurrency(Number(value) || 0)}
    </text>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard 
          title="Receita Total" 
          value={kpis.receitaTotal} 
          format="currency" 
          icon={<ArrowUpRight />} 
          trend={12.5} 
        />
        <KpiCard 
          title="Despesa Total" 
          value={kpis.despesaTotal} 
          format="currency" 
          icon={<ArrowDownRight />} 
          trend={-2.4} 
        />
        <KpiCard 
          title="Lucro Líquido" 
          value={kpis.lucro} 
          format="currency" 
          icon={<DollarSign />} 
          trend={18.2} 
        />
        <KpiCard 
          title="FOPAG" 
          value={kpis.fopag} 
          format="currency" 
          icon={<Briefcase />} 
        />
        <KpiCard 
          title="Funcionários" 
          value={kpis.funcionarios} 
          format="number" 
          icon={<Users />} 
          trend={5.0} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-6">Receita vs. Despesa (6 Meses)</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" tick={{fill: 'hsl(var(--muted-foreground))'}} />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{fill: 'hsl(var(--muted-foreground))'}} tickFormatter={(val) => `R$${(val/1000).toFixed(0)}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '0.5rem', color: 'hsl(var(--foreground))' }}
                  itemStyle={{color: 'hsl(var(--foreground))'}}
                  formatter={(value: any) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }}/>
                <Bar dataKey="receita" name="Receita" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="receita" content={renderTopLabel('hsl(var(--primary))')} />
                </Bar>
                <Bar dataKey="despesa" name="Despesa" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="despesa" content={renderTopLabel('hsl(var(--destructive))')} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col">
          <h3 className="text-lg font-semibold mb-6">Ranking de Unidades (Receita)</h3>
          <div className="space-y-6 flex-1">
            {ranking.map((item: any, index: number) => (
              <div key={index} className="flex flex-col gap-2 relative">
                <div className="flex justify-between items-center z-10 w-full">
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-sm font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value)}</span>
                </div>
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all duration-1000"
                    style={{ width: `${(item.value / ranking[0].value) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
