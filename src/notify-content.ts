/**
 * Notification content generation — title and body per event type.
 *
 * Strategy (informed by upstream peon-ping's peon.sh):
 *
 * - Title: "<project> · <status>" where <project> comes from a priority
 *   chain (session name > git remote > folder name), and <status> is a
 *   short label describing the event type (done / error / compacting).
 *   This replaces the old hardcoded "pi · <folder>" + "Task complete".
 *
 * - Body: event-specific. For task completion we extract the assistant's
 *   last text response (truncated), so the popup actually tells you what
 *   happened instead of a generic "Task complete". For errors we name the
 *   failing tool. For compaction we say so plainly.
 */

import { basename } from "node:path";
import { execSync } from "node:child_process";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/** Maximum characters of the assistant's last response to show in the body. */
const MAX_SUMMARY_CHARS = 120;

/**
 * Resolve the project label via a priority chain.
 *
 *   1. pi.getSessionName()  — user-set session name (like /peon-ping-rename)
 *   2. git remote repo name — `git remote get-url origin` → trailing segment
 *   3. basename(cwd)        — folder name fallback
 *
 * Upstream has more layers (.peon-label file, project_name_map glob,
 * notification_title_script); we keep it simple since pi sessions already
 * have a first-class session name API.
 */
export function resolveProjectName(cwd: string, pi: ExtensionAPI): string {
  // 1. Session name (highest priority — user explicitly set it)
  const sessionName = pi.getSessionName()?.trim();
  if (sessionName) return sanitizeLabel(sessionName);

  // 2. Git remote repo name
  const gitRepo = readGitRepoName(cwd);
  if (gitRepo) return sanitizeLabel(gitRepo);

  // 3. Folder name fallback
  return sanitizeLabel(basename(cwd)) || "project";
}

function readGitRepoName(cwd: string): string | null {
  try {
    const out = execSync("git remote get-url origin", {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
      encoding: "utf8",
    }).trim();
    if (!out) return null;
    // Trim trailing slash, take last path segment, strip .git suffix
    const repo = out.replace(/\/$/, "").split(/[\/:]/).pop();
    return repo ? repo.replace(/\.git$/, "") : null;
  } catch {
    return null;
  }
}

/** Strip characters that don't play well in popup titles. */
function sanitizeLabel(s: string): string {
  return s.replace(/[^a-zA-Z0-9 ._\-\u4e00-\u9fff]/g, "").trim().slice(0, 50);
}

/**
 * Extract the assistant's last text response from the agent message history.
 * Used as the notification body so the popup shows what actually happened.
 *
 * Walks messages in reverse to find the most recent assistant message with
 * non-empty text content. Tool-call-only turns are skipped — they don't tell
 * the user anything useful in a popup.
 */
export function extractLastAssistantText(messages: AgentMessage[] | undefined): string {
  if (!messages || messages.length === 0) return "";

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    // AgentMessage is a union; we only care about assistant role
    if (typeof msg !== "object" || msg === null) continue;
    if ((msg as { role?: string }).role !== "assistant") continue;

    const content = (msg as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    // Concatenate text blocks (skip thinking / toolCall)
    const text = content
      .filter((block): block is { type: "text"; text: string } =>
        typeof block === "object" &&
        block !== null &&
        (block as { type?: string }).type === "text")
      .map((block) => block.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (text) return truncate(text, MAX_SUMMARY_CHARS);
  }

  return "";
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  // Try to cut at a word boundary near the limit
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut) + "…";
}

/** Event types that produce a distinct notification status/title suffix. */
export type NotifyStatus = "done" | "error" | "compacting";

/** Human-readable status label for the title. */
const STATUS_LABEL: Record<NotifyStatus, string> = {
  done: "done",
  error: "error",
  compacting: "compacting",
};

export interface NotifyContent {
  title: string;
  body: string;
  status: NotifyStatus;
}

/**
 * Build notification title + body for a given event.
 *
 * title: "<project> · <status>"
 * body:  event-specific (assistant summary for done, tool name for error,
 *        fixed text for compacting).
 */
export function buildNotifyContent(
  status: NotifyStatus,
  project: string,
  bodyOverride?: string,
): NotifyContent {
  const title = `${project} · ${STATUS_LABEL[status]}`;

  let body: string;
  if (bodyOverride !== undefined) {
    body = bodyOverride;
  } else if (status === "done") {
    body = "Task complete";
  } else if (status === "error") {
    body = "Tool failed";
  } else {
    body = "Context compacting";
  }

  return { title, body, status };
}
