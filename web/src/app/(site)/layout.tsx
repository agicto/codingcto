import { PropsWithChildren } from 'react';
import Link from 'next/link';
import { SiteHeaderNav } from '@/components/features/site/site-header-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/ui/icons';

/**
 * Site layout for public pages
 * Unified design language with Auth and Console
 */
export default function SiteLayout({ children }: PropsWithChildren) {
  return (
    <div className="flex min-h-screen flex-col bg-bg-canvas">
      {/* Navigation bar - unified with Console header style */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-bg-surface/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group">
              <Logo className="h-7 w-auto transition-transform group-hover:scale-[1.02]" />
            </Link>

            {/* Navigation links - only valid ones */}
            <nav className="hidden md:flex items-center gap-1">
              <Link 
                href="/" 
                className="px-3 py-2 text-sm font-medium text-text-subtle rounded-lg transition-colors hover:text-primary hover:bg-muted/50"
              >
                Home
              </Link>
              <Link 
                href="/console" 
                className="px-3 py-2 text-sm font-medium text-text-subtle rounded-lg transition-colors hover:text-primary hover:bg-muted/50"
              >
                Console
              </Link>
            </nav>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SiteHeaderNav />
          </div>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1">
        {children}
      </main>

      {/* Simplified Footer */}
      <footer className="border-t border-border/50 bg-bg-surface/50">
        <div className="container py-8">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            {/* Brand */}
            <div className="flex items-center gap-2">
              <Logo className="h-5 w-auto" />
              <span className="text-sm text-text-muted">
                · PRD-to-PR Automation
              </span>
            </div>

            {/* Links & Copyright */}
            <div className="flex items-center gap-6 text-sm text-text-muted">
              <a 
                href="https://github.com/agicto/codingcto"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                GitHub
              </a>
              <span>
                © {new Date().getFullYear()} CodingCTO. All rights reserved.
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
