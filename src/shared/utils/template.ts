const VARIABLE_PATTERN = /\{\{\s*([\p{L}\p{N}_\-.]+)\s*\}\}/gu;

export function extractTemplateVariables(content: string): string[] {
  const variables = new Set<string>();
  let match = VARIABLE_PATTERN.exec(content);
  while (match) {
    if (match[1]) {
      variables.add(match[1]);
    }
    match = VARIABLE_PATTERN.exec(content);
  }
  return Array.from(variables);
}

export function renderTemplatePreview(content: string, variables: Record<string, string>): string {
  return content.replace(VARIABLE_PATTERN, (_full, key: string) => {
    const value = variables[key.trim()];
    if (value == null || value.trim().length === 0) {
      return `{{${key}}}`;
    }
    return value;
  });
}
