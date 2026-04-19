'use client';

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

export function TrendsTab({ data }: { data: any }) {
  if (!data || !data.trends) return null;

  const { trends } = data;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-6">Tendência de Receita vs. Despesa (Acumulado)</h3>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trends} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorDesp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={(val) => `R$${(val/1000).toFixed(0)}k`} stroke="hsl(var(--muted-foreground))" />
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <Tooltip 
                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '0.5rem' }}
                formatter={(value: any) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
              />
              <Legend verticalAlign="top" height={36} />
              <Area type="monotone" dataKey="receitaAcumulada" name="Receita Acumulada" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorRec)" />
              <Area type="monotone" dataKey="despesaAcumulada" name="Despesa Acumulada" stroke="hsl(var(--destructive))" fillOpacity={1} fill="url(#colorDesp)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
