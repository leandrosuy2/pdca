'use client';

import { getDashboardApiUrl } from '@/lib/api-url';
import { getDashboardTemplateMeta } from '@/lib/dashboard-templates';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Cookies from 'js-cookie';
import {
  ArrowRight,
  LayoutDashboard,
  Search,
  Shield,
  Star,
  User,
} from 'lucide-react';

const decodeToken = (token: string) => {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
};

type DashboardRow = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  isDefault: boolean;
  template: string;
  owner?: {
    id: string;
    name: string;
    email: string;
    role: string;
    template: string;
  } | null;
};

export default function AdminDashboardsPage() {
  const router = useRouter();
  const [dashboards, setDashboards] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const token = Cookies.get('token') || '';
  const currentUser = useMemo(() => decodeToken(token), [token]);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }

    if (String(currentUser?.role || '').toUpperCase() !== 'ADMIN') {
      router.push('/dashboard');
      return;
    }

    const load = async () => {
      try {
        const response = await axios.get<{ dashboards: DashboardRow[] }>(`${getDashboardApiUrl()}/catalog`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setDashboards(response.data.dashboards || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Nao foi possivel carregar os dashboards.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, currentUser, router]);

  const filteredDashboards = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return dashboards;

    return dashboards.filter((dashboard) =>
      [dashboard.name, dashboard.slug, dashboard.owner?.name, dashboard.owner?.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [dashboards, query]);

  const groups = useMemo(() => {
    const grouped = new Map<
      string,
      {
        ownerId: string;
        ownerName: string;
        ownerEmail: string;
        ownerRole: string;
        dashboards: DashboardRow[];
      }
    >();

    for (const dashboard of filteredDashboards) {
      const ownerId = String(dashboard.owner?.id || 'sem-owner');
      if (!grouped.has(ownerId)) {
        grouped.set(ownerId, {
          ownerId,
          ownerName: dashboard.owner?.name || 'Sem proprietario',
          ownerEmail: dashboard.owner?.email || '—',
          ownerRole: dashboard.owner?.role || 'USER',
          dashboards: [],
        });
      }

      grouped.get(ownerId)!.dashboards.push(dashboard);
    }

    return Array.from(grouped.values()).sort((a, b) => a.ownerName.localeCompare(b.ownerName, 'pt-BR'));
  }, [filteredDashboards]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
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
              <LayoutDashboard size={14} />
              Dashboards dos usuarios
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Visao administrativa de dashboards</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Consulte rapidamente quais dashboards cada usuario possui, com agrupamento por proprietario e acesso direto ao painel correspondente.
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
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nome, slug, proprietario..."
                className="w-full rounded-xl border border-border bg-background px-10 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-background/70 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Dashboards</div>
            <div className="mt-2 text-2xl font-bold text-foreground">{filteredDashboards.length}</div>
          </div>
          <div className="rounded-2xl border border-border bg-background/70 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Usuarios com dashboard</div>
            <div className="mt-2 text-2xl font-bold text-foreground">{groups.length}</div>
          </div>
          <div className="rounded-2xl border border-border bg-background/70 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Dashboards padrao</div>
            <div className="mt-2 text-2xl font-bold text-foreground">
              {filteredDashboards.filter((dashboard) => dashboard.isDefault).length}
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <section className="space-y-6">
        {groups.map((group) => (
          <div key={group.ownerId} className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight text-foreground">{group.ownerName}</h2>
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                      group.ownerRole === 'ADMIN'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-secondary text-secondary-foreground'
                    }`}
                  >
                    {group.ownerRole === 'ADMIN' ? <Shield size={12} /> : <User size={12} />}
                    {group.ownerRole}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{group.ownerEmail}</p>
              </div>

              <div className="rounded-xl border border-border bg-background px-4 py-2 text-sm text-muted-foreground">
                {group.dashboards.length} dashboard(s)
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {group.dashboards.map((dashboard) => {
                const templateMeta = getDashboardTemplateMeta(dashboard.template);

                return (
                  <button
                    key={dashboard.id}
                    onClick={() => router.push(`/dashboard?dashboardId=${dashboard.id}`)}
                    className="group rounded-2xl border border-border bg-background/60 p-5 text-left transition hover:border-primary/40 hover:bg-background"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                            {templateMeta.label}
                          </span>
                          {dashboard.isDefault && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">
                              <Star size={12} />
                              Padrao
                            </span>
                          )}
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-foreground">{dashboard.name}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {dashboard.description || 'Dashboard sem descricao cadastrada.'}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
                    </div>

                    <div className="mt-5 grid gap-2 rounded-xl border border-border/70 bg-card p-4 text-sm">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Slug</span>
                        <span className="font-mono text-xs text-primary">{dashboard.slug}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Modelo</span>
                        <span className="font-medium text-foreground">{templateMeta.label}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Tipo</span>
                        <span className="font-medium text-foreground">
                          {dashboard.isDefault ? 'Principal' : 'Secundario'}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {!groups.length && !error && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          Nenhum dashboard encontrado para os filtros atuais.
        </div>
      )}
    </div>
  );
}
