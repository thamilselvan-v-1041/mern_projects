export type PreviewRenderJobContext<TPayload> = {
  projectId: string;
  payload: TPayload;
  signal: AbortSignal;
  enqueuedAt: number;
};

export type PreviewRenderJobHandler<TPayload, TResult> = (
  context: PreviewRenderJobContext<TPayload>
) => Promise<TResult>;

export type PreviewRenderQueueOptions = {
  defaultDebounceMs?: number;
};

export type EnqueuePreviewRenderOptions = {
  debounceMs?: number;
};

export type PreviewRenderQueueResult<TResult> =
  | {
      status: "completed";
      result: TResult;
    }
  | {
      status: "cancelled";
      reason: "superseded";
    };

type QueueEntry<TPayload, TResult> = {
  payload: TPayload;
  enqueuedAt: number;
  debounceMs: number;
  handler: PreviewRenderJobHandler<TPayload, TResult>;
  resolve: (value: PreviewRenderQueueResult<TResult>) => void;
  reject: (error: unknown) => void;
};

type ProjectQueueState<TPayload, TResult> = {
  activeController: AbortController | null;
  activePromise: Promise<void> | null;
  queued: QueueEntry<TPayload, TResult> | null;
  timer: ReturnType<typeof setTimeout> | null;
};

/**
 * Debounced, per-project render queue.
 *
 * - only one active render per project
 * - newest queued render supersedes older queued render
 * - running renders are cancelled when a fresher job is promoted
 */
export class PreviewRenderQueue<TPayload, TResult = void> {
  private readonly defaultDebounceMs: number;
  private readonly projectStates = new Map<
    string,
    ProjectQueueState<TPayload, TResult>
  >();

  constructor(options?: PreviewRenderQueueOptions) {
    this.defaultDebounceMs = Math.max(options?.defaultDebounceMs ?? 800, 0);
  }

  enqueue(
    projectId: string,
    payload: TPayload,
    handler: PreviewRenderJobHandler<TPayload, TResult>,
    options?: EnqueuePreviewRenderOptions
  ): Promise<PreviewRenderQueueResult<TResult>> {
    const state = this.getState(projectId);
    const debounceMs = Math.max(
      options?.debounceMs ?? this.defaultDebounceMs,
      0
    );

    if (state.queued) {
      state.queued.resolve({ status: "cancelled", reason: "superseded" });
    }

    const enqueuedAt = Date.now();
    const jobPromise = new Promise<PreviewRenderQueueResult<TResult>>(
      (resolve, reject) => {
        state.queued = {
          payload,
          enqueuedAt,
          debounceMs,
          handler,
          resolve,
          reject,
        };
      }
    );

    this.schedule(projectId, state);
    return jobPromise;
  }

  cancelProject(projectId: string): void {
    const state = this.projectStates.get(projectId);
    if (!state) return;

    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }

    if (state.queued) {
      state.queued.resolve({ status: "cancelled", reason: "superseded" });
      state.queued = null;
    }

    state.activeController?.abort();
  }

  getProjectStatus(projectId: string): "idle" | "queued" | "running" {
    const state = this.projectStates.get(projectId);
    if (!state) return "idle";
    if (state.activePromise) return "running";
    if (state.queued) return "queued";
    return "idle";
  }

  private getState(projectId: string): ProjectQueueState<TPayload, TResult> {
    const existing = this.projectStates.get(projectId);
    if (existing) return existing;

    const created: ProjectQueueState<TPayload, TResult> = {
      activeController: null,
      activePromise: null,
      queued: null,
      timer: null,
    };
    this.projectStates.set(projectId, created);
    return created;
  }

  private schedule(
    projectId: string,
    state: ProjectQueueState<TPayload, TResult>
  ): void {
    if (state.activePromise || !state.queued) return;

    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }

    state.timer = setTimeout(() => {
      state.timer = null;
      void this.promoteNext(projectId, state);
    }, state.queued.debounceMs);
  }

  private async promoteNext(
    projectId: string,
    state: ProjectQueueState<TPayload, TResult>
  ): Promise<void> {
    if (state.activePromise || !state.queued) return;

    const job = state.queued;
    state.queued = null;

    state.activeController?.abort();
    const controller = new AbortController();
    state.activeController = controller;

    let run!: Promise<void>;
    run = (async () => {
      try {
        const result = await job.handler({
          projectId,
          payload: job.payload,
          signal: controller.signal,
          enqueuedAt: job.enqueuedAt,
        });
        if (!controller.signal.aborted) {
          job.resolve({ status: "completed", result });
        } else {
          job.resolve({ status: "cancelled", reason: "superseded" });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          job.resolve({ status: "cancelled", reason: "superseded" });
        } else {
          job.reject(error);
        }
      } finally {
        if (state.activeController === controller) {
          state.activeController = null;
        }
        if (state.activePromise === run) {
          state.activePromise = null;
        }
        this.schedule(projectId, state);
      }
    })();

    state.activePromise = run;
    await run;
  }
}
