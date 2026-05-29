import { isPlaceholderProject } from "../../services/ProjectContextService";

export { isPlaceholderProject };

export function formatProjectsList(
  projects: Array<{ id?: number; project_id?: number; name?: string; stats?: { requests?: number }; active_buffs?: number; [key: string]: unknown }>,
  _count: number
): string {
  const real = projects.filter((p) => !isPlaceholderProject(p));
  if (real.length === 0) {
    return "You have no projects yet. Create one with **AgentStack: Create project and get API key** or ask me to create a project.";
  }
  const lines = real.map((p, i) => {
    const id = p.project_id ?? p.id ?? "—";
    const name = p.name ?? "Unnamed";
    const stats = p.stats as { requests?: number } | undefined;
    const requests = stats?.requests ?? (p as { requests?: number }).requests ?? "—";
    const buffs = (p as { active_buffs?: number }).active_buffs ?? (stats as { active_buffs?: number } | undefined)?.active_buffs ?? 0;
    return `${i + 1}. **${name}** — ID: ${id}, ${requests} requests, ${buffs} active buff(s).`;
  });
  return `You have ${real.length} project(s):\n\n${lines.join("\n")}`;
}

export function formatProjectStats(
  projectId: number,
  projectName: string | undefined,
  stats: { requests?: number; active_buffs?: number; users?: number; [key: string]: unknown }
): string {
  const requests = typeof stats.requests === "number" ? stats.requests : "—";
  const buffs = typeof stats.active_buffs === "number" ? stats.active_buffs : 0;
  const users = typeof stats.users === "number" ? stats.users : "—";
  const name = projectName ? `**${projectName}**` : `Project ${projectId}`;
  return `${name} (ID: ${projectId})\n\n- Requests: ${requests}\n- Active buffs: ${buffs}\n- Users: ${users}`;
}

export function formatProjectUsers(
  projectId: number,
  users: Array<{ user_id?: number; id?: number; email?: string; role?: string; [key: string]: unknown }>,
  count: number
): string {
  if (users.length === 0) return `No users in project ${projectId}. Add users via the project dashboard or API.`;
  const lines = users.map((u, i) => {
    const id = u.user_id ?? u.id ?? "—";
    const email = u.email ?? "—";
    const role = u.role ?? "—";
    return `${i + 1}. ${email} — ID: ${id}, role: ${role}`;
  });
  return `Project ${projectId} — ${count} user(s):\n\n${lines.join("\n")}`;
}

export function formatProfile(profile: {
  user_id?: number;
  email?: string;
  username?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  [key: string]: unknown;
}): string {
  const id = profile.user_id ?? "—";
  const email = profile.email ?? "—";
  const displayName = profile.display_name?.trim() || undefined;
  const first = profile.first_name?.trim() || undefined;
  const last = profile.last_name?.trim() || undefined;
  const username = profile.username?.trim() || undefined;
  const name = displayName || [first, last].filter(Boolean).join(" ") || username || "—";
  const role = profile.role ?? "—";
  return `**Profile** (from ecosystem):\n\n**ID:** ${id}\n**Email:** ${email}\n**Name:** ${name}\n**Role:** ${role}`;
}

export function formatBuffsList(
  buffs: Array<{ buff_id?: string; name?: string; state?: string; expires_at?: string; category?: string; [key: string]: unknown }>,
  entityKind: string,
  entityId: number
): string {
  if (buffs.length === 0) {
    return `No active buffs for ${entityKind} ${entityId}. Use Chat to apply buffs or create them in the dashboard.`;
  }
  const lines = buffs.map((b, i) => {
    const id = b.buff_id ?? "—";
    const name = b.name ?? "Unnamed";
    const state = b.state ?? "—";
    const expires = b.expires_at ?? "—";
    const cat = b.category ?? "";
    return `${i + 1}. **${name}** — ID: ${id}, state: ${state}${cat ? `, category: ${cat}` : ""}, expires: ${expires}`;
  });
  return `Active buffs for ${entityKind} ${entityId} (${buffs.length}):\n\n${lines.join("\n")}`;
}

