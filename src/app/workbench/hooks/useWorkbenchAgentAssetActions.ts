import type { WorkbenchToastOptions } from "../types";
import type {
  AgentRuleAsset,
  AgentRuleVersion,
} from "../../../shared/stores/agentRulesStore/types";

type AgentAssetActionsInput = {
  activeWorkspaceId: string | null;
  projectBootingMessage: string;
  selectedAssetId: string | null;
  selectedAgentAsset: AgentRuleAsset | null;
  creatingAgentAsset: boolean;
  agentAssetNameInput: string;
  agentEditorContent: string;
  setCreatingAgentAsset: (value: boolean) => void;
  setSelectedAssetId: (assetId: string | null) => void;
  setAgentRuleEditorModalOpen: (value: boolean) => void;
  setDeleteConfirmAssetId: (assetId: string | null) => void;
  createAgentAsset: (
    workspaceId: string,
    name: string,
    content: string,
  ) => Promise<AgentRuleAsset>;
  renameAgentAsset: (
    workspaceId: string,
    assetId: string,
    name: string,
  ) => Promise<AgentRuleAsset>;
  deleteAgentAsset: (workspaceId: string, assetId: string) => Promise<void>;
  publishAgentVersion: (
    assetId: string,
    content: string,
  ) => Promise<AgentRuleVersion>;
  l: (zh: string, en: string) => string;
  toast: (options: WorkbenchToastOptions) => string;
};

export function createWorkbenchAgentAssetActions({
  activeWorkspaceId,
  projectBootingMessage,
  selectedAssetId,
  selectedAgentAsset,
  creatingAgentAsset,
  agentAssetNameInput,
  agentEditorContent,
  setCreatingAgentAsset,
  setSelectedAssetId,
  setAgentRuleEditorModalOpen,
  setDeleteConfirmAssetId,
  createAgentAsset,
  renameAgentAsset,
  deleteAgentAsset,
  publishAgentVersion,
  l,
  toast,
}: AgentAssetActionsInput) {
  async function handleDeleteAgentRuleAsset(assetId: string, assetName: string) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    try {
      await deleteAgentAsset(activeWorkspaceId, assetId);
      setDeleteConfirmAssetId(null);
      if (selectedAssetId === assetId) {
        setAgentRuleEditorModalOpen(false);
      }
      toast({
        title: l("删除成功", "Deleted"),
        description: l(`${assetName} 已删除`, `${assetName} deleted`),
      });
    } catch (error) {
      toast({
        title: l("删除失败", "Delete failed"),
        description:
          error instanceof Error
            ? error.message
            : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleSaveAgentRuleVersion() {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const nextTitle = agentAssetNameInput.trim();
    if (!nextTitle) {
      toast({
        title: l("请输入规则文件名称", "Please enter a rule file name"),
        variant: "destructive",
      });
      return;
    }
    try {
      if (!selectedAgentAsset || creatingAgentAsset) {
        const created = await createAgentAsset(
          activeWorkspaceId,
          nextTitle,
          agentEditorContent,
        );
        setCreatingAgentAsset(false);
        setSelectedAssetId(created.id);
        setAgentRuleEditorModalOpen(false);
        toast({
          title: l("规则文件已创建", "Rule file created"),
          description: l(
            `${created.name} 已创建并生成首个版本`,
            `${created.name} created with the first version`,
          ),
        });
        return;
      }
      if (nextTitle !== selectedAgentAsset.name) {
        await renameAgentAsset(
          activeWorkspaceId,
          selectedAgentAsset.id,
          nextTitle,
        );
      }
      const version = await publishAgentVersion(
        selectedAgentAsset.id,
        agentEditorContent,
      );
      toast({
        title: l("保存成功", "Saved"),
        description: l(
          `${nextTitle} 已生成版本 ${version.version}`,
          `${nextTitle} generated version ${version.version}`,
        ),
      });
    } catch (error) {
      toast({
        title: l("保存失败", "Save failed"),
        description:
          error instanceof Error
            ? error.message
            : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  return {
    handleDeleteAgentRuleAsset,
    handleSaveAgentRuleVersion,
  };
}
