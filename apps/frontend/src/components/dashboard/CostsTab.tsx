'use client';

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { CreditCard } from 'lucide-react';

const COLORS = ['hsl(var(--destructive))', 'hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--muted-foreground))', 'hsl(var(--foreground))'];

export function CostsTab({ data }: { data: any }) {
  if (!data || !data.despesas) return null;

  const { despesas, total } = data;
  
  // Format for Recharts
  const pieData = despesas.slice(0, 5).map((d: any) => ({ name: d.name, value: d.value }));
  if (despesas.length > 5) {
     pieData.push({ 
        name: 'Outros', 
        value: despesas.slice(5).reduce((acc: number, curr: any) => acc + curr.value, 0)
     });
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-2">Composição de Custos</h3>
          <p className="text-sm text-muted-foreground mb-6">Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}</p>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '0.5rem' }}
                  formatter={(value: any) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <CreditCard size={20} className="text-destructive" /> Detalhamento
          </h3>
          <div className="space-y-6 overflow-y-auto pr-2 max-h-[300px] custom-scrollbar">
            {despesas.map((item: any, index: number) => (
              <div key={index} className="flex flex-col gap-2 relative">
                <div className="flex justify-between items-center z-10 w-full">
                  <span className="text-sm font-medium">{item.name}</span>
                  <div className="text-right">
                    <span className="text-sm font-bold block">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value)}</span>
                    <span className="text-xs text-muted-foreground">{((item.value / total) * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-destructive rounded-full"
                    style={{ width: `${(item.value / despesas[0].value) * 100}%` }}
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
