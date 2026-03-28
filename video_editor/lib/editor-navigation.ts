/** Open the standalone editor for a project in a new browser tab. */
export function openEditorInNewTab(projectId: string): void {
  if (typeof window === "undefined") return;
  const url = `/editor?project=${encodeURIComponent(projectId)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function editorUrlForProject(projectId: string): string {
  return `/editor?project=${encodeURIComponent(projectId)}`;
}
