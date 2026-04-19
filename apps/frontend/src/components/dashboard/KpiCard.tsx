import { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  trend?: number; // percentage
  format?: 'currency' | 'number' | 'percent';
}

export function KpiCard({ title, value, icon, trend, format = 'number' }: KpiCardProps) {
  const formattedValue = format === 'currency' 
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value))
    : format === 'percent' 
      ? `${Number(value).toFixed(2)}%`
      : value;

  return (
    <div className="bg-card border border-border p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
      <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors"></div>
      
      <div className="flex justify-between items-start mb-4 relative z-10">
        <h3 className="text-muted-foreground text-sm font-medium">{title}</h3>
        {icon && <div className="text-primary/70">{icon}</div>}
      </div>
      
      <div className="flex items-baseline space-x-2 relative z-10">
        <span className="text-3xl font-bold text-foreground">{formattedValue}</span>
      </div>

      {trend !== undefined && (
        <div className="mt-4 flex items-center text-sm relative z-10">
          <span
            className={`flex items-center font-medium ${
              trend > 0 ? 'text-primary' : trend < 0 ? 'text-destructive' : 'text-muted-foreground'
            }`}
          >
            {trend > 0 ? <TrendingUp size={16} className="mr-1" /> : trend < 0 ? <TrendingDown size={16} className="mr-1" /> : <Minus size={16} className="mr-1" />}
            {Math.abs(trend)}%
          </span>
          <span className="text-muted-foreground ml-2 text-xs">vs. mês anterior</span>
        </div>
      )}
    </div>
  );
}
