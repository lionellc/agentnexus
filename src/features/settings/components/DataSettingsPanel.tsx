import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "../../../shared/ui";

export type SkillScanDirectoryItem = {
  path: string;
  selected: boolean;
  source: "default" | "custom";
};

export type DataSettingsPanelProps = {
  l: (zh: string, en: string) => string;
  storageDirDraft: string;
  activeWorkspaceRootPath: string | null;
  defaultSkillScanSuffixes: readonly string[];
  skillScanDirectories: SkillScanDirectoryItem[];
  skillScanDirInput: string;
  onStorageDirDraftChange: (value: string) => void;
  onSaveStorageDirectory: () => void;
  onUseDefaultStorageDirectory: () => void;
  onOpenStorageDirectoryInFinder: () => void;
  onToggleSkillScanDirectory: (path: string, checked: boolean) => void;
  onRemoveSkillScanDirectory: (path: string) => void;
  onSkillScanDirInputChange: (value: string) => void;
  onAddSkillScanDirectory: () => void;
};

export function DataSettingsPanel({
  l,
  storageDirDraft,
  activeWorkspaceRootPath,
  defaultSkillScanSuffixes,
  skillScanDirectories,
  skillScanDirInput,
  onStorageDirDraftChange,
  onSaveStorageDirectory,
  onUseDefaultStorageDirectory,
  onOpenStorageDirectoryInFinder,
  onToggleSkillScanDirectory,
  onRemoveSkillScanDirectory,
  onSkillScanDirInputChange,
  onAddSkillScanDirectory,
}: DataSettingsPanelProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{l("存储位置", "Storage")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="text-xs text-slate-500">
            {l(
              "应用首次启动会自动初始化默认目录；你也可以手动改为其它绝对路径。",
              "The app initializes a default directory on first launch. You can also set another absolute path.",
            )}
          </div>
          <label className="block text-xs text-slate-500">
            {l("目录路径（绝对路径）", "Directory Path (Absolute)")}
            <Input
              value={storageDirDraft}
              onChange={(event) => onStorageDirDraftChange(event.currentTarget.value)}
              placeholder="/Users/you/Library/Application Support/agentnexus"
            />
          </label>
          <div className="text-xs text-slate-500">
            {l("当前项目目录：", "Current Project Directory: ")}
            {activeWorkspaceRootPath ?? "-"}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onSaveStorageDirectory}>{l("保存目录", "Save")}</Button>
            <Button variant="outline" onClick={onUseDefaultStorageDirectory}>
              {l("使用默认目录", "Use Default")}
            </Button>
            <Button variant="outline" onClick={onOpenStorageDirectoryInFinder}>
              {l("在 Finder 中打开", "Open in Finder")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{l("Skills 扫描目录", "Skill Scan Directories")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="text-xs text-slate-500">
            {l("默认目录：", "Default Directories: ")}
            {defaultSkillScanSuffixes.map((name) => `~/${name}`).join(" / ")}
          </div>
          <div className="space-y-2">
            {skillScanDirectories.length === 0 ? (
              <div className="text-xs text-slate-500">{l("暂无可用扫描目录", "No scan directory available")}</div>
            ) : (
              skillScanDirectories.map((item) => (
                <div
                  key={`skill-scan-dir-${item.path}`}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 px-3 py-2"
                >
                  <label className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={(event) => onToggleSkillScanDirectory(item.path, event.currentTarget.checked)}
                    />
                    <span className="truncate text-xs text-slate-700">{item.path}</span>
                  </label>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                    {item.source === "default" ? l("默认", "Default") : l("自定义", "Custom")}
                  </span>
                  {item.source === "custom" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => onRemoveSkillScanDirectory(item.path)}
                    >
                      {l("删除", "Delete")}
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Input
              value={skillScanDirInput}
              onChange={(event) => onSkillScanDirInputChange(event.currentTarget.value)}
              placeholder="/Users/you/.custom-skill-dir"
              className="min-w-[260px] flex-1"
            />
            <Button variant="outline" onClick={onAddSkillScanDirectory}>
              {l("添加目录", "Add Directory")}
            </Button>
          </div>

          <div className="text-xs text-slate-500">
            {l(
              "Skills Tab 扫描时会按已勾选目录递归查找 `SKILL.md`。",
              "Skills tab scans selected directories recursively for `SKILL.md`.",
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
