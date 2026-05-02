import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { Badge, Button } from "../../../../shared/ui";

import { PlatformPresetIcon } from "./PlatformPresetIcon";
import type { AgentConnectionRow, AgentPresetRow, Translator } from "./types";

type AgentPresetGridProps = {
  l: Translator;
  enabledRows: AgentConnectionRow[];
  availableRows: AgentPresetRow[];
  agentConnectionSavingId: string | null;
  onStartEdit: (platform: string) => void;
  onDisableAgentConnection: (platform: string) => void;
  onEnableAgentPreset: (platform: string) => void;
  onReorderEnabledAgentRows: (orderedPlatforms: string[]) => void;
};

type SortableEnabledCardProps = {
  l: Translator;
  row: AgentConnectionRow;
  agentConnectionSavingId: string | null;
  onStartEdit: (platform: string) => void;
  onDisableAgentConnection: (platform: string) => void;
};

function SortableEnabledCard({
  l,
  row,
  agentConnectionSavingId,
  onStartEdit,
  onDisableAgentConnection,
}: SortableEnabledCardProps) {
  const saving = agentConnectionSavingId === row.platform;
  const disabling = agentConnectionSavingId === `disable:${row.platform}`;
  const disabled = saving || disabling;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: row.platform,
    disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "rounded-md border border-slate-200 px-3 py-3 dark:border-slate-800",
        isDragging ? "z-10 opacity-70 shadow-sm" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex cursor-grab items-center text-slate-400 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
              title={l("拖拽排序", "Drag to reorder")}
              aria-label={l("拖拽排序", "Drag to reorder")}
              disabled={disabled}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <PlatformPresetIcon platformId={row.platform} size={18} />
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{row.displayName}</span>
          </div>
          <div className="text-xs text-slate-500">
            <div className="truncate">
              {l("配置目录", "Config Dir")}: {row.rootDir || "-"}
            </div>
            <div className="truncate">
              {l("规则文件", "Rule File")}: {row.ruleFile || "-"}
            </div>
            <div className="truncate">
              {l("检测状态", "Detection")}: {row.detectionStatus}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <Button size="sm" variant="outline" onClick={() => onStartEdit(row.platform)} disabled={disabled}>
            {l("编辑", "Edit")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDisableAgentConnection(row.platform)}
            disabled={disabled}
          >
            {disabling ? l("处理中...", "Processing...") : l("停用", "Disable")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AgentPresetGrid({
  l,
  enabledRows,
  availableRows,
  agentConnectionSavingId,
  onStartEdit,
  onDisableAgentConnection,
  onEnableAgentPreset,
  onReorderEnabledAgentRows,
}: AgentPresetGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const ordered = enabledRows.map((item) => item.platform);
    const fromIndex = ordered.indexOf(String(active.id));
    const toIndex = ordered.indexOf(String(over.id));
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    const next = arrayMove(ordered, fromIndex, toIndex);
    onReorderEnabledAgentRows(next);
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-slate-800 dark:text-slate-100">{l("已启用平台", "Enabled Platforms")}</h4>
          <Badge variant="secondary">{enabledRows.length}</Badge>
        </div>
        {enabledRows.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500 dark:border-slate-700">
            {l("暂无已启用平台，可从下方添加。", "No enabled platforms. Add one below.")}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={enabledRows.map((item) => item.platform)}
              strategy={rectSortingStrategy}
            >
              <div className="grid gap-2 md:grid-cols-2">
                {enabledRows.map((row) => (
                  <SortableEnabledCard
                    key={row.platform}
                    l={l}
                    row={row}
                    agentConnectionSavingId={agentConnectionSavingId}
                    onStartEdit={onStartEdit}
                    onDisableAgentConnection={onDisableAgentConnection}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-slate-800 dark:text-slate-100">{l("可添加平台", "Available Platforms")}</h4>
          <Badge variant="secondary">{availableRows.length}</Badge>
        </div>
        {availableRows.length === 0 ? (
          <div className="rounded-md border border-slate-200 px-3 py-3 text-xs text-slate-500 dark:border-slate-800">
            {l("全部平台已启用。", "All platforms enabled.")}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {availableRows.map((row) => {
              const enabling = agentConnectionSavingId === `enable:${row.platform}`;
              return (
                <div key={row.platform} className="rounded-md border border-slate-200 px-3 py-3 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <PlatformPresetIcon platformId={row.platform} size={16} />
                      <div className="min-w-0 truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                        {row.displayName}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => onEnableAgentPreset(row.platform)} disabled={enabling}>
                      {enabling ? l("添加中...", "Adding...") : l("添加", "Add")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
