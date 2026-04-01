/**
 * Action logger — records timestamped user actions per task (game session).
 *
 * Each task gets its own array of log lines. On game end the full log can be
 * downloaded as a text file (one line per action).
 *
 * Line format:  <ISO-timestamp>\t<action_type>\t<details JSON>
 */

export type ActionEntry = {
  timestamp: string; // ISO 8601
  action: string;
  details: Record<string, unknown>;
};

export type SessionMetadata = {
  consented: true;
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  jatoWorkerId?: number;
};

let taskId: string | null = null;
let entries: ActionEntry[] = [];
let metadata: SessionMetadata | null = null;

/** Record consent and non-identifying technical info at the start of a session. */
export function setMetadata(m: SessionMetadata): void {
  metadata = m;
}

/** Start a new task / game session. Clears previous log. */
export function startTask(id: string): void {
  taskId = id;
  entries = [];
  log("task_started", { taskId: id });
}

/** Append one action to the current task log. */
export function log(
  action: string,
  details: Record<string, unknown> = {}
): void {
  const entry: ActionEntry = {
    timestamp: new Date().toISOString(),
    action,
    details,
  };
  entries.push(entry);
}

/** Return all entries for the current task. */
export function getEntries(): ActionEntry[] {
  return entries;
}

/** Return the current task id. */
export function getTaskId(): string | null {
  return taskId;
}

/** Serialise the log to a TSV string (one line per action). */
export function serialise(): string {
  return entries
    .map((e) => `${e.timestamp}\t${e.action}\t${JSON.stringify(e.details)}`)
    .join("\n");
}

/** Trigger a browser download of the log file. */
export function downloadLog(): void {
  if (!taskId || entries.length === 0) return;
  const blob = new Blob([serialise()], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `task_${taskId}.tsv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Send the log to the backend via the websocket (if available). */
export function sendLog(ws: WebSocket | null): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(
    JSON.stringify({
      type: "action_log",
      taskId,
      entries,
    })
  );
}

/**
 * Submit all accumulated entries to JATOS as result data.
 * No-op when running outside JATOS (local dev).
 * Returns a Promise so callers can await it before advancing the study.
 */
export async function submitToJatos(): Promise<void> {
  if (!window.jatos) return;
  const payload = { taskId, metadata, entries };
  await window.jatos.submitResultData(payload);
}
