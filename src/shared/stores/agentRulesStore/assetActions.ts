import {
  EMPTY_DRAFT,
  callAgentApi,
  isAgentDocNotFound,
  message,
  normalizeAsset,
  normalizeVersion,
  toErrorMessage,
  toLegacyRelease,
} from "./normalizers";
import type {
  AgentRulesState,
  AgentRulesStoreGet,
  AgentRulesStoreSet,
} from "./types";

type AgentRuleAssetActions = Pick<
  AgentRulesState,
  | "loadAssets"
  | "createAsset"
  | "renameAsset"
  | "deleteAsset"
  | "publishVersion"
  | "loadVersions"
  | "rollbackVersion"
  | "loadDraft"
  | "saveDraft"
  | "loadReleases"
  | "createRelease"
  | "rollbackRelease"
  | "setSelectedAssetId"
  | "setSelectedReleaseVersion"
>;

export function createAgentRuleAssetActions(
  set: AgentRulesStoreSet,
  get: AgentRulesStoreGet,
): AgentRuleAssetActions {
  return {
    loadAssets: async (workspaceId) => {
      set({ loadingAssets: true, loadingReleases: true, lastActionError: null });
      try {
        const list = await callAgentApi<unknown[]>(["listAssets", "assetList"], workspaceId);
        const assets = (Array.isArray(list) ? list : []).map((item) =>
          normalizeAsset((item ?? {}) as Record<string, unknown>),
        );
        const selectedAssetId = get().selectedAssetId ?? assets[0]?.id ?? null;
        const releases = assets.map(toLegacyRelease);
        const selectedReleaseVersion = get().selectedReleaseVersion ?? releases[0]?.version ?? null;
        const tagsByAsset = assets.reduce<Record<string, NonNullable<(typeof assets)[number]["tags"]>>>(
          (acc, asset) => {
            acc[asset.id] = asset.tags ?? [];
            return acc;
          },
          {},
        );
        set({ assets, tagsByAsset, selectedAssetId, releases, selectedReleaseVersion });

        const selected = assets.find((item) => item.id === selectedAssetId) ?? assets[0];
        if (selected) {
          set({
            draft: {
              content: selected.latestContent ?? "",
              contentHash: selected.latestContentHash ?? "",
              updatedAt: selected.updatedAt ?? "",
            },
          });
        }
      } catch (error) {
        set({ lastActionError: toErrorMessage(error) });
        throw error;
      } finally {
        set({ loadingAssets: false, loadingReleases: false });
      }
    },

    createAsset: async (workspaceId, name, content) => {
      set({ lastActionError: null });
      try {
        const created = normalizeAsset(
          (await callAgentApi<Record<string, unknown>>(["createAsset", "assetCreate"], {
            workspaceId,
            name,
            content,
          })) ?? {},
        );
        set((state) => {
          const assets = [created, ...state.assets.filter((item) => item.id !== created.id)];
          const releases = assets.map(toLegacyRelease);
          return {
            assets,
            releases,
            selectedAssetId: created.id,
            selectedReleaseVersion: created.latestVersion ?? state.selectedReleaseVersion,
            draft: {
              content: created.latestContent ?? content,
              contentHash: created.latestContentHash ?? "",
              updatedAt: created.updatedAt ?? "",
            },
            tagsByAsset: {
              ...state.tagsByAsset,
              [created.id]: created.tags ?? [],
            },
          };
        });
        return created;
      } catch (error) {
        set({ lastActionError: toErrorMessage(error) });
        throw error;
      }
    },

    renameAsset: async (workspaceId, assetId, name) => {
      set({ lastActionError: null });
      try {
        const renamed = normalizeAsset(
          (await callAgentApi<Record<string, unknown>>(["renameAsset", "assetRename"], {
            workspaceId,
            assetId,
            name,
          })) ?? {},
        );
        set((state) => {
          const assets = state.assets.map((item) => (item.id === assetId ? { ...item, ...renamed } : item));
          const releases = assets.map(toLegacyRelease);
          return {
            assets,
            releases,
          };
        });
        return renamed;
      } catch (error) {
        set({ lastActionError: toErrorMessage(error) });
        throw error;
      }
    },

    deleteAsset: async (workspaceId, assetId) => {
      set({ lastActionError: null });
      try {
        await callAgentApi<void>(["deleteAsset", "assetDelete"], {
          workspaceId,
          assetId,
        });
        set((state) => {
          const assets = state.assets.filter((item) => item.id !== assetId);
          const releases = assets.map(toLegacyRelease);
          const nextSelectedAssetId =
            state.selectedAssetId === assetId ? (assets[0]?.id ?? null) : state.selectedAssetId;
          const nextSelectedAsset = assets.find((item) => item.id === nextSelectedAssetId) ?? null;
          const { [assetId]: _removedTags, ...tagsByAsset } = state.tagsByAsset;
          const { [assetId]: _removedVersions, ...versionsByAsset } = state.versionsByAsset;
          return {
            assets,
            releases,
            tagsByAsset,
            versionsByAsset,
            selectedAssetId: nextSelectedAssetId,
            selectedReleaseVersion: nextSelectedAsset?.latestVersion ?? releases[0]?.version ?? null,
            draft: nextSelectedAsset
              ? {
                  content: nextSelectedAsset.latestContent ?? "",
                  contentHash: nextSelectedAsset.latestContentHash ?? "",
                  updatedAt: nextSelectedAsset.updatedAt ?? "",
                }
              : EMPTY_DRAFT,
          };
        });
      } catch (error) {
        set({ lastActionError: toErrorMessage(error) });
        throw error;
      }
    },

    publishVersion: async (assetId, content) => {
      set({ lastActionError: null });
      try {
        const version = normalizeVersion(
          assetId,
          (await callAgentApi<Record<string, unknown>>(["publishVersion", "assetPublishVersion"], {
            assetId,
            content,
          })) ?? {},
        );
        set((state) => {
          const versions = [
            version,
            ...(state.versionsByAsset[assetId] ?? []).filter((item) => item.version !== version.version),
          ];
          const nextVersions = { ...state.versionsByAsset, [assetId]: versions };
          const assets = state.assets.map((asset) =>
            asset.id === assetId
              ? {
                  ...asset,
                  latestVersion: version.version,
                  latestContent: version.content ?? content,
                  latestContentHash: version.contentHash ?? asset.latestContentHash,
                  updatedAt: version.createdAt ?? asset.updatedAt,
                }
              : asset,
          );
          const releases = assets.map(toLegacyRelease);
          return {
            versionsByAsset: nextVersions,
            assets,
            releases,
            selectedReleaseVersion:
              state.selectedAssetId === assetId ? version.version : state.selectedReleaseVersion,
            draft:
              state.selectedAssetId === assetId
                ? {
                    content: version.content ?? content,
                    contentHash: version.contentHash ?? "",
                    updatedAt: version.createdAt ?? "",
                  }
                : state.draft,
          };
        });
        return version;
      } catch (error) {
        set({ lastActionError: toErrorMessage(error) });
        throw error;
      }
    },

    loadVersions: async (assetId) => {
      set({ loadingVersions: true, lastActionError: null });
      try {
        const list = await callAgentApi<unknown[]>(["listVersions", "assetListVersions"], assetId);
        const versions = (Array.isArray(list) ? list : []).map((item) =>
          normalizeVersion(assetId, (item ?? {}) as Record<string, unknown>),
        );
        set((state) => ({ versionsByAsset: { ...state.versionsByAsset, [assetId]: versions } }));
      } catch (error) {
        set({ lastActionError: toErrorMessage(error) });
        throw error;
      } finally {
        set({ loadingVersions: false });
      }
    },

    rollbackVersion: async (assetId, version) => {
      set({ lastActionError: null });
      try {
        const rolled = normalizeVersion(
          assetId,
          (await callAgentApi<Record<string, unknown>>(["rollbackVersion", "assetRollbackVersion"], {
            assetId,
            version,
          })) ?? {},
        );
        await get().loadVersions(assetId);
        set((state) => {
          const assets = state.assets.map((asset) =>
            asset.id === assetId
              ? {
                  ...asset,
                  latestVersion: rolled.version,
                  latestContent: rolled.content ?? asset.latestContent,
                  latestContentHash: rolled.contentHash ?? asset.latestContentHash,
                  updatedAt: rolled.createdAt ?? asset.updatedAt,
                }
              : asset,
          );
          const releases = assets.map(toLegacyRelease);
          return {
            assets,
            releases,
            selectedReleaseVersion:
              state.selectedAssetId === assetId ? rolled.version : state.selectedReleaseVersion,
          };
        });
        return rolled;
      } catch (error) {
        set({ lastActionError: toErrorMessage(error) });
        throw error;
      }
    },

    loadDraft: async (workspaceId) => {
      try {
        await get().loadAssets(workspaceId);
      } catch (error) {
        if (isAgentDocNotFound(error)) {
          set({ draft: EMPTY_DRAFT });
          return;
        }
        set({ lastActionError: toErrorMessage(error) });
      }
    },

    saveDraft: async (workspaceId, content) => {
      set({ savingDraft: true, lastActionError: null });
      try {
        const selectedAssetId = get().selectedAssetId;
        if (!selectedAssetId) {
          const created = await get().createAsset(workspaceId, message("未命名规则", "Untitled Rule"), content);
          set({ selectedAssetId: created.id });
        } else {
          await get().publishVersion(selectedAssetId, content);
        }
      } catch (error) {
        set({ lastActionError: toErrorMessage(error) });
        throw error;
      } finally {
        set({ savingDraft: false });
      }
    },

    loadReleases: async (workspaceId) => {
      await get().loadAssets(workspaceId);
    },

    createRelease: async ({ workspaceId, title, notes }) => {
      const state = get();
      const content = state.draft.content || "";
      if (state.selectedAssetId) {
        const version = await state.publishVersion(state.selectedAssetId, content || notes || "");
        const asset = get().assets.find((item) => item.id === state.selectedAssetId) ?? state.assets[0];
        return {
          id: state.selectedAssetId,
          workspaceId,
          version: version.version,
          title: asset?.name ?? title,
          notes: notes ?? "",
          contentHash: version.contentHash ?? "",
          active: true,
          createdAt: version.createdAt ?? "",
        };
      }

      const created = await get().createAsset(workspaceId, title, content || notes || "");
      return toLegacyRelease(created);
    },

    rollbackRelease: async ({ workspaceId, releaseVersion }) => {
      const assetId = get().selectedAssetId;
      if (!assetId) {
        throw new Error(message("未选择规则资产", "No rule asset selected"));
      }
      const rolled = await get().rollbackVersion(assetId, releaseVersion);
      return {
        id: assetId,
        workspaceId,
        version: rolled.version,
        title: get().assets.find((item) => item.id === assetId)?.name ?? "",
        notes: "",
        contentHash: rolled.contentHash ?? "",
        active: true,
        createdAt: rolled.createdAt ?? "",
      };
    },

    setSelectedAssetId: (selectedAssetId) => {
      const state = get();
      const selected = state.assets.find((item) => item.id === selectedAssetId);
      set({
        selectedAssetId,
        selectedReleaseVersion: selected?.latestVersion ?? state.selectedReleaseVersion,
        draft: selected
          ? {
              content: selected.latestContent ?? "",
              contentHash: selected.latestContentHash ?? "",
              updatedAt: selected.updatedAt ?? "",
            }
          : state.draft,
      });
    },

    setSelectedReleaseVersion: (selectedReleaseVersion) => set({ selectedReleaseVersion }),
  };
}
