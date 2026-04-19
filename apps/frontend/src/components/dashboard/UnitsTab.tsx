'use client';

import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip } from 'recharts';
import { Target } from 'lucide-react';

export function UnitsTab({ data }: { data: any }) {
  if (!data || !data.units) return null;

  const { units } = data;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-6">Comparativo de Unidades</h3>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={units}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="unit" stroke="hsl(var(--muted-foreground))" tick={{fill: 'hsl(var(--foreground))', fontSize: 12}} />
                <PolarRadiusAxis angle={30} domain={[0, 'auto']} stroke="hsl(var(--muted-foreground))" />
                <Radar name="Receita" dataKey="receita" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.6} />
                <Radar name="Despesa" dataKey="despesa" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.6} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '0.5rem' }}
                  formatter={(value: any) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {units.map((unit: any, idx: number) => (
             <div key={idx} className="bg-card border border-border hover:border-primary/50 cursor-pointer rounded-xl p-5 shadow-sm transition-all group flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Target size={24} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg">{unit.unit}</h4>
                    <p className="text-sm text-muted-foreground whitespace-nowrap">Margem: <span className={unit.margem > 0 ? 'text-primary' : 'text-destructive'}>{unit.margem.toFixed(2)}%</span></p>
                  </div>
                </div>
                
                <div className="text-right">
                   <p className="font-bold text-lg text-foreground">Receita: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(unit.receita)}</p>
                   <p className="text-sm text-destructive">Despesa: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(unit.despesa)}</p>
                </div>
             </div>
          ))}
        </div>
      </div>
      
    </div>
  );
}
