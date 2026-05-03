import { Button } from "@douyinfe/semi-ui-19";
import { useEffect, useRef } from "react";

type RichTextEditorLanguage = "zh" | "en";

type RichTextEditorLabels = {
  bold: string;
  italic: string;
  underline: string;
  unorderedList: string;
  heading: string;
  paragraph: string;
};

type RichTextEditorProps = {
  value: string;
  onChange: (next: string) => void;
  minHeight?: number;
  language?: RichTextEditorLanguage;
  labels?: Partial<RichTextEditorLabels>;
};

function applyCommand(command: string, value?: string): void {
  document.execCommand(command, false, value);
}

export function RichTextEditor({
  value,
  onChange,
  minHeight = 320,
  language = "zh",
  labels,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const effectiveLabels: RichTextEditorLabels = {
    bold: labels?.bold ?? (language === "en" ? "Bold" : "加粗"),
    italic: labels?.italic ?? (language === "en" ? "Italic" : "斜体"),
    underline: labels?.underline ?? (language === "en" ? "Underline" : "下划线"),
    unorderedList: labels?.unorderedList ?? (language === "en" ? "Bullet List" : "无序列表"),
    heading: labels?.heading ?? (language === "en" ? "Heading" : "标题"),
    paragraph: labels?.paragraph ?? (language === "en" ? "Paragraph" : "正文"),
  };

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
        <Button htmlType="button" onClick={() => applyCommand("bold")}>
          {effectiveLabels.bold}
        </Button>
        <Button htmlType="button" onClick={() => applyCommand("italic")}>
          {effectiveLabels.italic}
        </Button>
        <Button htmlType="button" onClick={() => applyCommand("underline")}>
          {effectiveLabels.underline}
        </Button>
        <Button
          htmlType="button"
          onClick={() => applyCommand("insertUnorderedList")}
        >
          {effectiveLabels.unorderedList}
        </Button>
        <Button htmlType="button" onClick={() => applyCommand("formatBlock", "h2")}>
          {effectiveLabels.heading}
        </Button>
        <Button htmlType="button" onClick={() => applyCommand("formatBlock", "p")}>
          {effectiveLabels.paragraph}
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
