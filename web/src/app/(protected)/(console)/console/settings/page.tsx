import { SettingsShell, type SettingsMode } from './_components/settings-shell';

type SettingsPageProps = {
  searchParams?: Promise<{
    tab?: string;
  }>;
};

const settingsModes: SettingsMode[] = ['profile', 'repositories', 'github'];

function isSettingsMode(tab?: string): tab is SettingsMode {
  return Boolean(tab && settingsModes.includes(tab as SettingsMode));
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  const mode = isSettingsMode(params?.tab) ? params.tab : 'profile';

  return <SettingsShell mode={mode} />;
}
