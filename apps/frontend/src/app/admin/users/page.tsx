'use client';

import { getUsersApiUrl } from '@/lib/api-url';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Cookies from 'js-cookie';
import { Plus, Shield, Trash2, User } from 'lucide-react';


const decodeToken = (token: string) => {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearingUserId, setClearingUserId] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'USER',
    active: true,
  });

  const token = Cookies.get('token') || '';
  const currentUser = useMemo(() => decodeToken(token), [token]);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }

    if (currentUser?.role !== 'ADMIN') {
      router.push('/dashboards');
      return;
    }

    const fetchUsers = async () => {
      try {
        const response = await axios.get(getUsersApiUrl(), {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUsers(response.data.users || []);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Não foi possível carregar os usuários.');
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [token, currentUser, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const response = await axios.post(getUsersApiUrl(), form, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setUsers((prev) => [...prev, response.data.user].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      setForm({
        name: '',
        email: '',
        password: '',
        role: 'USER',
        active: true,
      });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Não foi possível criar o usuário.');
    } finally {
      setSaving(false);
    }
  };

  const handleClearDashboardData = async (user: any) => {
    const confirmed = window.confirm(`Deseja limpar os dados do dashboard do usuário ${user.name}? Essa ação remove transações, unidades e categorias desse usuário.`);
    if (!confirmed) return;

    setClearingUserId(user.id);
    setError('');

    try {
      await axios.post(`${getUsersApiUrl()}/${user.id}/clear-dashboard-data`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Não foi possível limpar os dados do dashboard.');
    } finally {
      setClearingUserId('');
    }
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">Carregando usuários...</div>;
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-6 xl:grid-cols-[420px,1fr]">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-6 space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              <Plus size={14} />
              Novo Usuário
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Cadastro administrativo</h1>
            <p className="text-sm text-muted-foreground">
              Crie usuários com perfil `USER` ou `ADMIN`. O controle de acesso é validado no backend.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Nome</label>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="Nome completo"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">E-mail / Login</label>
              <input
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="usuario@empresa.com"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Senha</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="Defina uma senha forte"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Perfil</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="USER">Usuário</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Status</label>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, active: !prev.active }))}
                  className={`w-full rounded-xl border px-4 py-3 text-sm font-medium transition ${
                    form.active
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground'
                  }`}
                >
                  {form.active ? 'Ativo' : 'Inativo'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-70"
            >
              <Plus size={16} />
              {saving ? 'Criando usuário...' : 'Criar usuário'}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Usuários cadastrados</h2>
              <p className="text-sm text-muted-foreground">Visão administrativa dos perfis criados no sistema.</p>
            </div>
            <div className="rounded-xl border border-border bg-background px-4 py-2 text-sm text-muted-foreground">
              {users.length} usuário(s)
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Usuário', 'E-mail', 'Perfil', 'Status', 'Criado em', 'Ações'].map((header) => (
                    <th key={header} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-border/60">
                    <td className="px-3 py-4 font-medium text-foreground">{user.name}</td>
                    <td className="px-3 py-4 text-muted-foreground">{user.email}</td>
                    <td className="px-3 py-4">
                      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                        user.role === 'ADMIN'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-secondary text-secondary-foreground'
                      }`}>
                        {user.role === 'ADMIN' ? <Shield size={12} /> : <User size={12} />}
                        {user.role}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        user.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-500/10 text-zinc-400'
                      }`}>
                        {user.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-muted-foreground">
                      {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(user.createdAt))}
                    </td>
                    <td className="px-3 py-4">
                      <button
                        onClick={() => handleClearDashboardData(user)}
                        disabled={clearingUserId === user.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive transition hover:bg-destructive/15 disabled:opacity-60"
                      >
                        <Trash2 size={14} />
                        {clearingUserId === user.id ? 'Limpando...' : 'Limpar dados'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
