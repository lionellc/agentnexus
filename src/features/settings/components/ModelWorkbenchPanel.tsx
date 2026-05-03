import { useState } from "react";
import { Input } from "@douyinfe/semi-ui-19";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DeleteIconButton,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  FormFieldset,
  FormLabel,
  Select,
  Textarea,
} from "../../../shared/ui";

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
  ] as const;
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{isZh ? "AI 模型配置" : "AI Model Settings"}</CardTitle>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setCreateSourceType("localAgent");
              setCreateDialogOpen(true);
            }}
          >
            {isZh ? "新增模型" : "Add Model"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {profiles.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500">
              {isZh ? "暂无模型配置，请先新增一条。" : "No model profiles yet. Add one."}
            </div>
          ) : (
            <div className="space-y-2">
              {profiles.map((profile) => (
                <div
                  key={profile.profileKey}
                  data-testid={`model-profile-row-${profile.profileKey}`}
                  className="rounded-md border border-slate-200 bg-white px-3 py-3"
                >
                  <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                    <div className="grid gap-2 md:grid-cols-3">
                      <div className="text-xs text-slate-500">
                        <div>{isZh ? "名称" : "Name"}</div>
                        <div className="font-medium text-slate-800">{profile.name || "-"}</div>
                      </div>
                      <div className="text-xs text-slate-500">
                        <div>{isZh ? "来源" : "Source"}</div>
                        <div className="font-medium text-slate-800">{sourceLabel(profile.sourceType)}</div>
                      </div>
                      <div className="min-w-0 text-xs text-slate-500">
                        <div>{isZh ? "可执行程序" : "Executable"}</div>
                        <div className="truncate font-mono text-slate-700">{profile.executable || "-"}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`model-profile-edit-${profile.profileKey}`}
                        onClick={() => {
                          onSelectProfile(profile.profileKey);
                          setEditingProfileKey(profile.profileKey);
                        }}
                      >
                        {isZh ? "编辑" : "Edit"}
                      </Button>
                      {!profile.isBuiltin ? (
                        <DeleteIconButton
                          size="sm"
                          variant="outline"
                          label={isZh ? "删除模型" : "Delete model"}
                          data-testid={`model-profile-delete-${profile.profileKey}`}
                          onClick={() => onDeleteProfile(profile.profileKey)}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-medium text-slate-500">{isZh ? "场景设置" : "Scenario Settings"}</div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-900">{isZh ? "翻译场景" : "Translation Scenario"}</div>
                  <div className="text-xs text-slate-500">
                    {isZh ? "默认模型：" : "Default Model: "}
                    <span className="font-medium text-slate-700">
                      {defaultModelText}
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
        </CardContent>
      </Card>

      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) {
            setCreateSourceType("localAgent");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isZh ? "新增模型" : "Add Model"}</DialogTitle>
          </DialogHeader>
          <FormFieldset className="space-y-3 text-sm">
            <FormField>
              <FormLabel>{isZh ? "模型类型" : "Model Type"}</FormLabel>
              <Select
                value={createSourceType}
                onChange={(value) => setCreateSourceType(value as ModelProfileSourceType)}
                options={sourceTypeOptions}
              />
            </FormField>
            <FormField>
              <FormLabel>{isZh ? "名称" : "Name"}</FormLabel>
              <Input
                value={newProfileName}
                onChange={(value) => onNewProfileNameChange(value)}
                placeholder={isZh ? "新模型名称" : "New model name"}
              />
            </FormField>
            {createSourceType === "api" ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {isZh ? "API 模型暂未支持。" : "API model is not supported yet."}
              </div>
            ) : null}
          </FormFieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
              {isZh ? "取消" : "Cancel"}
            </Button>
            <Button
              type="button"
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingProfileKey)}
        onOpenChange={(open) => {
          if (open) {
            return;
          }
          setEditingProfileKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isZh ? "编辑模型" : "Edit Model"}</DialogTitle>
          </DialogHeader>
          <FormFieldset className="space-y-3 text-sm">
            <FormField>
              <FormLabel>{isZh ? "模型类型" : "Model Type"}</FormLabel>
              <Select value={editingSourceType} onChange={() => undefined} options={sourceTypeOptions} disabled />
            </FormField>
            {editingSourceType === "api" ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {isZh ? "API 模型暂未支持。" : "API model is not supported yet."}
              </div>
            ) : null}
            <FormField>
              <FormLabel>{isZh ? "名称" : "Name"}</FormLabel>
              <Input value={profileName} onChange={(value) => onProfileNameChange(value)} />
            </FormField>
            <FormField>
              <FormLabel>{isZh ? "可执行程序" : "Executable"}</FormLabel>
              <Input
                value={executable}
                onChange={(value) => onExecutableChange(value)}
                placeholder="codex / claude / custom-cli"
              />
            </FormField>
            <FormField>
              <FormLabel>{isZh ? "参数模板（JSON 数组）" : "Args Template (JSON array)"}</FormLabel>
              <Textarea
                value={argsTemplateText}
                onChange={(event) => onArgsTemplateTextChange(event.currentTarget.value)}
                rows={4}
              />
            </FormField>
          </FormFieldset>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingProfileKey(null)}
              disabled={loading}
            >
              {isZh ? "取消" : "Cancel"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                onSaveProfile();
                setEditingProfileKey(null);
              }}
              disabled={loading || editingSourceType === "api"}
            >
              {isZh ? "保存" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
