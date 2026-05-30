import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GitHubConnectionPanel } from './_components/github-connection-panel';

type SettingsPageProps = {
  searchParams?: Promise<{
    tab?: string;
  }>;
};

/**
 * Console settings page.
 */
export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  const defaultTab = params?.tab === 'github' ? 'github' : 'general';

  return (
    <div className="flex-1 space-y-4 p-6 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="github">GitHub</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Information</CardTitle>
              <CardDescription>Review and update the basic workspace settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company-name">Company name</Label>
                <Input
                  id="company-name"
                  placeholder="Enter company name"
                  defaultValue="Example Inc."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="site-url">Website URL</Label>
                <Input
                  id="site-url"
                  placeholder="Enter website URL"
                  defaultValue="https://example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="support-email">Support email</Label>
                <Input
                  id="support-email"
                  placeholder="Enter support email"
                  defaultValue="support@example.com"
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button>Save settings</Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Display Settings</CardTitle>
              <CardDescription>Customize display preferences for the console.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Dark mode</Label>
                  <p className="text-sm text-muted-foreground">Enable dark mode globally.</p>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Automatic theme</Label>
                  <p className="text-sm text-muted-foreground">Follow the system theme setting.</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
            <CardFooter>
              <Button>Save preferences</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="github" className="space-y-4">
          <GitHubConnectionPanel />
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>
                Configure how this workspace receives notifications.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Email notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive system notifications by email.
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">SMS notifications</Label>
                  <p className="text-sm text-muted-foreground">Send important alerts by SMS.</p>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Browser push</Label>
                  <p className="text-sm text-muted-foreground">Allow browser push notifications.</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
            <CardFooter>
              <Button>Update notifications</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>Manage account security and access controls.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Two-step verification</Label>
                  <p className="text-sm text-muted-foreground">
                    Use two-step verification for stronger account security.
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="space-y-2">
                <Label htmlFor="session-timeout">Session timeout (minutes)</Label>
                <Input id="session-timeout" type="number" defaultValue="30" />
              </div>
              <Button variant="outline">Change password</Button>
            </CardContent>
            <CardFooter>
              <Button>Save security settings</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>API Settings</CardTitle>
              <CardDescription>Manage API keys and access controls.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="api-key">API key</Label>
                <div className="flex items-center space-x-2">
                  <Input id="api-key" value="sk_live_xxxxxxxxxxxxx" readOnly />
                  <Button variant="outline" size="sm">
                    Regenerate
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Store this API key carefully. It can access workspace data.
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Enable API access</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow API access to workspace data.
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
            <CardFooter>
              <Button>Save API settings</Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
