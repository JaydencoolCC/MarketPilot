import { runDailyDigestJob } from "@/lib/jobs/digest";

const DEFAULT_INTERVAL_MS = 60_000;

type SchedulerGlobal = typeof globalThis & {
  __tradeDailyDigestScheduler?: {
    timer: ReturnType<typeof setInterval>;
    running: boolean;
  };
};

export function startDailyDigestScheduler(intervalMs = DEFAULT_INTERVAL_MS) {
  const globalState = globalThis as SchedulerGlobal;
  if (globalState.__tradeDailyDigestScheduler) {
    return globalState.__tradeDailyDigestScheduler;
  }

  const state = {
    timer: setInterval(() => {
      void runDailyDigestSchedulerTick(state);
    }, intervalMs),
    running: false,
  };

  if (typeof state.timer === "object" && "unref" in state.timer) {
    state.timer.unref();
  }

  globalState.__tradeDailyDigestScheduler = state;
  void runDailyDigestSchedulerTick(state);
  return state;
}

export async function runDailyDigestSchedulerTick(state: { running: boolean }) {
  if (state.running) return;
  state.running = true;
  try {
    await runDailyDigestJob();
  } catch (error) {
    console.error("[daily-digest-scheduler] Daily digest job failed.", error);
  } finally {
    state.running = false;
  }
}
