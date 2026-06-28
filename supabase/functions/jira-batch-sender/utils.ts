const TELEGRAM_MAX_LEN = 4000;

export const escapeHtml = (unsafe?: string | null) => {
  if (!unsafe) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
};

export const adfToText = (node: any, depth = 0): string => {
  if (!node) return "";
  if (typeof node === "string") return escapeHtml(node);
  if (typeof node !== "object") return "";

  const indent = "  ".repeat(depth);

  if (node.type === "doc") {
    return node.content?.map((c: any) => adfToText(c, depth)).join("");
  }

  if (node.type === "taskList") {
    return node.content?.map((c: any) => adfToText(c, depth)).join("");
  }

  if (node.type === "taskItem") {
    const state = node.attrs?.state === "DONE" ? "[x]" : "[ ]";
    const content = node.content?.map((c: any) => adfToText(c, 0)).join("").trim() || "";
    return `${indent}${state} ${content}\n`;
  }

  if (node.type === "paragraph") {
    const content = node.content?.map((c: any) => adfToText(c, 0)).join("") || "";
    return content ? `${indent}${content}\n` : "";
  }

  if (node.type === "heading") {
    const content = node.content?.map((c: any) => adfToText(c, 0)).join("") || "";
    return content ? `${indent}${content}\n` : "";
  }

  if (node.type === "bulletList" || node.type === "orderedList") {
    return node.content?.map((c: any) => adfToText(c, depth)).join("");
  }

  if (node.type === "listItem") {
    const content = node.content?.map((c: any) => adfToText(c, depth + 1)).join("").trim();
    return `${indent}• ${content}\n`;
  }

  if (node.type === "blockquote") {
    return node.content?.map((c: any) => adfToText(c, depth)).join("");
  }

  if (node.type === "codeBlock") {
    const content = node.content?.map((c: any) => adfToText(c, 0)).join("") || "";
    return `${indent}${content}\n`;
  }

  if (node.type === "text") {
    const text = escapeHtml(node.text || "");
    if (node.marks?.some((m: any) => m.type === "strike")) {
      return `<s>${text}</s>`;
    }
    if (node.marks?.some((m: any) => m.type === "strong")) {
      return `<b>${text}</b>`;
    }
    if (node.marks?.some((m: any) => m.type === "em")) {
      return `<i>${text}</i>`;
    }
    if (node.marks?.some((m: any) => m.type === "code")) {
      return `<code>${text}</code>`;
    }
    return text;
  }

  if (node.type === "hardBreak") {
    return "\n";
  }

  if (node.content) {
    return node.content.map((c: any) => adfToText(c, depth)).join("");
  }

  return "";
};

export const cleanJiraMarkup = (text: string): string => {
  if (!text) return "";
  return text
    .replace(/\[~accountid:[^\]]+\]/g, "(user mentioned)")
    .replace(/\[~([^\]]+)\]/g, "(@$1)")
    .replace(/\{noformat\}[\\s\\S]*?\{noformat\}/g, "(code block)")
    .replace(/\{code:(\w+)\}[\\s\\S]*?\{code\}/g, "($1 code block)")
    .replace(/\{code\}[\\s\\S]*?\{code\}/g, "(code block)")
    .replace(/\{panel[^}]*\}[\\s\\S]*?\{panel\}/g, "(panel)")
    .replace(/\{color:[^\}]*\}([\\s\\S]*?)\{color\}/g, "$1")
    .replace(/\{quote\}[\\s\\S]*?\{quote\}/g, "(quote)")
    .replace(/\{\{([^}]+)\}\}/g, "`$1`")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\+([^+]+)\+/g, "$1")
    .replace(/\?\?([^?]+)\?\?/g, "$1")
    .replace(/\^([^^]+)\^/g, "$1")
    .replace(/^----+$/gm, "(separator)")
    .replace(/-([^\s\][\-]*)-/g, "$1")
    .replace(/bq\. /g, "")
    .replace(/\\\\\\\\/g, "\n")
    .replace(/^h[1-6]\.\s+/gm, "")
    .replace(/^\*\s+/gm, "• ")
    .replace(/^#\s+/gm, "• ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "(image: $1)")
    .replace(/!([^\s|!]+)(?:\|[^!]*)?!/g, "(image: $1)")
    .replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$1 ($2)")
    .replace(/\[([^\s][^\]]+)\]/g, "$1")
    .trim();
};

