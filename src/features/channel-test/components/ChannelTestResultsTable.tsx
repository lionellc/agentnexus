import { Empty, Table, Tag } from "@douyinfe/semi-ui-19";
import type { ReactNode } from "react";

import type { ChannelApiTestRunItem } from "../../../shared/types";
import {
  categoryLabel,
  formatDuration,
  metricLabel,
  protocolLabel,
  runModeLabel,
  runModeTone,
  statusLabel,
  statusTone,
} from "../utils/format";
import { ChannelTestRunDetail } from "./ChannelTestRunDetail";

type ChannelTestResultsTableProps = {
  items: ChannelApiTestRunItem[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  l: (zh: string, en: string) => string;
  onPageChange: (page: number, pageSize: number) => void;
};

type TableColumn = {
  title: string;
  dataIndex: string;
  width?: number;
  render?: (_value: unknown, record: ChannelApiTestRunItem) => ReactNode;
};

export function ChannelTestResultsTable({
  items,
  total,
  page,
  pageSize,
  loading,
  l,
  onPageChange,
}: ChannelTestResultsTableProps) {
  const columns: TableColumn[] = [
    {
      title: l("时间", "Time"),
      dataIndex: "startedAt",
      width: 190,
      render: (_value, record) => new Date(record.startedAt).toLocaleString(),
    },
    {
      title: l("模型", "Model"),
      dataIndex: "model",
      render: (_value, record) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{record.model}</span>
          <div className="flex flex-wrap gap-1">
            <Tag color="green">{protocolLabel(record.protocol)}</Tag>
            <Tag>{l(categoryLabel(record.category), categoryEnglishLabel(record.category))}</Tag>
            <Tag color={runModeTone(record.runMode)}>{l(runModeLabel(record.runMode), runModeEnglishLabel(record.runMode))}</Tag>
            {record.stream ? <Tag color="blue">{l("流", "Stream")}</Tag> : null}
            <Tag color={statusTone(record.status)}>{l(statusLabel(record.status), statusEnglishLabel(record.status))}</Tag>
          </div>
        </div>
      ),
    },
    {
      title: l("用时/首字", "Duration/First"),
      dataIndex: "totalDurationMs",
      width: 180,
      render: (_value, record) => (
        <div className="flex flex-wrap items-center gap-2">
          <Tag color="green">{formatDuration(record.totalDurationMs)}</Tag>
          <Tag color={record.firstMetricKind === "first_token" ? "blue" : "orange"}>
            {l(metricLabel(record.firstMetricKind), record.firstMetricKind === "first_token" ? "First token" : "First response")} {formatDuration(record.firstTokenMs)}
          </Tag>
        </div>
      ),
    },
    {
      title: l("输入", "Input"),
      dataIndex: "inputSize",
      width: 120,
      render: (_value, record) => (
        <div>
          <div className="text-base text-foreground">{record.inputSize}</div>
          <div className="text-xs text-muted-foreground">{sizeSourceLabel(record.inputSizeSource, l)}</div>
        </div>
      ),
    },
    {
      title: l("输出", "Output"),
      dataIndex: "outputSize",
      width: 120,
      render: (_value, record) => (
        <div>
          <div className="text-base text-foreground">{record.outputSize}</div>
          <div className="text-xs text-muted-foreground">{sizeSourceLabel(record.outputSizeSource, l)}</div>
        </div>
      ),
    },
  ];

  return (
    <section className="channel-test-results-table rounded-lg border border-border bg-card p-4">
      <Table
        rowKey="id"
        columns={columns}
        dataSource={items}
        loading={loading}
        scroll={{ x: "100%" }}
        empty={<Empty title={l("暂无测试记录", "No test runs")} description={l("先运行一次渠道测试", "Run a channel test first.")} />}
        expandedRowRender={(record?: ChannelApiTestRunItem) =>
          record ? <ChannelTestRunDetail run={record} l={l} /> : null
        }
        pagination={{
          currentPage: page,
          pageSize,
          total,
          showSizeChanger: true,
          onPageChange: (nextPage) => onPageChange(nextPage, pageSize),
          onPageSizeChange: (nextPageSize) => onPageChange(1, nextPageSize),
        }}
      />
    </section>
  );
}

function categoryEnglishLabel(category: ChannelApiTestRunItem["category"]) {
  switch (category) {
    case "small":
      return "Small";
    case "medium":
      return "Medium";
    case "large":
      return "Large";
    case "followup":
      return "Follow-up";
    default:
      return category;
  }
}

function runModeEnglishLabel(mode?: ChannelApiTestRunItem["runMode"]) {
  switch (mode) {
    case "diagnostic":
      return "Probe";
    case "sampling":
      return "Sampling";
    case "standard":
    default:
      return "Test";
  }
}

function statusEnglishLabel(status: ChannelApiTestRunItem["status"]) {
  switch (status) {
    case "success":
      return "Success";
    case "partial_failed":
      return "Partial failed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function sizeSourceLabel(source: ChannelApiTestRunItem["inputSizeSource"], l: (zh: string, en: string) => string) {
  return source === "usage" ? "usage" : l("字符", "chars");
}
