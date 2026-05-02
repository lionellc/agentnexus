import { Button, Card, CardContent, CardHeader, CardTitle } from "../../../shared/ui";

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
        <CardHeader>
          <CardTitle>{l("关于", "About")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
            <span className="text-slate-500">{l("应用版本", "App Version")}</span>
            <code className="text-slate-800 dark:text-slate-100">{appVersion}</code>
          </div>
          <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-slate-500">{l("应用更新", "App Updates")}</div>
            <div className={`text-sm ${appUpdateStage === "error" ? "text-red-600" : "text-slate-700 dark:text-slate-200"}`}>
              {appUpdateStatusText}
            </div>
            {appUpdateStage === "error" && appUpdateError ? (
              <div className="text-xs text-red-600">{appUpdateError}</div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
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
                <Button onClick={onInstallAppUpdate}>{l("下载并安装", "Download and Install")}</Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
