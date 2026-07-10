import Link from 'next/link';
import UserBar from '@/components/layout/UserBar';

const NAV = [
  { href: '/admin/crm', label: 'Dashboard' },
  { href: '/admin/crm/leads', label: 'Leads' },
  { href: '/admin/crm/pipeline', label: 'Pipeline' },
  { href: '/admin/crm/tasks', label: 'Tasks' },
  { href: '/admin/crm/accounts', label: 'Accounts' },
] as const;

/** Shared chrome for all CRM pages: UserBar, breadcrumbs, title, tab nav. */
export default function CrmShell({
  title,
  description,
  active,
  actions,
  children,
}: {
  title: string;
  description?: string;
  active: (typeof NAV)[number]['href'];
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <UserBar />
      <main className="max-w-[var(--width-content)] mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboard" className="text-body-sm text-muted hover:text-foreground transition-colors">
                Dashboard
              </Link>
              <span className="text-muted-light">/</span>
              <Link href="/admin" className="text-body-sm text-muted hover:text-foreground transition-colors">
                Admin Console
              </Link>
              <span className="text-muted-light">/</span>
              <Link href="/admin/crm" className="text-body-sm text-muted hover:text-foreground transition-colors">
                CRM
              </Link>
            </div>
            <h1 className="text-display-md font-bold text-foreground tracking-tight">{title}</h1>
            {description ? <p className="text-body-sm text-muted mt-1">{description}</p> : null}
          </div>
          {actions}
        </div>

        <nav className="flex items-center gap-1 border-b border-border mb-8">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                item.href === active
                  ? 'px-3 py-2 text-body-sm font-medium text-foreground border-b-2 border-brand -mb-px'
                  : 'px-3 py-2 text-body-sm text-muted hover:text-foreground transition-colors'
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {children}
      </main>
    </div>
  );
}