export const extractDescription = (desc: any): string => {
  if (!desc) return "";
  if (typeof desc === "string") return cleanJiraMarkup(desc);
  if (typeof desc === "object" && desc.type === "doc") {
    const text = adfToText(desc);
    return text
      .split("\n")
      .map(l => l.trimEnd())
      .filter(l => l.length > 0 || l === "")
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return "";
};

export interface IssueUpdate {
  key: string;
  summary: string;
  url: string;
  user: string;
  line: string;
}

export function parseLabelsDiff(fromStr: string | null, toStr: string | null): { added: string[]; removed: string[] } {
  const parse = (s: string | null) => s ? s.split(",").map(l => l.trim()).filter(Boolean) : [];
  const from = new Set(parse(fromStr));
  const to = new Set(parse(toStr));
  const added = [...to].filter(l => !from.has(l));
  const removed = [...from].filter(l => !to.has(l));
  return { added, removed };
}

export function extractUpdates(payload: any, jiraDomain: string): IssueUpdate[] {
  const updates: IssueUpdate[] = [];
  const event = payload.webhookEvent;
  const issue = payload.issue;
  if (!issue) return updates;

  const key = issue.key;
  const summary = issue.fields?.summary || "";
  const url = `https://${jiraDomain}/browse/${key}`;
  const user = escapeHtml(payload.user?.displayName || payload.changelog?.author?.displayName || "Unknown");

  if (event === "jira:issue_created") {
    const status = escapeHtml(issue.fields?.status?.name || "Unknown");
    const assignee = escapeHtml(issue.fields?.assignee?.displayName || "Unassigned");
    const priority = escapeHtml(issue.fields?.priority?.name || "\u2014");
    const desc = extractDescription(issue.fields?.description);
    updates.push({ key, summary, url, user, line: `\uD83C\uDD95 Created \u00B7 ${status} \u00B7 ${priority} \u00B7 ${assignee}` });
    if (desc) {
      updates.push({ key, summary, url, user, line: `\uD83D\uDCC4 ${desc.slice(0, 500)}` });
    }
  } else if (event === "jira:issue_updated" && payload.changelog?.items?.length) {
    for (const item of payload.changelog.items) {
      const field = item.field;
      const from = escapeHtml(item.fromString) || "\u2014";
      const to = escapeHtml(item.toString) || "\u2014";

      if (field === "status") {
        if (item.fromString === item.toString) continue;
        updates.push({ key, summary, url, user, line: `\uD83D\uDE9A Status: ${from} \u2192 ${to}` });
      } else if (field === "assignee") {
        updates.push({ key, summary, url, user, line: `\uD83D\uDC64 Assignee: ${from} \u2192 ${to}` });
      } else if (field === "priority") {
        updates.push({ key, summary, url, user, line: `\u26A1 Priority: ${from} \u2192 ${to}` });
      } else if (field === "summary") {
      } else if (field === "description") {
        const desc = extractDescription(issue.fields?.description);
        if (desc) {
          updates.push({ key, summary, url, user, line: `\uD83D\uDCC4 ${desc.slice(0, 500)}` });
        }
      } else if (field === "resolution") {
        if (to !== "Done") {
          updates.push({ key, summary, url, user, line: `\uD83C\uDFC1 Resolution: ${from} \u2192 ${to}` });
        }
      } else if (field === "issuetype") {
        updates.push({ key, summary, url, user, line: `\uD83D\uDD04 Type: ${from} \u2192 ${to}` });
      } else if (field === "duedate") {
        const fmt = (s: string) => s ? s.split("T")[0] : s;
        updates.push({ key, summary, url, user, line: `\uD83D\uDCC5 Due date: ${fmt(from)} \u2192 ${fmt(to)}` });
      } else if (field === "startdate") {
        const fmt = (s: string) => s ? s.split("T")[0] : s;
        updates.push({ key, summary, url, user, line: `\uD83D\uDCC5 Start date: ${fmt(from)} \u2192 ${fmt(to)}` });
      } else if (field === "labels") {
        const { added, removed } = parseLabelsDiff(item.fromString, item.toString);
        if (added.length === 0 && removed.length === 0) continue;
        const parts: string[] = [];
        for (const r of removed) parts.push(`-<s>${escapeHtml(r)}</s>`);
        for (const a of added) parts.push(`+${escapeHtml(a)}`);
        updates.push({ key, summary, url, user, line: `\uD83C\uDFF7 Labels: ${parts.join(", ")}` });
      } else if (field === "components") {
        updates.push({ key, summary, url, user, line: `\uD83E\uDDE9 Components: ${from} \u2192 ${to}` });
      } else if (field === "fixVersions") {
        updates.push({ key, summary, url, user, line: `\uD83D\uDD16 Fix version: ${from} \u2192 ${to}` });
      } else if (field === "sprint") {
        updates.push({ key, summary, url, user, line: `\uD83C\uDFC3 Sprint: ${from} \u2192 ${to}` });
      } else if (field === "reporter") {
        updates.push({ key, summary, url, user, line: `\uD83D\uDCE2 Reporter: ${from} \u2192 ${to}` });
      } else if (field === "story points" || field === "Story Points") {
        updates.push({ key, summary, url, user, line: `\uD83D\uDCCA Story points: ${from} \u2192 ${to}` });
      } else {
        updates.push({ key, summary, url, user, line: `\uD83D\uDCDD ${escapeHtml(field)}: ${from} \u2192 ${to}` });
      }
    }
  } else if (event === "comment_created") {
    const commentUser = escapeHtml(payload.comment?.author?.displayName || "Unknown");
    const body = extractDescription(payload.comment?.body).slice(0, 300);
    updates.push({ key, summary, url, user: commentUser, line: `\uD83D\uDCAC "${body}"` });
  } else if (event === "worklog_created") {
    const author = escapeHtml(payload.worklog?.author?.displayName || "Unknown");
    const time = escapeHtml(payload.worklog?.timeSpent || "?");
    updates.push({ key, summary, url, user: author, line: `\u23F1\uFE0F ${time}` });
  }

  return updates;
}

export function formatBatches(allUpdates: IssueUpdate[]): string[] {
  const tickets = new Map<string, { summary: string; url: string; users: Map<string, string[]> }>();

  for (const u of allUpdates) {
    if (!tickets.has(u.key)) {
      tickets.set(u.key, { summary: u.summary, url: u.url, users: new Map() });
    }
    const ticket = tickets.get(u.key)!;
    if (!ticket.users.has(u.user)) {
      ticket.users.set(u.user, []);
    }
    ticket.users.get(u.user)!.push(u.line);
  }

  const blocks: string[] = [];
  for (const [key, ticket] of tickets) {
    const header = `<a href="${escapeHtml(ticket.url)}">[${escapeHtml(key)}] ${escapeHtml(ticket.summary)}</a>`;
    const userLines: string[] = [];
    for (const [user, lines] of ticket.users) {
      const indentedLines = lines.map(l => `    ${l}`).join("\n");
      userLines.push(`  \uD83D\uDC64 ${user}\n${indentedLines}`);
    }
    blocks.push(`${header}\n${userLines.join("\n")}`);
  }

  const messages: string[] = [];
  let current = "";

  for (const block of blocks) {
    if (current.length === 0) {
      current = block;
    } else if (current.length + 2 + block.length <= TELEGRAM_MAX_LEN) {
      current += "\n\n" + block;
    } else {
      messages.push(current);
      current = block;
    }
  }
  if (current.length > 0) messages.push(current);

  return messages;
}
