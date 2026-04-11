import { Fragment, useMemo, useState, type ReactNode } from "react";

import { Button, Textarea } from "../../../shared/ui";

export type MarkdownMode = "edit" | "preview" | "split";
type MarkdownLanguage = "zh" | "en";

type MarkdownPreviewProps = {
  content: string;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
  language?: MarkdownLanguage;
  emptyText?: string;
};

type MarkdownEditorProps = {
  value: string;
  onChange?: (next: string) => void;
  minHeight?: number;
  maxHeight?: number;
  placeholder?: string;
  readOnly?: boolean;
  modeLabels?: Partial<Record<MarkdownMode, string>>;
  mode?: MarkdownMode;
  onModeChange?: (mode: MarkdownMode) => void;
  hideModeSwitcher?: boolean;
  language?: MarkdownLanguage;
  previewEmptyText?: string;
};

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const tokenKey = `${keyPrefix}-${match.index}`;

    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={tokenKey}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<em key={tokenKey}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={tokenKey}
          className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-800"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        nodes.push(
          <a
            key={tokenKey}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 underline"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    } else {
      nodes.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  if (nodes.length === 0) {
    nodes.push(text);
  }
  return nodes;
}

function isBlockBoundary(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return true;
  }
  return (
    /^```/.test(trimmed) ||
    /^(#{1,6})\s+/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^[-*+]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed) ||
    /^(-{3,}|_{3,}|\*{3,}|={3,})$/.test(trimmed)
  );
}

function parseMarkdown(content: string): ReactNode[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const fenced = trimmed.match(/^```([A-Za-z0-9_-]+)?\s*$/);
    if (fenced) {
      const lang = fenced[1] ?? "";
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !/^```/.test((lines[index] ?? "").trim())) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      nodes.push(
        <pre
          key={`code-${index}`}
          className="overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100"
        >
          {lang ? <div className="mb-1 text-[11px] text-slate-400">{lang}</div> : null}
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (/^(-{3,}|_{3,}|\*{3,}|={3,})$/.test(trimmed)) {
      nodes.push(<hr key={`hr-${index}`} className="border-0 border-t border-slate-200" />);
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 6);
      const text = heading[2];
      const className =
        level === 1
          ? "text-2xl font-bold"
          : level === 2
            ? "text-xl font-semibold"
            : level === 3
              ? "text-lg font-semibold"
              : "text-base font-semibold";
      nodes.push(
        <div key={`heading-${index}`} className={className}>
          {renderInline(text, `heading-${index}`)}
        </div>,
      );
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test((lines[index] ?? "").trim())) {
        quoteLines.push((lines[index] ?? "").replace(/^>\s?/, ""));
        index += 1;
      }
      nodes.push(
        <blockquote
          key={`quote-${index}`}
          className="border-l-4 border-slate-300 pl-3 text-sm text-slate-700 whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
        >
          {quoteLines.map((quoteLine, quoteIndex) => (
            <Fragment key={`quote-line-${quoteIndex}`}>
              {renderInline(quoteLine, `quote-${index}-${quoteIndex}`)}
              {quoteIndex < quoteLines.length - 1 ? <br /> : null}
            </Fragment>
          ))}
        </blockquote>,
      );
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*+]\s+/.test((lines[index] ?? "").trim())) {
        items.push((lines[index] ?? "").trim().replace(/^[-*+]\s+/, ""));
        index += 1;
      }
      nodes.push(
        <ul key={`ul-${index}`} className="list-inside list-disc space-y-1">
          {items.map((item, itemIndex) => (
            <li key={`ul-item-${itemIndex}`}>{renderInline(item, `ul-${index}-${itemIndex}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test((lines[index] ?? "").trim())) {
        items.push((lines[index] ?? "").trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      nodes.push(
        <ol key={`ol-${index}`} className="list-inside list-decimal space-y-1">
          {items.map((item, itemIndex) => (
            <li key={`ol-item-${itemIndex}`}>{renderInline(item, `ol-${index}-${itemIndex}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [line];
    index += 1;
    while (index < lines.length && !isBlockBoundary(lines[index] ?? "")) {
      paragraphLines.push(lines[index] ?? "");
      index += 1;
    }
    nodes.push(
      <p key={`p-${index}`} className="leading-7 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
        {paragraphLines.map((paragraphLine, lineIndex) => (
          <Fragment key={`p-line-${index}-${lineIndex}`}>
            {renderInline(paragraphLine, `p-${index}-${lineIndex}`)}
            {lineIndex < paragraphLines.length - 1 ? <br /> : null}
          </Fragment>
        ))}
      </p>,
    );
  }

  return nodes;
}

export function MarkdownPreview({
  content,
  minHeight = 240,
  maxHeight = 560,
  className,
  language = "zh",
  emptyText,
}: MarkdownPreviewProps) {
  const nodes = useMemo(() => parseMarkdown(content), [content]);
  const effectiveEmptyText = emptyText ?? (language === "en" ? "(No content)" : "(无内容)");
  return (
    <div
      className={`overflow-x-hidden overflow-y-auto rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 ${className ?? ""}`}
      style={{ minHeight, maxHeight }}
    >
      <div className="space-y-3 break-words [overflow-wrap:anywhere]">
        {nodes.length === 0 ? <div className="text-slate-400">{effectiveEmptyText}</div> : nodes}
      </div>
    </div>
  );
}

export function MarkdownEditor({
  value,
  onChange,
  minHeight = 320,
  maxHeight = 560,
  placeholder,
  readOnly = false,
  modeLabels,
  mode,
  onModeChange,
  hideModeSwitcher = false,
  language = "zh",
  previewEmptyText,
}: MarkdownEditorProps) {
  const [internalMode, setInternalMode] = useState<MarkdownMode>("split");
  const labels: Record<MarkdownMode, string> = {
    edit: modeLabels?.edit ?? (language === "en" ? "Edit" : "编辑"),
    preview: modeLabels?.preview ?? (language === "en" ? "Preview" : "预览"),
    split: modeLabels?.split ?? (language === "en" ? "Split" : "分栏"),
  };
  const currentMode = mode ?? internalMode;
  const setCurrentMode = (nextMode: MarkdownMode) => {
    if (mode === undefined) {
      setInternalMode(nextMode);
    }
    onModeChange?.(nextMode);
  };
  const effectiveMode = readOnly ? "split" : currentMode;
  const showEditor = effectiveMode === "edit" || effectiveMode === "split";
  const showPreview = effectiveMode === "preview" || effectiveMode === "split";
  const textareaRows = Math.max(10, Math.floor(minHeight / 24));

  return (
    <div className="space-y-2">
      {!readOnly && !hideModeSwitcher ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={currentMode === "edit" ? "default" : "outline"}
            onClick={() => setCurrentMode("edit")}
          >
            {labels.edit}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={currentMode === "preview" ? "default" : "outline"}
            onClick={() => setCurrentMode("preview")}
          >
            {labels.preview}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={currentMode === "split" ? "default" : "outline"}
            onClick={() => setCurrentMode("split")}
          >
            {labels.split}
          </Button>
        </div>
      ) : null}

      <div className={showEditor && showPreview ? "grid gap-3 lg:grid-cols-2" : ""}>
        {showEditor ? (
          <Textarea
            rows={textareaRows}
            value={value}
            onChange={(event) => onChange?.(event.currentTarget.value)}
            placeholder={placeholder}
            readOnly={readOnly}
            className="overflow-auto"
            style={{ minHeight, maxHeight }}
          />
        ) : null}

        {showPreview ? (
          <MarkdownPreview
            content={value}
            minHeight={minHeight}
            maxHeight={maxHeight}
            language={language}
            emptyText={previewEmptyText}
          />
        ) : null}
      </div>
    </div>
  );
}
