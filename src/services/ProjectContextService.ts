import * as vscode from "vscode";
import { fetchProjects, type McpClientOptions } from "./McpTransport";

export const SELECTED_PROJECT_KEY = "agentstack.selectedProjectId";
export const SELECTED_PROJECT_NAME_KEY = "agentstack.selectedProjectName";

export function isPlaceholderProject(p: { id?: unknown; project_id?: unknown }): boolean {
  const id = p.project_id ?? p.id;
  return typeof id === "string" && /^proj_\d+$/.test(id);
}

export class ProjectContextService {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getSelectedProjectId(): number | undefined {
    return (
      this.context.globalState.get<number | undefined>(SELECTED_PROJECT_KEY) ??
      this.context.globalState.get<number | undefined>("agentstack.lastProjectId")
    );
  }

  getSelectedProjectName(): string | undefined {
    return this.context.globalState.get<string | undefined>(SELECTED_PROJECT_NAME_KEY);
  }

  async setSelectedProject(projectId: number, projectName?: string): Promise<void> {
    await this.context.globalState.update(SELECTED_PROJECT_KEY, projectId);
    await this.context.globalState.update(SELECTED_PROJECT_NAME_KEY, projectName);
    await this.context.globalState.update("agentstack.lastProjectId", projectId);
  }

  async clearSelectedProject(): Promise<void> {
    await this.context.globalState.update(SELECTED_PROJECT_KEY, undefined);
    await this.context.globalState.update(SELECTED_PROJECT_NAME_KEY, undefined);
  }

  async resolveProjectForChat(opts: McpClientOptions): Promise<
    | { projectId: number; projectName: string | undefined; usedFirstInList: false }
    | { projectId: number; projectName: string | undefined; usedFirstInList: true }
    | { projectId: undefined; projectName: undefined; usedFirstInList: false }
  > {
    const selectedProjectId = this.getSelectedProjectId();
    const selectedProjectName = this.getSelectedProjectName();
    if (selectedProjectId !== undefined) {
      return { projectId: selectedProjectId, projectName: selectedProjectName, usedFirstInList: false };
    }
    const projResult = await fetchProjects(opts);
    if ("error" in projResult) {
      return { projectId: undefined, projectName: undefined, usedFirstInList: false };
    }
    const first = projResult.projects.filter((p) => !isPlaceholderProject(p))[0];
    const rawId = first?.project_id ?? first?.id;
    const projectId = typeof rawId === "number" ? rawId : undefined;
    const projectName = first?.name;
    if (projectId === undefined) {
      return { projectId: undefined, projectName: undefined, usedFirstInList: false };
    }
    return { projectId, projectName, usedFirstInList: true };
  }
}
