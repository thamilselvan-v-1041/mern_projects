"use client";

import { useCallback, useMemo, useState } from "react";
import { HubSidebar, type HubNavPanel } from "./hub-sidebar";
import { PreviewLandingPage } from "./preview-landing-page";
import { VideoProjectsHome } from "./video-projects-home";
import {
  createEmptyProjectInStorage,
  deleteStoredProject,
  loadAllProjects,
} from "@/lib/video-project-storage";
import { openEditorInNewTab } from "@/lib/editor-navigation";

export function VideoEditorHub() {
  const [navPanel, setNavPanel] = useState<HubNavPanel>("canvas");
  const [catalogVersion, setCatalogVersion] = useState(0);

  const projects = useMemo(
    () => loadAllProjects(),
    [catalogVersion]
  );

  const refreshCatalog = useCallback(
    () => setCatalogVersion((v) => v + 1),
    []
  );

  const handleCreateNew = useCallback(() => {
    const id = createEmptyProjectInStorage();
    refreshCatalog();
    openEditorInNewTab(id);
  }, [refreshCatalog]);

  const handleOpenProject = useCallback((id: string) => {
    openEditorInNewTab(id);
  }, []);

  const handleDeleteProject = useCallback(
    (id: string) => {
      deleteStoredProject(id);
      refreshCatalog();
    },
    [refreshCatalog]
  );

  return (
    <div className="flex min-h-screen w-full bg-white text-slate-800">
      <HubSidebar navPanel={navPanel} onNavigate={setNavPanel} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {navPanel === "canvas" ? (
          <PreviewLandingPage onOpenVideos={() => setNavPanel("videos")} />
        ) : null}
        {navPanel === "videos" ? (
          <VideoProjectsHome
            projects={projects}
            onCreateNew={handleCreateNew}
            onOpenProject={handleOpenProject}
            onDeleteProject={handleDeleteProject}
            onBackToPreview={() => setNavPanel("canvas")}
          />
        ) : null}
      </div>
    </div>
  );
}
