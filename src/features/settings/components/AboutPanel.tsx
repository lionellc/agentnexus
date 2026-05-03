import { Button, Card } from "@douyinfe/semi-ui-19";
export type AboutPanelUpdateStage =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "restarting"
  | "latest"
  | "error";

export type AboutPanelProps = {
  l: (zh: string, en: string) => string;
  appVersion: string;
  appUpdateStage: AboutPanelUpdateStage;
  appUpdateStatusText: string;
  appUpdateError: string;
  onCheckAppUpdates: () => void;
  onInstallAppUpdate: () => void;
};

export function AboutPanel({
  l,
  appVersion,
  appUpdateStage,
  appUpdateStatusText,
  appUpdateError,
  onCheckAppUpdates,
  onInstallAppUpdate,
}: AboutPanelProps) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{l("关于", "About")}</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {l("查看当前版本，并管理应用更新。", "View the current version and manage app updates.")}
          </p>
        </div>
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30">
            <span className="text-slate-500 dark:text-slate-400">{l("应用版本", "App Version")}</span>
            <code className="font-mono text-sm text-slate-800 dark:text-slate-100">{appVersion}</code>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{l("应用更新", "App Updates")}</div>
                <div className={`text-sm ${appUpdateStage === "error" ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>
                  {appUpdateStatusText}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="tertiary"
                  disabled={
                    appUpdateStage === "checking" ||
                    appUpdateStage === "downloading" ||
                    appUpdateStage === "installing" ||
                    appUpdateStage === "restarting"
                  }
                  onClick={onCheckAppUpdates}
                >
                  {appUpdateStage === "checking"
                    ? l("检查中...", "Checking...")
                    : l("检查更新", "Check for Updates")}
                </Button>
                {appUpdateStage === "available" ? (
                  <Button theme="solid" type="primary" onClick={onInstallAppUpdate}>{l("下载并安装", "Download and Install")}</Button>
                ) : null}
              </div>
            </div>
            {appUpdateStage === "error" && appUpdateError ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{appUpdateError}</div>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
