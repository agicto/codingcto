import Link from 'next/link';
import { CheckCircle2, Github } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ROUTES } from '@/constants/routes';

type GitHubAppManifestPageProps = {
  searchParams?: Promise<{
    code?: string;
    state?: string;
    repo?: string;
    repository_url?: string;
    repository_id?: string;
    return_to?: string;
  }>;
};

export default async function GitHubAppManifestPage({
  searchParams,
}: GitHubAppManifestPageProps) {
  const params = await searchParams;
  const code = params?.code?.trim() ?? '';
  const repositoryURL = params?.repository_url?.trim() ?? '';
  const repositoryId = params?.repository_id?.trim() ?? '';
  const returnTo = safeConsoleReturnPath(params?.return_to ?? '');
  const repoLabel = params?.repo?.trim() || repositoryLabelFromURL(repositoryURL) || repositoryId;
  const recoveryParams = new URLSearchParams({ tab: 'github' });
  if (repositoryURL) {
    recoveryParams.set('repository_url', repositoryURL);
  }
  if (repositoryId) {
    recoveryParams.set('repository_id', repositoryId);
  }
  if (returnTo) {
    recoveryParams.set('return_to', returnTo);
  }
  const settingsHref = `${ROUTES.CONSOLE.SETTINGS}?${recoveryParams.toString()}`;
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
            <h1 className="text-2xl font-semibold text-text-main">GitHub App 创建完成</h1>
            <p className="text-sm text-text-muted">
              用本地脚本把 GitHub 返回的 manifest code 转成 CodingCTO 配置。
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-5 p-5">
            {repoLabel ? (
              <div className="rounded-md border border-primary/20 bg-primary-subtle px-3 py-2 text-sm leading-6 text-text-muted">
                正在恢复目标仓库：<span className="font-medium text-text-main">{repoLabel}</span>
                {repositoryId ? ` · ${repositoryId}` : ''}
              </div>
            ) : null}

            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-semibold text-text-main">
                  运行转换命令
                </h2>
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  在仓库根目录执行。脚本会交换临时 code，把 private key 保存到
                  <code className="mx-1 rounded bg-bg-subtle px-1.5 py-0.5 text-xs">api/.local</code>
                  ，并更新 API/Web 的环境文件。
                </p>
              </div>
            </div>

            <pre className="overflow-x-auto rounded-md border border-border-subtle bg-bg-subtle px-4 py-3 text-sm text-text-main">
              <code>{command}</code>
            </pre>

            {!code ? (
              <p className="text-sm text-text-muted">
                URL 里没有 code。请从 GitHub redirect URL 复制 code，并手动替换
                <code className="mx-1 rounded bg-bg-subtle px-1.5 py-0.5 text-xs">
                  &lt;manifest-code&gt;
                </code>
                。
              </p>
            ) : null}

            <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-sm leading-6 text-text-muted">
              转换完成后重启 Web/API，再回到 GitHub 设置页安装或重新同步 App。同步完成后返回项目质量门继续检查。
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {returnTo ? (
                <Button asChild variant="outline">
                  <Link href={returnTo}>返回项目检查</Link>
                </Button>
              ) : null}
              <Button asChild variant="outline">
                <Link href={settingsHref}>回到 GitHub 设置</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function safeConsoleReturnPath(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith('/console/') ? trimmed : '';
}

function repositoryLabelFromURL(value: string) {
  try {
    const url = new URL(value);
    const [owner, repo] = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
    return owner && repo ? `${owner}/${repo.replace(/\.git$/, '')}` : '';
  } catch {
    return '';
  }
}
