import Link from 'next/link';
import { CheckCircle2, Github } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ROUTES } from '@/constants/routes';

type GitHubAppManifestPageProps = {
  searchParams?: Promise<{
    code?: string;
    state?: string;
  }>;
};

export default async function GitHubAppManifestPage({
  searchParams,
}: GitHubAppManifestPageProps) {
  const params = await searchParams;
  const code = params?.code?.trim() ?? '';
  const command = code
    ? `node scripts/github-app-config.mjs convert --code ${code}`
    : 'node scripts/github-app-config.mjs convert --code <manifest-code>';

  return (
    <main className="min-h-full bg-bg-canvas px-4 py-8 md:px-8">
      <section className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-subtle text-text-main">
            <Github className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-text-main">GitHub App manifest</h1>
            <p className="text-sm text-text-muted">
              Finish local configuration with the CLI.
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-5 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-semibold text-text-main">
                  GitHub returned the manifest code
                </h2>
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  Run this command from the repository root. It will exchange the temporary
                  code, save the private key locally, and update API/Web environment files.
                </p>
              </div>
            </div>

            <pre className="overflow-x-auto rounded-md border border-border-subtle bg-bg-subtle px-4 py-3 text-sm text-text-main">
              <code>{command}</code>
            </pre>

            {!code ? (
              <p className="text-sm text-text-muted">
                No code was found in the URL. Copy the code from GitHub&apos;s redirect URL
                and replace <code>&lt;manifest-code&gt;</code> manually.
              </p>
            ) : null}

            <div className="flex justify-end">
              <Button asChild variant="outline">
                <Link href={`${ROUTES.CONSOLE.SETTINGS}?tab=github`}>Back to GitHub settings</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
