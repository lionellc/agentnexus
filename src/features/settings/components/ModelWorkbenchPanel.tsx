import { Button, Card, Select, TextArea, Modal } from "@douyinfe/semi-ui-19";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Input } from "@douyinfe/semi-ui-19";

export type ModelProfileSourceType = "localAgent" | "api";

export type LocalAgentProfileItem = {
  profileKey: string;
  name: string;
  executable: string;
  argsTemplate: string[];
  isBuiltin: boolean;
  enabled: boolean;
  sourceType?: ModelProfileSourceType;
};

export function ModelWorkbenchPanel({
  isZh,
  loading,
  profiles,
  selectedProfileKey: _selectedProfileKey,
  onSelectProfile,
  onDeleteProfile,
  profileName,
  onProfileNameChange,
  executable,
  onExecutableChange,
  argsTemplateText,
  onArgsTemplateTextChange,
  onSaveProfile,
  newProfileName,
  onNewProfileNameChange,
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
  newProfileName: string;
  onNewProfileNameChange: (value: string) => void;
  onAddProfile: (sourceType: ModelProfileSourceType) => Promise<boolean> | boolean;
  translationScenarioDefaultProfileKey: string;
  onOpenTranslationScenarioSettings: () => void;
  onOpenTranslationScenarioTest: () => void;
  testRunning: boolean;
}) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createSourceType, setCreateSourceType] = useState<ModelProfileSourceType>("localAgent");
  const [editingProfileKey, setEditingProfileKey] = useState<string | null>(null);
  const editingProfile = profiles.find((item) => item.profileKey === editingProfileKey) ?? null;
  const editingSourceType = editingProfile?.sourceType ?? "localAgent";
  const sourceTypeOptions = [
    { value: "localAgent", label: isZh ? "本地 Agent" : "Local Agent" },
    { value: "api", label: "API" },
  ];
  const sourceLabel = (sourceType: ModelProfileSourceType | undefined): string => {
    if (sourceType === "api") {
      return "API";
    }
    return isZh ? "本地" : "Local";
  };
  const defaultProfile = profiles.find((item) => item.profileKey === translationScenarioDefaultProfileKey) ?? null;
  const defaultModelText = defaultProfile
    ? `${defaultProfile.name || defaultProfile.profileKey} (${sourceLabel(defaultProfile.sourceType)})`
    : translationScenarioDefaultProfileKey || "-";

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex flex-row items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{isZh ? "AI 模型配置" : "AI Model Settings"}</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {isZh ? "管理本地 Agent 模型与场景默认模型。" : "Manage local agent models and scenario defaults."}
            </p>
          </div>
          <Button
            htmlType="button"
            theme="solid"
            type="primary"
            onClick={() => {
              setCreateSourceType("localAgent");
              setCreateDialogOpen(true);
            }}
          >
            {isZh ? "新增模型" : "Add Model"}
          </Button>
        </div>
        <div className="space-y-4 text-sm">
          {profiles.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {isZh ? "暂无模型配置，请先新增一条。" : "No model profiles yet. Add one."}
            </div>
          ) : (
            <div className="space-y-3">
              {profiles.map((profile) => (
                <div
                  key={profile.profileKey}
                  data-testid={`model-profile-row-${profile.profileKey}`}
                  className="rounded-md border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950/30"
                >
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div className="grid gap-4 md:grid-cols-[minmax(140px,1fr)_140px_minmax(0,2fr)]">
                      <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <div>{isZh ? "名称" : "Name"}</div>
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{profile.name || "-"}</div>
                      </div>
                      <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <div>{isZh ? "来源" : "Source"}</div>
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{sourceLabel(profile.sourceType)}</div>
                      </div>
                      <div className="min-w-0 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <div>{isZh ? "可执行程序" : "Executable"}</div>
                        <div className="truncate font-mono text-sm text-slate-700 dark:text-slate-200">{profile.executable || "-"}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="tertiary"
                        data-testid={`model-profile-edit-${profile.profileKey}`}
                        onClick={() => {
                          onSelectProfile(profile.profileKey);
                          setEditingProfileKey(profile.profileKey);
                        }}
                      >
                        {isZh ? "编辑" : "Edit"}
                      </Button>
                      {!profile.isBuiltin ? (
                        <Button
                          type="danger"
                          aria-label={isZh ? "删除模型" : "Delete model"}
                          title={isZh ? "删除模型" : "Delete model"}
                          data-testid={`model-profile-delete-${profile.profileKey}`}
                          onClick={() => onDeleteProfile(profile.profileKey)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30">
            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{isZh ? "场景设置" : "Scenario Settings"}</div>
            <div className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{isZh ? "翻译场景" : "Translation Scenario"}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {isZh ? "默认模型：" : "Default Model: "}
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {defaultModelText}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {isZh ? "Prompt 翻译 / 双语处理使用该模板配置。" : "Used by Prompt translation / bilingual processing."}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="tertiary" onClick={onOpenTranslationScenarioSettings}>
                    {isZh ? "设置" : "Settings"}
                  </Button>
                  <Button type="tertiary" onClick={onOpenTranslationScenarioTest} disabled={testRunning}>
                    {testRunning ? (isZh ? "测试中..." : "Testing...") : (isZh ? "测试运行" : "Run Test")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Modal visible={createDialogOpen} onCancel={() => { setCreateDialogOpen(false); setCreateSourceType("localAgent"); }} footer={null} title={null} width={640}>
        <div className="space-y-6 px-1 pb-1 pt-1">
          <div className="pr-10">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{isZh ? "新增模型" : "Add Model"}</h2>
          </div>
          <div className="grid gap-5 text-sm">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{isZh ? "模型类型" : "Model Type"}</label>
              <Select
                className="max-w-md"
                value={createSourceType}
                onChange={(value) => setCreateSourceType(value as ModelProfileSourceType)}
                optionList={sourceTypeOptions}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{isZh ? "名称" : "Name"}</label>
              <Input
                value={newProfileName}
                onChange={(value) => onNewProfileNameChange(value)}
                placeholder={isZh ? "新模型名称" : "New model name"}
              />
            </div>
            {createSourceType === "api" ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                {isZh ? "API 模型暂未支持。" : "API model is not supported yet."}
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <Button htmlType="button" type="tertiary" onClick={() => setCreateDialogOpen(false)}>
              {isZh ? "取消" : "Cancel"}
            </Button>
            <Button
              htmlType="button"
              theme="solid"
              type="primary"
              onClick={async () => {
                const created = await Promise.resolve(onAddProfile(createSourceType));
                if (created) {
                  setCreateDialogOpen(false);
                  setCreateSourceType("localAgent");
                }
              }}
              disabled={loading || createSourceType === "api"}
            >
              {isZh ? "保存" : "Save"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal visible={Boolean(editingProfileKey)} onCancel={() => setEditingProfileKey(null)} footer={null} title={null} width={720}>
        <div className="space-y-6 px-1 pb-1 pt-1">
          <div className="pr-10">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{isZh ? "编辑模型" : "Edit Model"}</h2>
          </div>
          <div className="grid gap-5 text-sm">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{isZh ? "模型类型" : "Model Type"}</label>
              <Select className="max-w-md" value={editingSourceType} onChange={() => undefined} optionList={sourceTypeOptions} disabled />
            </div>
            {editingSourceType === "api" ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                {isZh ? "API 模型暂未支持。" : "API model is not supported yet."}
              </div>
            ) : null}
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{isZh ? "名称" : "Name"}</label>
              <Input value={profileName} onChange={(value) => onProfileNameChange(value)} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{isZh ? "可执行程序" : "Executable"}</label>
              <Input
                value={executable}
                onChange={(value) => onExecutableChange(value)}
                placeholder="codex / claude / custom-cli"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{isZh ? "参数模板（JSON 数组）" : "Args Template (JSON array)"}</label>
              <TextArea
                value={argsTemplateText}
                onChange={(value) => onArgsTemplateTextChange(value)}
                rows={4}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <Button
              htmlType="button"
              type="tertiary"
              onClick={() => setEditingProfileKey(null)}
              disabled={loading}
            >
              {isZh ? "取消" : "Cancel"}
            </Button>
            <Button
              htmlType="button"
              theme="solid"
              type="primary"
              onClick={() => {
                onSaveProfile();
                setEditingProfileKey(null);
              }}
              disabled={loading || editingSourceType === "api"}
            >
              {isZh ? "保存" : "Save"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
