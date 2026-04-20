'use client';

import { getDashboardApiUrl } from '@/lib/api-url';
import { getDashboardTemplateMeta } from '@/lib/dashboard-templates';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Cookies from 'js-cookie';
import { BarChart3, LayoutGrid, Search, Shield, Sparkles, User, ArrowRight, Users } from 'lucide-react';

const decodeToken = (token: string) => {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
};

const isAdminRole = (role: unknown) => String(role || '').toUpperCase() === 'ADMIN';

export default function DashboardsPage() {
  const router = useRouter();
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const token = Cookies.get('token') || '';
  const currentUser = decodeToken(token);

  useEffect(() => {
    const fetchDashboards = async () => {
      try {
        const currentToken = Cookies.get('token');
        const response = await axios.get(`${getDashboardApiUrl()}/catalog`, {
          headers: { Authorization: `Bearer ${currentToken}` },
        });
        setDashboards(response.data.dashboards || []);
      } catch (error) {
        console.error('Failed to fetch dashboards', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboards();
  }, []);

  const dashboardsFiltrados = useMemo(() => {
    const termo = query.trim().toLowerCase();
    if (!termo) return dashboards;
    return dashboards.filter((dashboard) =>
      [dashboard.name, dashboard.slug, dashboard.owner?.name, dashboard.owner?.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(termo)),
    );
  }, [dashboards, query]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        Carregando dashboards...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-card p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              <LayoutGrid size={14} />
              Acesso aos Dashboards
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Escolha um dashboard para continuar</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Cada conta visualiza apenas os dashboards liberados pelo seu perfil. Administradores enxergam todos; usuarios comuns veem somente os dashboards vinculados.
              </p>
            </div>
          </div>

          <div className="w-full max-w-md">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Buscar dashboard
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nome, slug, proprietario..."
                className="w-full rounded-xl border border-border bg-background px-10 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        </div>

        {isAdminRole(currentUser?.role) && (
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              onClick={() => router.push('/admin/inteligencia')}
              className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-primary/15"
            >
              <Sparkles size={16} />
              Inteligencia global
            </button>
            <button
              onClick={() => router.push('/admin/resumo')}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/50"
            >
              <BarChart3 size={16} />
              Resumo de usuarios
            </button>
            <button
              onClick={() => router.push('/admin/users')}
              className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-primary/15"
            >
              <Users size={16} />
              Gestao de usuarios
            </button>
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {dashboardsFiltrados.map((dashboard) => {
          const templateMeta = getDashboardTemplateMeta(dashboard.template);

          return (
            <button
              key={dashboard.id}
              onClick={() => router.push(`/dashboard?dashboardId=${dashboard.id}`)}
              className="group rounded-2xl border border-border bg-card p-6 text-left transition hover:border-primary/50 hover:bg-card/80"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      {isAdminRole(dashboard.owner?.role) ? <Shield size={12} /> : <User size={12} />}
                      {isAdminRole(dashboard.owner?.role) ? 'Administrador' : 'Usuario'}
                    </div>
                    <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                      {templateMeta.label}
                    </div>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{dashboard.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {dashboard.description || 'Dashboard sem descricao cadastrada.'}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
              </div>

              <div className="mt-6 grid gap-3 rounded-xl border border-border/80 bg-background/60 p-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Proprietario</span>
                  <span className="font-medium text-foreground">{dashboard.owner?.name || '-'}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">E-mail</span>
                  <span className="truncate font-medium text-foreground">{dashboard.owner?.email || '-'}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Slug</span>
                  <span className="font-mono text-xs text-primary">{dashboard.slug}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Modelo</span>
                  <span className="font-medium text-foreground">{templateMeta.label}</span>
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {!dashboardsFiltrados.length && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          Nenhum dashboard encontrado para os filtros atuais.
        </div>
      )}
    </div>
  );
}