export function formatBalance(
  balance: number | undefined,
  currency: string | undefined,
  projectId: number | undefined,
  updatedAt: string | undefined
): string {
  const b = typeof balance === "number" ? balance : 0;
  const c = currency ?? "USD";
  const proj = projectId !== undefined ? ` (project ${projectId})` : "";
  const updated = updatedAt ? ` — updated ${updatedAt}` : "";
  return `**Ecosystem wallet balance**${proj} (real money): **${b} ${c}**${updated}`;
}

export function formatProjectCurrencies(
  assets: Array<{ id?: string; name?: string; type?: string; price_usdt?: string; [key: string]: unknown }>,
  total: number
): string {
  if (assets.length === 0) return "No project currencies defined.";
  const lines = assets.map((a, i) => {
    const id = a.id ?? "—";
    const name = a.name ?? "Unnamed";
    const price = a.price_usdt ?? "—";
    return `${i + 1}. **${name}** — ID: ${id}, price: ${price} USDT`;
  });
  return `**Project currencies** — ${total} item(s):\n\n${lines.join("\n")}`;
}

export function formatRulesList(
  rules: Array<{ id?: string; name?: string; enabled?: boolean; priority?: number; [key: string]: unknown }>,
  count: number
): string {
  if (rules.length === 0) return "No rules in this project.";
  const lines = rules.map((r, i) => {
    const id = r.id ?? "—";
    const name = r.name ?? "Unnamed";
    const enabled = r.enabled === true ? "enabled" : "disabled";
    return `${i + 1}. **${name}** — ID: ${id}, ${enabled}, priority: ${r.priority ?? "—"}`;
  });
  return `Project has ${count} rule(s):\n\n${lines.join("\n")}`;
}

export function formatProjectDetails(project: {
  id?: number;
  project_id?: number;
  name?: string;
  description?: string;
  is_active?: boolean;
  created_at?: string;
  [key: string]: unknown;
}): string {
  const id = project.project_id ?? project.id ?? "—";
  const name = project.name ?? "Unnamed";
  const desc = project.description ? `\n${project.description}` : "";
  const active = project.is_active !== false ? "active" : "inactive";
  const created = project.created_at ? `\nCreated: ${project.created_at}` : "";
  return `**${name}** (ID: ${id}) — ${active}${desc}${created}`;
}

export function formatAssetsList(
  assets: Array<{ id?: string; name?: string; type?: string; price_usdt?: string; [key: string]: unknown }>,
  total: number
): string {
  if (assets.length === 0) return "No assets in this project.";
  const lines = assets.map((a, i) => {
    const id = a.id ?? "—";
    const name = a.name ?? "Unnamed";
    return `${i + 1}. **${name}** — ID: ${id}, type: ${a.type ?? "—"}`;
  });
  return `Project has ${total} asset(s):\n\n${lines.join("\n")}`;
}

export function formatTransactionsList(
  transactions: Array<{ payment_id?: string; status?: string; amount?: number; currency?: string; description?: string; [key: string]: unknown }>,
  count: number,
  projectId: number | undefined
): string {
  if (transactions.length === 0) return `No payment transactions${projectId !== undefined ? ` for project ${projectId}` : ""}.`;
  const lines = transactions.map((t, i) => {
    const id = t.payment_id ?? "—";
    const status = t.status ?? "—";
    const amount = typeof t.amount === "number" ? t.amount : "—";
    const currency = t.currency ?? "";
    const desc = t.description ?? "";
    return `${i + 1}. **${id}** — ${status}, ${amount} ${currency}${desc ? `, ${desc}` : ""}`;
  });
  return `Payment transactions (${count})${projectId !== undefined ? ` — project ${projectId}` : ""}:\n\n${lines.join("\n")}`;
}
