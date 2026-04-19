'use client';

import { Users, CreditCard } from 'lucide-react';

export function PeopleTab({ data }: { data: any }) {
  if (!data || !data.people) return null;

  const { people, totalFopag } = data;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-card border border-border p-6 rounded-xl flex items-center justify-between shadow-sm">
           <div>
             <h4 className="text-muted-foreground text-sm font-medium">Total de Funcionários</h4>
             <p className="text-3xl font-bold text-foreground mt-2">{people.reduce((a: any,b: any)=>a+b.funcionarios,0)}</p>
           </div>
           <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center text-primary">
             <Users size={24} />
           </div>
        </div>
        <div className="bg-card border border-border p-6 rounded-xl flex items-center justify-between shadow-sm">
           <div>
             <h4 className="text-muted-foreground text-sm font-medium">FOPAG Total</h4>
             <p className="text-3xl font-bold text-foreground mt-2">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalFopag)}</p>
           </div>
           <div className="h-12 w-12 rounded-full bg-destructive/20 flex items-center justify-center text-destructive">
             <CreditCard size={24} />
           </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="p-4 font-medium text-sm text-muted-foreground">Unidade</th>
              <th className="p-4 font-medium text-sm text-muted-foreground text-right">Funcionários</th>
              <th className="p-4 font-medium text-sm text-muted-foreground text-right">FOPAG</th>
              <th className="p-4 font-medium text-sm text-muted-foreground text-right">FOPAG por Funcionário</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p: any, idx: number) => (
              <tr key={idx} className="border-b border-border hover:bg-muted/30 transition-colors">
                <td className="p-4 font-medium">{p.unidade}</td>
                <td className="p-4 text-right">{p.funcionarios}</td>
                <td className="p-4 text-right text-destructive">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.fopag)}
                </td>
                <td className="p-4 text-right text-muted-foreground">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.funcionarios > 0 ? p.fopag / p.funcionarios : 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
