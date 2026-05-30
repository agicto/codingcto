import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { GitHubConnectionPanel } from "./_components/github-connection-panel";

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
  const defaultTab = params?.tab === "github" ? "github" : "general";

  return (
    <div className="flex-1 space-y-4 p-6 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">设置</h2>
      </div>
      
      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">通用设置</TabsTrigger>
          <TabsTrigger value="github">GitHub</TabsTrigger>
          <TabsTrigger value="notifications">通知</TabsTrigger>
          <TabsTrigger value="security">安全</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
        </TabsList>
        
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>系统信息</CardTitle>
              <CardDescription>
                查看并更新系统基础设置
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company-name">公司名称</Label>
                <Input id="company-name" placeholder="请输入公司名称" defaultValue="示例科技有限公司" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="site-url">网站地址</Label>
                <Input id="site-url" placeholder="请输入网站地址" defaultValue="https://example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="support-email">支持邮箱</Label>
                <Input id="support-email" placeholder="请输入支持邮箱" defaultValue="support@example.com" />
              </div>
            </CardContent>
            <CardFooter>
              <Button>保存设置</Button>
            </CardFooter>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>显示设置</CardTitle>
              <CardDescription>
                自定义系统显示偏好
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">深色模式</Label>
                  <p className="text-sm text-muted-foreground">
                    启用全局深色模式
                  </p>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">自动切换主题</Label>
                  <p className="text-sm text-muted-foreground">
                    跟随系统设置自动切换
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
            <CardFooter>
              <Button>保存偏好</Button>
            </CardFooter>
          </Card>

        </TabsContent>

        <TabsContent value="github" className="space-y-4">
          <GitHubConnectionPanel />
        </TabsContent>
        
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>通知设置</CardTitle>
              <CardDescription>
                配置接收通知的方式
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">邮件通知</Label>
                  <p className="text-sm text-muted-foreground">
                    接收订单和系统通知邮件
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">短信通知</Label>
                  <p className="text-sm text-muted-foreground">
                    重要事件通过短信提醒
                  </p>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">浏览器推送</Label>
                  <p className="text-sm text-muted-foreground">
                    允许浏览器推送通知
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
            <CardFooter>
              <Button>更新通知设置</Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>安全设置</CardTitle>
              <CardDescription>
                管理账户安全和权限
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">两步验证</Label>
                  <p className="text-sm text-muted-foreground">
                    使用两步验证提升账户安全性
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="space-y-2">
                <Label htmlFor="session-timeout">会话超时（分钟）</Label>
                <Input id="session-timeout" type="number" defaultValue="30" />
              </div>
              <Button variant="outline">修改密码</Button>
            </CardContent>
            <CardFooter>
              <Button>保存安全设置</Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="api" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>API 设置</CardTitle>
              <CardDescription>
                管理 API 密钥和访问权限
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="api-key">API 密钥</Label>
                <div className="flex items-center space-x-2">
                  <Input id="api-key" value="sk_live_xxxxxxxxxxxxx" readOnly />
                  <Button variant="outline" size="sm">重新生成</Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  请妥善保管 API 密钥，它拥有完整账户访问权限
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">启用 API 访问</Label>
                  <p className="text-sm text-muted-foreground">
                    允许通过 API 访问系统数据
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
            <CardFooter>
              <Button>保存 API 设置</Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
