"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ExternalLink,
  Github,
  GitPullRequest,
  Link2,
  PanelRight,
  SlidersHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { env } from "@/config/env";
import { ROUTES } from "@/constants/routes";
import {
  useGitHubSettings,
  useSyncGitHubInstallation,
  useUpsertGitHubSettings,
  useUpsertGitHubRepository,
} from "@/features/specforge/hooks/use-specforge";
import type { GitHubRepositoryOptionDTO } from "@/features/specforge/services/specforge-service";

type GitHubSettings = {
  enabled: boolean;
  pullRequestSidebar: boolean;
  coAuthoredByTrailer: boolean;
  issuePrAutoLink: boolean;
};

const defaultSettings: GitHubSettings = {
  enabled: true,
  pullRequestSidebar: true,
  coAuthoredByTrailer: true,
  issuePrAutoLink: true,
};

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "连接 GitHub 仓库失败，请检查后端登录状态和 GitHub App 配置。";
}

export function GitHubConnectionPanel() {
  const searchParams = useSearchParams();
  const [workspaceId, setWorkspaceId] = useState("default");
  const [installationId, setInstallationId] = useState("");
  const [accountLogin, setAccountLogin] = useState("agicto");
  const [owner, setOwner] = useState("agicto");
  const [repo, setRepo] = useState("codingcto");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [isPrivate, setIsPrivate] = useState(true);
  const [repositoryOptions, setRepositoryOptions] = useState<GitHubRepositoryOptionDTO[]>([]);
  const [selectedRepository, setSelectedRepository] = useState("");
  const [savedRepoId, setSavedRepoId] = useState("");
  const [savedInstallationDbId, setSavedInstallationDbId] = useState<number>();
  const [message, setMessage] = useState("");
  const [installEntry, setInstallEntry] = useState(
    env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL || env.NEXT_PUBLIC_GITHUB_APP_SLUG || ""
  );

  const githubSettings = useGitHubSettings(workspaceId.trim() || "default");
  const upsertSettings = useUpsertGitHubSettings();
  const syncInstallation = useSyncGitHubInstallation();
  const upsertRepository = useUpsertGitHubRepository();
  const isSaving =
    upsertSettings.isPending || syncInstallation.isPending || upsertRepository.isPending;
  const settings: GitHubSettings = {
    enabled: githubSettings.data?.enabled ?? defaultSettings.enabled,
    pullRequestSidebar:
      githubSettings.data?.pull_request_sidebar ?? defaultSettings.pullRequestSidebar,
    coAuthoredByTrailer:
      githubSettings.data?.co_authored_by_trailer ?? defaultSettings.coAuthoredByTrailer,
    issuePrAutoLink: githubSettings.data?.issue_pr_auto_link ?? defaultSettings.issuePrAutoLink,
  };
  const normalizedInstallationId = Number(installationId);
  const canSubmit =
    workspaceId.trim() &&
    accountLogin.trim() &&
    owner.trim() &&
    repo.trim() &&
    Number.isFinite(normalizedInstallationId) &&
    normalizedInstallationId > 0;
  const specForgeHref = useMemo(() => {
    if (!savedRepoId) {
      return ROUTES.CONSOLE.SPECFORGE;
    }
    return `${ROUTES.CONSOLE.SPECFORGE}?repo_id=${encodeURIComponent(savedRepoId)}`;
  }, [savedRepoId]);
  const installURL = useMemo(() => {
    const entry = installEntry.trim();
    if (!entry) {
      return "";
    }
    if (entry.startsWith("https://github.com/")) {
      return entry;
    }
    const slug = entry
      .replace(/^https?:\/\/github\.com\/apps\//, "")
      .replace(/\/installations\/new.*$/, "")
      .replace(/^\/+|\/+$/g, "");
    const state = encodeURIComponent(workspaceId.trim() || "default");
    return `https://github.com/apps/${slug}/installations/new?state=${state}`;
  }, [installEntry, workspaceId]);

  useEffect(() => {
    const returnedInstallationId = searchParams.get("installation_id")?.trim();
    const setupAction = searchParams.get("setup_action")?.trim();
    const stateWorkspaceId = searchParams.get("state")?.trim();
    if (stateWorkspaceId) {
      setWorkspaceId(stateWorkspaceId);
    }
    if (!returnedInstallationId) {
      return;
    }
    setInstallationId(returnedInstallationId);
    setMessage(
      setupAction === "update"
        ? "GitHub App 安装已更新，正在同步可访问仓库。"
        : "GitHub App 已安装，正在同步可访问仓库。"
    );
    void syncGitHubInstallation(returnedInstallationId, stateWorkspaceId || workspaceId);
  }, [searchParams]);

  function applyRepositoryOption(option: GitHubRepositoryOptionDTO) {
    setSelectedRepository(option.full_name);
    setOwner(option.owner);
    setRepo(option.repo);
    setDefaultBranch(option.default_branch || "main");
    setIsPrivate(option.is_private);
  }

  async function syncGitHubInstallation(
    installationIdValue = installationId,
    workspaceIdValue = workspaceId
  ) {
    const parsedInstallationId = Number(installationIdValue);
    if (!Number.isFinite(parsedInstallationId) || parsedInstallationId <= 0) {
      setMessage("请先完成 GitHub App 安装，或填写有效的 Installation ID。");
      return;
    }
    setMessage("");
    try {
      const result = await syncInstallation.mutateAsync({
        workspace_id: workspaceIdValue.trim() || "default",
        installation_id: parsedInstallationId,
      });
      setInstallationId(String(result.installation.installation_id));
      setSavedInstallationDbId(result.installation.id);
      setAccountLogin(result.installation.account_login);
      setRepositoryOptions(result.repositories);
      if (result.repositories[0]) {
        applyRepositoryOption(result.repositories[0]);
      }
      setMessage(
        result.repositories.length > 0
          ? "GitHub App 已同步，请选择要绑定的仓库后保存。"
          : "GitHub App 已同步，但没有返回可访问仓库。请确认安装时选择了仓库权限。"
      );
    } catch (error) {
      setMessage(`${errorMessage(error)} 请确认后端已配置 GITHUB_APP_ID 和 GITHUB_APP_PRIVATE_KEY。`);
    }
  }

  async function updateSetting<Key extends keyof GitHubSettings>(
    key: Key,
    value: GitHubSettings[Key]
  ) {
    const next = { ...settings, [key]: value };
    setMessage("");
    try {
      await upsertSettings.mutateAsync({
        workspace_id: workspaceId.trim() || "default",
        enabled: next.enabled,
        pull_request_sidebar: next.pullRequestSidebar,
        co_authored_by_trailer: next.coAuthoredByTrailer,
        issue_pr_auto_link: next.issuePrAutoLink,
      });
      setMessage("GitHub 功能设置已保存。");
    } catch (error) {
      setMessage(`${errorMessage(error)} GitHub 功能设置未保存。`);
    }
  }

  function focusConnectionForm() {
    document.getElementById("github-repository-form")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function focusInstallEntry() {
    document.getElementById("github-app-install-entry")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    window.setTimeout(() => document.getElementById("github-app-install-entry")?.focus(), 250);
  }

  async function connectRepository() {
    if (!canSubmit) {
      setMessage("请填写 GitHub installation ID、账号和仓库信息。");
      return;
    }

    setMessage("");
    setSavedRepoId("");
    try {
      let installationDbId = savedInstallationDbId;
      if (!installationDbId) {
        const result = await syncInstallation.mutateAsync({
          workspace_id: workspaceId.trim(),
          installation_id: normalizedInstallationId,
        });
        installationDbId = result.installation.id;
        setSavedInstallationDbId(installationDbId);
        setAccountLogin(result.installation.account_login);
        setRepositoryOptions(result.repositories);
      }

      const repository = await upsertRepository.mutateAsync({
        workspace_id: workspaceId.trim(),
        github_installation_id: installationDbId,
        github_owner: owner.trim(),
        github_repo: repo.trim(),
        default_branch: defaultBranch.trim() || "main",
        is_private: isPrivate,
      });

      setSavedRepoId(repository.repository_id);
      setMessage("GitHub 仓库已连接，可以在 SpecForge 中使用这个仓库 ID。");
    } catch (error) {
      setMessage(
        `${errorMessage(error)} 如果当前使用的是演示登录，需要先启用 LUAS_AUTH_BACKEND_ENABLED=true 并用后端账号登录。`
      );
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <p className="text-sm leading-6 text-text-muted">
        连接 GitHub App，控制 Pull Request 如何出现在 CodingCTO 中，并决定智能体在 commit 记录里留下哪些痕迹。
      </p>

      <Card>
        <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-subtle">
              <Github className="h-5 w-5" />
            </div>
            <div>
              <div className="font-medium">启用 GitHub 功能</div>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                关闭后，所有 GitHub 入口都会被隐藏，也不再产生新的副作用。已有数据不会被删除；团队不使用 GitHub 时可以直接关闭。
              </p>
            </div>
          </div>
          <Switch
            checked={settings.enabled}
            disabled={isSaving}
            onCheckedChange={(checked) => updateSetting("enabled", checked)}
          />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">连接</h3>
        <Card>
          <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-subtle">
                <Github className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium">GitHub App</div>
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  自动把 issue 关联到 Pull Request。当 PR 的分支、标题或正文中包含{" "}
                  <code className="rounded bg-bg-subtle px-1.5 py-0.5 text-xs">MUL-123</code>{" "}
                  并被合并时，对应 issue 会自动转为已完成。
                </p>
              </div>
            </div>
            {installURL ? (
              <Button asChild disabled={!settings.enabled}>
                <a href={installURL} target="_blank" rel="noreferrer">
                  安装 GitHub App
                </a>
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setMessage(
                    "请先填写 GitHub App slug 或安装地址。没有 GitHub App 时，需要先在 GitHub 创建一个 App。"
                  );
                  focusInstallEntry();
                }}
                disabled={!settings.enabled}
              >
                安装 GitHub App
              </Button>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">功能</h3>
        <Card>
          <CardContent className="divide-y divide-border-subtle p-0">
            <FeatureToggle
              icon={PanelRight}
              title="Pull Request 侧栏"
              description="在 issue 详情侧栏中展示关联的 Pull Request。"
              checked={settings.pullRequestSidebar}
              disabled={!settings.enabled || isSaving}
              onCheckedChange={(checked) => updateSetting("pullRequestSidebar", checked)}
            />
            <FeatureToggle
              icon={SlidersHorizontal}
              title="Co-authored-by trailer"
              description={
                <>
                  在智能体提交的 commit 中追加{" "}
                  <code className="rounded bg-bg-subtle px-1.5 py-0.5 text-xs">
                    Co-authored-by: codingcto-agent &lt;github@codingcto.local&gt;
                  </code>
                  。
                </>
              }
              checked={settings.coAuthoredByTrailer}
              disabled={!settings.enabled || isSaving}
              onCheckedChange={(checked) => updateSetting("coAuthoredByTrailer", checked)}
            />
            <FeatureToggle
              icon={Link2}
              title="Issue ↔ PR 自动关联"
              description="根据 PR 标题、正文和分支名匹配 issue 编号并自动建立链接。"
              checked={settings.issuePrAutoLink}
              disabled={!settings.enabled || isSaving}
              onCheckedChange={(checked) => updateSetting("issuePrAutoLink", checked)}
            />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">代码仓库</h3>
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-medium">仓库 URL 仍在「代码仓库」标签页中管理</div>
              <p className="mt-1 text-sm text-text-muted">
                在这里连接 GitHub App 后，再登记具体仓库给 SpecForge 使用。
              </p>
            </div>
            <Button variant="outline" onClick={focusConnectionForm} disabled={!settings.enabled}>
              填写仓库
              <ExternalLink className="ml-1.5 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card id="github-repository-form">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            SpecForge 仓库连接
          </CardTitle>
          <CardDescription>
            安装 GitHub App 后，保存 installation 和仓库映射。后端会读取默认分支做一次真实校验，确认 App 有权限访问这个仓库。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="github-app-install-entry">GitHub App slug 或安装地址</Label>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                id="github-app-install-entry"
                value={installEntry}
                onChange={(event) => setInstallEntry(event.target.value)}
                placeholder="例如 codingcto 或 https://github.com/apps/codingcto/installations/new"
              />
              {installURL ? (
                <Button asChild variant="outline" disabled={!settings.enabled}>
                  <a href={installURL} target="_blank" rel="noreferrer">
                    打开安装页
                    <ExternalLink className="ml-1.5 h-4 w-4" />
                  </a>
                </Button>
              ) : (
                <Button variant="outline" onClick={focusInstallEntry} disabled={!settings.enabled}>
                  打开安装页
                  <ExternalLink className="ml-1.5 h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-sm leading-6 text-text-muted">
              这里是平台 GitHub App 的安装入口。普通用户只需要点安装并选择自己的 GitHub 账号/组织和仓库。
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="github-workspace">工作区 ID</Label>
              <Input
                id="github-workspace"
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                placeholder="default"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="github-installation">Installation ID</Label>
              <Input
                id="github-installation"
                inputMode="numeric"
                value={installationId}
                onChange={(event) => setInstallationId(event.target.value)}
                placeholder="GitHub App 安装 ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="github-account">安装账号</Label>
              <Input
                id="github-account"
                value={accountLogin}
                onChange={(event) => setAccountLogin(event.target.value)}
                placeholder="组织或用户，例如 agicto"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => syncGitHubInstallation()}
              disabled={!settings.enabled || !installationId.trim() || isSaving}
            >
              {syncInstallation.isPending ? "同步中" : "同步可访问仓库"}
            </Button>
          </div>

          {repositoryOptions.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="github-repository-option">选择仓库</Label>
              <select
                id="github-repository-option"
                className="h-10 w-full rounded-md border border-border bg-bg-canvas px-3 text-sm"
                value={selectedRepository}
                onChange={(event) => {
                  const option = repositoryOptions.find(
                    (candidate) => candidate.full_name === event.target.value
                  );
                  if (option) {
                    applyRepositoryOption(option);
                  }
                }}
              >
                {repositoryOptions.map((option) => (
                  <option key={option.full_name} value={option.full_name}>
                    {option.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="github-owner">仓库 Owner</Label>
              <Input
                id="github-owner"
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
                placeholder="agicto"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="github-repo">仓库名称</Label>
              <Input
                id="github-repo"
                value={repo}
                onChange={(event) => setRepo(event.target.value)}
                placeholder="codingcto"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="github-default-branch">默认分支</Label>
              <Input
                id="github-default-branch"
                value={defaultBranch}
                onChange={(event) => setDefaultBranch(event.target.value)}
                placeholder="main"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-bg-subtle px-3 py-2">
            <div>
              <Label className="text-base">私有仓库</Label>
              <p className="mt-1 text-sm text-text-muted">
                勾选后仅影响本地仓库记录；实际访问权限由 GitHub App installation 决定。
              </p>
            </div>
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
          </div>

          {message && (
            <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm leading-6 text-text-muted">
              {message}
            </div>
          )}

          {savedRepoId && (
            <div className="rounded-lg border border-success/30 bg-success-subtle p-3 text-sm leading-6 text-success">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                已连接：{savedRepoId}
              </div>
              {savedInstallationDbId ? (
                <div className="mt-1 text-xs">本地 installation 记录 ID：{savedInstallationDbId}</div>
              ) : null}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button onClick={connectRepository} disabled={!settings.enabled || !canSubmit || isSaving}>
            {isSaving ? "连接中" : "连接 GitHub 仓库"}
          </Button>
          {savedRepoId ? (
            <Button asChild variant="outline">
              <Link href={specForgeHref}>
                去 SpecForge 使用
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              去 SpecForge 使用
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

function FeatureToggle({
  icon: Icon,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  icon: typeof GitPullRequest;
  title: string;
  description: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-subtle">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="font-medium">{title}</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">{description}</p>
        </div>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}
