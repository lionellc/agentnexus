import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";

import { cn } from "../../../shared/lib/cn";

type VersionDiffViewerProps = {
  before: string;
  after: string;
  isZh: boolean;
  leftTitle?: string;
  rightTitle?: string;
  className?: string;
};

export function VersionDiffViewer({
  before,
  after,
  isZh,
  leftTitle,
  rightTitle,
  className,
}: VersionDiffViewerProps) {
  if (before === after) {
    return (
      <div className={cn("rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500", className)}>
        {isZh ? "没有变化" : "No changes"}
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-slate-200 bg-slate-50", className)}>
      <div className="max-h-[56vh] overflow-auto p-2">
        <ReactDiffViewer
          oldValue={before}
          newValue={after}
          splitView
          showDiffOnly
          extraLinesSurroundingDiff={2}
          hideSummary
          disableWordDiff
          compareMethod={DiffMethod.LINES}
          leftTitle={leftTitle}
          rightTitle={rightTitle}
          renderContent={(content) => (
            <pre className="m-0 whitespace-pre-wrap break-words text-[13px] leading-6 text-slate-800">{content}</pre>
          )}
          styles={{
            variables: {
              light: {
                diffViewerBackground: "#ffffff",
                diffViewerColor: "#0f172a",
                gutterBackground: "#f8fafc",
                gutterBackgroundDark: "#f1f5f9",
                gutterColor: "#64748b",
                diffViewerTitleBackground: "#f8fafc",
                diffViewerTitleColor: "#334155",
                diffViewerTitleBorderColor: "#e2e8f0",
                addedBackground: "#ecfdf5",
                removedBackground: "#fef2f2",
                addedGutterBackground: "#d1fae5",
                removedGutterBackground: "#fee2e2",
                addedColor: "#166534",
                removedColor: "#b91c1c",
                emptyLineBackground: "#ffffff",
                codeFoldBackground: "#f8fafc",
                codeFoldGutterBackground: "#f1f5f9",
                codeFoldContentColor: "#475569",
              },
            },
            diffContainer: {
              borderRadius: "0.75rem",
              overflow: "hidden",
              border: "1px solid #e2e8f0",
            },
            contentText: {
              fontSize: "13px",
              lineHeight: 1.6,
            },
            line: {
              minHeight: "30px",
            },
            marker: {
              width: "26px",
              minWidth: "26px",
              fontWeight: 700,
            },
            gutter: {
              minWidth: "44px",
              width: "44px",
            },
            lineNumber: {
              fontSize: "12px",
            },
            titleBlock: {
              fontSize: "12px",
              fontWeight: 600,
            },
            column: {
              minWidth: 0,
            },
            splitView: {
              tableLayout: "fixed",
            },
          }}
        />
      </div>
    </div>
  );
}
