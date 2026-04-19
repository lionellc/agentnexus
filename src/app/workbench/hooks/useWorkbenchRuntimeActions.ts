import { useCallback, useMemo } from "react";

import { isTauri } from "@tauri-apps/api/core";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

import { translationApi } from "../../../shared/services/api";

export function useWorkbenchRuntimeActions(args: any) {
  const {
    l,
    isZh,
    appUpdateStage,
    appUpdateVersion,
    appUpdateProgress,
    appUpdateError,
    setAppUpdateStage,
    setAppUpdateError,
    setAppUpdateVersion,
    setAppUpdateProgress,
    appUpdateRef,
    formatBytes,
    toast,
    unknownToMessage,
    setModelLoading,
    setLocalAgentProfiles,
    selectedModelProfileKey,
    setSelectedModelProfileKey,
    setTranslationDefaultProfileKey,
    setTranslationPromptTemplate,
  } = args;

  const loadModelWorkbenchData = useCallback(async (workspaceId: string) => {
    setModelLoading(true);
    try {
      const [profiles, config] = await Promise.all([
        translationApi.listProfiles(workspaceId),
        translationApi.getConfig(workspaceId),
      ]);
      setLocalAgentProfiles(profiles);
      setTranslationPromptTemplate(config.promptTemplate);
      setTranslationDefaultProfileKey(config.defaultProfileKey);

      const nextProfileKey =
        profiles.some((item: { profileKey: string }) => item.profileKey === selectedModelProfileKey)
          ? selectedModelProfileKey
          : profiles.some((item: { profileKey: string }) => item.profileKey === config.defaultProfileKey)
            ? config.defaultProfileKey
            : profiles[0]?.profileKey ?? "codex";
      setSelectedModelProfileKey(nextProfileKey);
    } catch (error) {
      toast({
        title: l("加载模型工作台失败", "Failed to load model workbench"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    } finally {
      setModelLoading(false);
    }
  }, [
    l,
    selectedModelProfileKey,
    setLocalAgentProfiles,
    setModelLoading,
    setSelectedModelProfileKey,
    setTranslationDefaultProfileKey,
    setTranslationPromptTemplate,
    toast,
    unknownToMessage,
  ]);

  const checkAppUpdates = useCallback(async (announceNoUpdate = true) => {
    if (!isTauri()) {
      toast({
        title: l("仅桌面端支持应用更新", "App updates are available only in desktop runtime"),
        variant: "destructive",
      });
      return;
    }

    const previousUpdate = appUpdateRef.current;
    appUpdateRef.current = null;
    if (previousUpdate) {
      try {
        await previousUpdate.close();
      } catch {
        // 忽略旧更新对象关闭失败
      }
    }

    let update: Update | null = null;
    try {
      setAppUpdateError("");
      setAppUpdateProgress(null);
      setAppUpdateStage("checking");
      update = await check();
      if (!update) {
        setAppUpdateVersion("");
        setAppUpdateStage(announceNoUpdate ? "latest" : "idle");
        return;
      }
      appUpdateRef.current = update;
      setAppUpdateVersion(update.version);
      setAppUpdateStage("available");
    } catch (error) {
      const message = unknownToMessage(error, l("检查更新失败", "Failed to check updates"));
      setAppUpdateError(message);
      setAppUpdateStage("error");
      toast({
        title: l("检查更新失败", "Failed to check updates"),
        description: message,
        variant: "destructive",
      });
    } finally {
      if (!appUpdateRef.current && update) {
        try {
          await update.close();
        } catch {
          // 忽略关闭失败
        }
      }
    }
  }, [
    appUpdateRef,
    l,
    setAppUpdateError,
    setAppUpdateProgress,
    setAppUpdateStage,
    setAppUpdateVersion,
    toast,
    unknownToMessage,
  ]);

  const installAppUpdate = useCallback(async () => {
    if (!isTauri()) {
      toast({
        title: l("仅桌面端支持应用更新", "App updates are available only in desktop runtime"),
        variant: "destructive",
      });
      return;
    }

    const update: Update | null = appUpdateRef.current;
    let currentUpdate = update;
    if (!currentUpdate) {
      await checkAppUpdates(false);
      currentUpdate = appUpdateRef.current;
      if (!currentUpdate) {
        return;
      }
    }

    setAppUpdateError("");
    try {
      setAppUpdateProgress({ downloadedBytes: 0 });
      setAppUpdateStage("downloading");
      await currentUpdate.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          setAppUpdateProgress({
            downloadedBytes: 0,
            totalBytes: event.data.contentLength,
          });
          return;
        }
        if (event.event === "Progress") {
          setAppUpdateProgress((prev: { downloadedBytes: number; totalBytes?: number | null } | null) => ({
            totalBytes: prev?.totalBytes,
            downloadedBytes: (prev?.downloadedBytes ?? 0) + event.data.chunkLength,
          }));
          return;
        }
        if (event.event === "Finished") {
          setAppUpdateStage("installing");
        }
      });

      setAppUpdateStage("restarting");
      await relaunch();
    } catch (error) {
      const message = unknownToMessage(error, l("安装更新失败", "Failed to install update"));
      setAppUpdateStage("error");
      setAppUpdateError(message);
      toast({
        title: l("安装更新失败", "Failed to install update"),
        description: message,
        variant: "destructive",
      });
    }
  }, [
    appUpdateRef,
    checkAppUpdates,
    l,
    setAppUpdateError,
    setAppUpdateProgress,
    setAppUpdateStage,
    toast,
    unknownToMessage,
  ]);

  const appUpdateStatusText = useMemo(() => {
    if (appUpdateStage === "checking") {
      return l("正在检查更新...", "Checking for updates...");
    }
    if (appUpdateStage === "available") {
      return l(`发现新版本 v${appUpdateVersion}`, `New version v${appUpdateVersion} is available`);
    }
    if (appUpdateStage === "downloading") {
      const downloaded = appUpdateProgress?.downloadedBytes ?? 0;
      const total = appUpdateProgress?.totalBytes;
      if (total && total > 0) {
        const percent = Math.min(100, Math.round((downloaded / total) * 100));
        return l(
          `正在下载更新... ${percent}% (${formatBytes(downloaded)} / ${formatBytes(total)})`,
          `Downloading update... ${percent}% (${formatBytes(downloaded)} / ${formatBytes(total)})`,
        );
      }
      return l(`正在下载更新... (${formatBytes(downloaded)})`, `Downloading update... (${formatBytes(downloaded)})`);
    }
    if (appUpdateStage === "installing") {
      return l("正在安装更新...", "Installing update...");
    }
    if (appUpdateStage === "restarting") {
      return l("安装完成，正在重启应用...", "Update installed, restarting app...");
    }
    if (appUpdateStage === "latest") {
      return l("当前已是最新版本", "You are on the latest version");
    }
    if (appUpdateStage === "error") {
      return appUpdateError || l("更新失败", "Update failed");
    }
    return l("启动时会自动检查更新，也可手动检查。", "App checks for updates on startup, and supports manual checks.");
  }, [appUpdateError, appUpdateProgress, appUpdateStage, appUpdateVersion, isZh, l, formatBytes]);

  return {
    appUpdateStatusText,
    loadModelWorkbenchData,
    checkAppUpdates,
    installAppUpdate,
  };
}
