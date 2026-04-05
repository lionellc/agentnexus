import { useEffect, useRef } from "react";

import { Button } from "../../shared/ui";

type RichTextEditorProps = {
  value: string;
  onChange: (next: string) => void;
  minHeight?: number;
};

function applyCommand(command: string, value?: string): void {
  document.execCommand(command, false, value);
}

export function RichTextEditor({ value, onChange, minHeight = 320 }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = editorRef.current;
    if (!node) {
      return;
    }
    if (node.innerHTML !== value) {
      node.innerHTML = value;
    }
  }, [value]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => applyCommand("bold")}>
          加粗
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => applyCommand("italic")}>
          斜体
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => applyCommand("underline")}>
          下划线
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => applyCommand("insertUnorderedList")}
        >
          无序列表
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => applyCommand("formatBlock", "h2")}>
          标题
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => applyCommand("formatBlock", "p")}>
          正文
        </Button>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        style={{ minHeight }}
        onInput={(event) => onChange((event.currentTarget as HTMLDivElement).innerHTML)}
      />
    </div>
  );
}

