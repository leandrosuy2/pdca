const { PrismaClient } = require('./node_modules/@prisma/client');
const p = new PrismaClient();

function norm(v){
  return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
}

(async () => {
  const users = await p.user.findMany({ select: { id:true, name:true, email:true } });
  for (const u of users) {
    const trans = await p.transacao.findMany({
      where: { userId: u.id },
      include: { categoria: true, unidade: true },
      orderBy: { date: 'asc' }
    });

    const byMonthUnit = new Map();
    for (const t of trans) {
      if (!Number.isFinite(t.qtdFunc) || t.qtdFunc == null || t.qtdFunc < 0) continue;
      const m = t.date.toISOString().slice(0,7);
      if (!byMonthUnit.has(m)) byMonthUnit.set(m, new Map());
      const unitMap = byMonthUnit.get(m);
      const prev = unitMap.get(t.unidadeId) || 0;
      unitMap.set(t.unidadeId, Math.max(prev, t.qtdFunc));
    }

    const months = Array.from(byMonthUnit.keys()).sort();
    const latest = months[months.length-1];
    const prev = months[months.length-2];
    const totalLatest = latest ? Array.from(byMonthUnit.get(latest).values()).reduce((a,b)=>a+b,0) : 0;
    const totalPrev = prev ? Array.from(byMonthUnit.get(prev).values()).reduce((a,b)=>a+b,0) : 0;

    const folha = trans
      .filter(t => t.type === 'DESPESA' && ['PROVENTOS','ENCARGOS FOLHA'].includes(norm(t.categoria?.name)))
      .reduce((a,b)=>a+b.amount,0);

    const catTop = Object.entries(trans.reduce((acc,t)=>{
      if(t.type!=='DESPESA') return acc;
      const k = t.categoria?.name || 'SEM';
      acc[k]=(acc[k]||0)+t.amount;
      return acc;
    },{})).sort((a,b)=>b[1]-a[1]).slice(0,8);

    console.log('\nUSER', u.name, u.id);
    console.log('transacoes', trans.length, 'monthsQtdFunc', months.length, 'latest', latest, 'prev', prev, 'totalLatest', totalLatest, 'totalPrev', totalPrev, 'var', totalLatest-totalPrev);
    console.log('folha(categoria)', folha);
    console.log('top categorias despesa', catTop);
  }
})().finally(()=>p.$disconnect());
