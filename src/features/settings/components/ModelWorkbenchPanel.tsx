import { Button, Card, CardContent, CardHeader, CardTitle, Input, Textarea } from "../../../shared/ui";

export type LocalAgentProfileItem = {
  profileKey: string;
  name: string;
  executable: string;
  argsTemplate: string[];
  isBuiltin: boolean;
  enabled: boolean;
};

export function ModelWorkbenchPanel({
  isZh,
  loading,
  profiles,
  selectedProfileKey,
  onSelectProfile,
  onDeleteProfile,
  profileName,
  onProfileNameChange,
  executable,
  onExecutableChange,
  argsTemplateText,
  onArgsTemplateTextChange,
  onSaveProfile,
  newProfileKey,
  onNewProfileKeyChange,
  onAddProfile,
  translationScenarioDefaultProfileKey,
  onOpenTranslationScenarioSettings,
  onOpenTranslationScenarioTest,
  testRunning,
}: {
  isZh: boolean;
  loading: boolean;
  profiles: LocalAgentProfileItem[];
  selectedProfileKey: string;
  onSelectProfile: (key: string) => void;
  onDeleteProfile: (key: string) => void;
  profileName: string;
  onProfileNameChange: (value: string) => void;
  executable: string;
  onExecutableChange: (value: string) => void;
  argsTemplateText: string;
  onArgsTemplateTextChange: (value: string) => void;
  onSaveProfile: () => void;
  newProfileKey: string;
  onNewProfileKeyChange: (value: string) => void;
  onAddProfile: () => void;
  translationScenarioDefaultProfileKey: string;
  onOpenTranslationScenarioSettings: () => void;
  onOpenTranslationScenarioTest: () => void;
  testRunning: boolean;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{isZh ? "AI 模型工作台（本地 Agent）" : "AI Model Workbench (Local Agent)"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{isZh ? "Agent 列表" : "Agent Profiles"}</div>
            <div className="space-y-2">
              {profiles.map((profile) => {
                const active = profile.profileKey === selectedProfileKey;
                return (
                  <div key={profile.profileKey} className={`rounded-md border px-2 py-2 ${active ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
                    <button type="button" className="w-full text-left text-sm" onClick={() => onSelectProfile(profile.profileKey)}>
                      <div className="font-medium">{profile.profileKey}</div>
                      <div className="text-xs text-slate-500">{profile.executable || "-"}</div>
                    </button>
                    {!profile.isBuiltin ? (
                      <Button size="sm" variant="outline" className="mt-2 w-full text-red-600 hover:text-red-700" onClick={() => onDeleteProfile(profile.profileKey)}>
                        {isZh ? "删除" : "Delete"}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="space-y-2">
              <Input value={newProfileKey} onChange={(event) => onNewProfileKeyChange(event.currentTarget.value)} placeholder={isZh ? "新 profile key" : "New profile key"} />
              <Button variant="outline" className="w-full" onClick={onAddProfile}>{isZh ? "新增自定义 Agent" : "Add Custom Agent"}</Button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs text-slate-500">
                {isZh ? "名称" : "Name"}
                <Input value={profileName} onChange={(event) => onProfileNameChange(event.currentTarget.value)} />
              </label>
              <label className="block text-xs text-slate-500">
                {isZh ? "可执行程序" : "Executable"}
                <Input value={executable} onChange={(event) => onExecutableChange(event.currentTarget.value)} placeholder="codex / claude / custom-cli" />
              </label>
            </div>

            <label className="block text-xs text-slate-500">
              {isZh ? "参数模板（JSON 数组）" : "Args Template (JSON array)"}
              <Textarea value={argsTemplateText} onChange={(event) => onArgsTemplateTextChange(event.currentTarget.value)} rows={4} />
            </label>
            <Button onClick={onSaveProfile} disabled={loading}>{isZh ? "保存 Profile" : "Save Profile"}</Button>

            <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-medium text-slate-500">{isZh ? "场景设置" : "Scenario Settings"}</div>
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-900">{isZh ? "翻译场景" : "Translation Scenario"}</div>
                    <div className="text-xs text-slate-500">
                      {isZh ? "默认 Profile：" : "Default Profile: "}
                      <span className="font-medium text-slate-700">
                        {translationScenarioDefaultProfileKey || "-"}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {isZh ? "Prompt 翻译 / 双语处理使用该模板配置。" : "Used by Prompt translation / bilingual processing."}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={onOpenTranslationScenarioSettings}>
                      {isZh ? "设置" : "Settings"}
                    </Button>
                    <Button onClick={onOpenTranslationScenarioTest} disabled={testRunning}>
                      {testRunning ? (isZh ? "测试中..." : "Testing...") : (isZh ? "测试运行" : "Run Test")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
