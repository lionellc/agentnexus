import { Button, Empty, Input, Modal, Select, Table, Tag, TextArea } from "@douyinfe/semi-ui-19";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ChannelApiTestCase, ChannelApiTestCategory, ChannelApiTestCaseUpsertInput } from "../../../shared/types";
import { categoryLabel } from "../utils/format";

type Draft = {
  id?: string;
  category: ChannelApiTestCategory;
  label: string;
  content: string;
};

type ChannelTestCaseManagerProps = {
  cases: ChannelApiTestCase[];
  loading: boolean;
  l: (zh: string, en: string) => string;
  onBack: () => void;
  onSave: (input: Omit<ChannelApiTestCaseUpsertInput, "workspaceId">) => Promise<void>;
  onDelete: (caseId: string) => Promise<void>;
};

type TableColumn = {
  title: string;
  dataIndex: string;
  width?: number;
  render?: (_value: unknown, record: ChannelApiTestCase) => ReactNode;
};

const emptyDraft: Draft = {
  category: "small",
  label: "",
  content: "",
};

export function ChannelTestCaseManager({ cases, loading, l, onBack, onSave, onDelete }: ChannelTestCaseManagerProps) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editorOpen, setEditorOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSave = draft.label.trim() !== "" && draft.content.trim() !== "";
  const pagedCases = useMemo(() => {
    const start = (page - 1) * pageSize;
    return cases.slice(start, start + pageSize);
  }, [cases, page, pageSize]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(cases.length / pageSize));
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [cases.length, page, pageSize]);

  const columns: TableColumn[] = [
    {
      title: l("题目", "Case"),
      dataIndex: "label",
      render: (_value, record) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{record.label}</span>
          <div className="flex flex-wrap gap-1">
            <Tag>{l(categoryLabel(record.category), categoryEnglishLabel(record.category))}</Tag>
          </div>
        </div>
      ),
    },
    {
      title: l("内容", "Content"),
      dataIndex: "content",
      render: (_value, record) => <span className="text-sm text-muted-foreground">{casePreview(record)}</span>,
    },
    {
      title: l("操作", "Actions"),
      dataIndex: "actions",
      width: 180,
      render: (_value, record) => (
        <div className="flex gap-2">
          <Button size="small" onClick={() => openEditor(record)}>
            {l("编辑", "Edit")}
          </Button>
          <Button
            size="small"
            type="danger"
            loading={deletingId === record.id}
            onClick={() => deleteCase(record.id)}
          >
            {l("删除", "Delete")}
          </Button>
        </div>
      ),
    },
  ];

  async function saveDraft() {
    if (!canSave) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(buildInput(draft));
      closeEditor();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存题目失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCase(caseId: string) {
    setDeletingId(caseId);
    setError(null);
    try {
      await onDelete(caseId);
      if (draft.id === caseId) {
        closeEditor();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除题目失败");
    } finally {
      setDeletingId(null);
    }
  }

  function openEditor(testCase?: ChannelApiTestCase) {
    setDraft(testCase ? draftFromCase(testCase) : emptyDraft);
    setError(null);
    setEditorOpen(true);
  }

  function closeEditor() {
    setDraft(emptyDraft);
    setError(null);
    setEditorOpen(false);
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{l("题库管理", "Case Library")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {l(
              "管理渠道 API 测试台的全部题目；初始化默认题也在这里维护。",
              "Manage all cases for the channel API testbench, including the seeded defaults.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button theme="solid" type="primary" onClick={() => openEditor()}>
            {l("新增题目", "New Case")}
          </Button>
          <Button onClick={onBack}>{l("返回测试台", "Back to Testbench")}</Button>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-4">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={pagedCases}
          loading={loading}
          empty={<Empty title={l("暂无题目", "No cases")} description={l("新增题目后会出现在测试台的题目下拉中", "New cases will appear in the testbench selector.")} />}
          pagination={{
            currentPage: page,
            pageSize,
            total: cases.length,
            showSizeChanger: true,
            onPageChange: (nextPage) => setPage(nextPage),
            onPageSizeChange: (nextPageSize) => {
              setPage(1);
              setPageSize(nextPageSize);
            },
          }}
        />
      </section>

      <Modal
        title={draft.id ? l("编辑题目", "Edit Case") : l("新增题目", "New Case")}
        visible={editorOpen}
        onCancel={closeEditor}
        onOk={saveDraft}
        confirmLoading={saving}
        okButtonProps={{ disabled: !canSave }}
        okText={l("保存", "Save")}
        cancelText={l("取消", "Cancel")}
        maskClosable={!saving}
      >
        <div className="space-y-4 text-foreground">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{l("题型", "Case Type")}</span>
            <Select
              value={draft.category}
              className="w-full"
              optionList={[
                { label: l("小请求", "Small Request"), value: "small" },
                { label: l("中等请求", "Medium Request"), value: "medium" },
                { label: l("大请求", "Large Request"), value: "large" },
                { label: l("连续追问型", "Follow-up"), value: "followup" },
              ]}
              onChange={(value) => setDraft((current) => ({ ...current, category: value as ChannelApiTestCategory }))}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{l("题目名称", "Case Name")}</span>
            <Input
              value={draft.label}
              placeholder={l("例如：短答一致性", "Example: short-answer consistency")}
              onChange={(value) => setDraft((current) => ({ ...current, label: value }))}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">
              {draft.category === "followup" ? l("追问内容", "Follow-up Prompts") : l("请求内容", "Prompt")}
            </span>
            <TextArea
              value={draft.content}
              rows={draft.category === "followup" ? 6 : 5}
              placeholder={draft.category === "followup" ? l("每行一个追问", "One follow-up prompt per line") : l("输入本题的 user prompt", "Enter the user prompt for this case")}
              onChange={(value: string) => setDraft((current) => ({ ...current, content: value }))}
            />
          </label>
          {error ? <div className="text-sm text-destructive">{error}</div> : null}
        </div>
      </Modal>
    </section>
  );
}

function categoryEnglishLabel(category: ChannelApiTestCategory) {
  switch (category) {
    case "small":
      return "Small Request";
    case "medium":
      return "Medium Request";
    case "large":
      return "Large Request";
    case "followup":
      return "Follow-up";
    default:
      return category;
  }
}

function draftFromCase(testCase: ChannelApiTestCase): Draft {
  return {
    id: testCase.id,
    category: testCase.category,
    label: testCase.label,
    content: testCase.rounds?.length
      ? testCase.rounds.map((round) => round.prompt).join("\n")
      : testCase.messages?.map((message) => message.content).join("\n\n") ?? "",
  };
}

function buildInput(draft: Draft): Omit<ChannelApiTestCaseUpsertInput, "workspaceId"> {
  if (draft.category === "followup") {
    return {
      id: draft.id,
      category: draft.category,
      label: draft.label.trim(),
      rounds: draft.content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((prompt, index) => ({ id: `round-${index + 1}`, prompt })),
      messages: [],
    };
  }

  return {
    id: draft.id,
    category: draft.category,
    label: draft.label.trim(),
    messages: [{ role: "user", content: draft.content.trim() }],
    rounds: [],
  };
}

function casePreview(testCase: ChannelApiTestCase) {
  const text = testCase.rounds?.length
    ? testCase.rounds.map((round) => round.prompt).join(" / ")
    : testCase.messages?.map((message) => message.content).join(" / ") ?? "";
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}
