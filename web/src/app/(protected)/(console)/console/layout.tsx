'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LucideIcon,
  Settings,
  Bell,
  LogOut,
  Palette,
  GitPullRequest,
  GitBranch,
  Boxes,
  Search,
  SquarePen,
  Inbox,
  CircleUserRound,
  ListChecks,
  Zap,
  Bot,
  BarChart3,
  Monitor,
  BookOpen,
  HelpCircle,
  ChevronDown,
} from "lucide-react";

import { cn } from "@/utils";
import { ROUTES } from "@/constants/routes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/common";
import { useT } from "@/i18n";
import { useLogout } from "@/features/auth/hooks/use-auth";
import { useAuthStore } from "@/features/auth/store/auth-store";

interface WorkspaceNavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useT();
  const user = useAuthStore.use.user();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();

  const workspaceNavItems: WorkspaceNavItem[] = [
    { title: 'Command Center', href: ROUTES.CONSOLE.SPECFORGE, icon: ListChecks, badge: '4' },
    { title: 'Projects', href: ROUTES.CONSOLE.PROJECTS, icon: Boxes },
    { title: 'Repositories', href: ROUTES.CONSOLE.PROJECTS, icon: GitBranch },
    { title: 'Autopilot', href: ROUTES.CONSOLE.SPECFORGE, icon: Zap },
    { title: 'Runs', href: ROUTES.CONSOLE.SPECFORGE, icon: Bot },
    { title: 'Usage', href: ROUTES.CONSOLE.HOME, icon: BarChart3 },
  ];

  const configureNavItems: WorkspaceNavItem[] = [
    { title: 'Runtimes', href: ROUTES.CONSOLE.SPECFORGE, icon: Monitor },
    { title: 'Skills', href: ROUTES.CONSOLE.SPECFORGE, icon: BookOpen },
    { title: 'Settings', href: ROUTES.CONSOLE.SETTINGS, icon: Settings },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[#f7f7f6] text-[#18181b]">
      <aside className="hidden w-[256px] shrink-0 flex-col border-r border-[#e6e6e4] bg-[#f4f4f3] px-3 py-3 md:flex">
        <button className="flex h-9 w-full items-center justify-between rounded-md px-2 text-left text-sm font-medium hover:bg-[#ececea]">
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md border border-[#ddddda] bg-white text-xs font-semibold text-[#6b6b70]">
              A
            </span>
            <span className="truncate">agicto</span>
          </span>
          <ChevronDown className="h-4 w-4 text-[#6f6f76]" />
        </button>

        <div className="mt-4 space-y-1">
          <button className="flex h-9 w-full items-center justify-between rounded-lg bg-[#ececea] px-2 text-sm text-[#202024]">
            <span className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Search...
            </span>
            <kbd className="rounded border border-[#d8d8d5] bg-[#f8f8f7] px-1.5 py-0.5 text-[11px] text-[#73737a]">
              ⌘ K
            </kbd>
          </button>
          <Link
            href={ROUTES.CONSOLE.SPECFORGE}
            className="flex h-9 items-center justify-between rounded-lg px-2 text-sm text-[#6f6f76] hover:bg-[#ececea] hover:text-[#202024]"
          >
            <span className="flex items-center gap-2">
              <SquarePen className="h-4 w-4" />
              New Requirement
            </span>
            <kbd className="rounded border border-[#d8d8d5] bg-[#f8f8f7] px-1.5 py-0.5 text-[11px]">
              C
            </kbd>
          </Link>
        </div>

        <nav className="mt-8 space-y-1 text-sm">
          <SidebarLink href={ROUTES.CONSOLE.HOME} icon={Inbox} label="Review Queue" pathname={pathname} />
          <SidebarLink
            href={ROUTES.CONSOLE.HOME}
            icon={CircleUserRound}
            label="My PR Sets"
            pathname={pathname}
          />
        </nav>

        <SidebarSection title="Workspace" items={workspaceNavItems} pathname={pathname} />
        <SidebarSection title="Configure" items={configureNavItems} pathname={pathname} />

        <div className="mt-auto flex items-center justify-between px-2">
          <Link
            href={ROUTES.DEVTOOLS.STYLEGUIDE}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-[#6f6f76] hover:bg-[#ececea] hover:text-[#202024]"
          >
            <Palette className="h-4 w-4" />
            Styleguide
          </Link>
          <HelpCircle className="h-4 w-4 text-[#7b7b82]" />
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#e6e6e4] bg-white px-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <GitPullRequest className="h-4 w-4 text-[#6f6f76]" />
            CodingCTO
          </div>
          <div className="flex items-center gap-1.5">
            <LanguageSwitcher />
            <ThemeToggle />
            <Button variant="ghost" isIcon className="h-8 w-8 rounded-md">
              <Bell className="h-4 w-4 text-[#6f6f76]" />
              <span className="sr-only">Notifications</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" isIcon noScale className="h-8 w-8 overflow-hidden rounded-full">
                  <Avatar className="h-full w-full">
                    <AvatarImage src="https://github.com/shadcn.png" />
                    <AvatarFallback className="bg-[#ececea] text-xs text-[#202024]">
                      {user?.name
                        ?.split(' ')
                        .map((part) => part[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase() || 'CT'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="sr-only">Profile</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-lg p-1">
                <div className="px-2 py-1.5 text-xs font-medium text-text-muted">
                  {user?.name || t('nav.profile')}
                </div>
                <DropdownMenuItem>{t('nav.profile')}</DropdownMenuItem>
                <DropdownMenuItem>{t('nav.settings')}</DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onSelect={(event) => {
                    event.preventDefault();
                    logout();
                  }}
                  disabled={isLoggingOut}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {t('auth.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </section>
    </div>
  );
}

function SidebarSection({
  title,
  items,
  pathname,
}: {
  title: string;
  items: WorkspaceNavItem[];
  pathname: string;
}) {
  return (
    <div className="mt-8">
      <div className="px-2 pb-2 text-xs font-medium text-[#66666d]">{title}</div>
      <nav className="space-y-1 text-sm">
        {items.map(item => (
          <SidebarLink key={`${title}-${item.title}`} {...item} pathname={pathname} />
        ))}
      </nav>
    </div>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  label,
  title,
  badge,
  pathname,
}: {
  href: string;
  icon: LucideIcon;
  label?: string;
  title?: string;
  badge?: string;
  pathname: string;
}) {
  const text = label ?? title ?? '';
  const active =
    pathname === href ||
    (href !== ROUTES.CONSOLE.HOME && pathname.startsWith(`${href}/`)) ||
    (text === 'Command Center' && pathname.includes('/specforge'));

  return (
    <Link
      href={href}
      className={cn(
        'flex h-9 items-center justify-between rounded-lg px-2 text-[#66666d] hover:bg-[#ececea] hover:text-[#202024]',
        active && 'bg-[#e9e9e7] text-[#18181b]'
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{text}</span>
      </span>
      {badge ? <span className="text-xs text-[#7b7b82]">{badge}</span> : null}
    </Link>
  );
}
