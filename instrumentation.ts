export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDailyDigestScheduler } = await import("@/lib/jobs/daily-digest-scheduler");
    startDailyDigestScheduler();
  }
}
