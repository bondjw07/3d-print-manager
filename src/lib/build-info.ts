export function getBuildVersion() {
  if (process.env.NODE_ENV !== "production") return "Development build";
  const commit = process.env.APP_GIT_SHA;
  return commit && commit !== "unknown" ? `Commit ${commit.slice(0, 12)}` : "Commit unavailable";
}
