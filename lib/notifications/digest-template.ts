// BK-214 — table-based, fully-inline-styled HTML for the digest email.
// Mirrors `.context/designs/bunkai-test-management-tool/bk-208-notifications/
// email-digest-template.html` (§4.13) structurally and token-for-token, with
// one live-UI-first departure (Critical Rule #14): the mockup's per-item
// "RUN-452"/"BUG-118" id chips do not correspond to anything the schema
// has (run/bug ids are UUIDs, there is no short human-readable code) and the
// LIVE in-app row (`components/notifications/NotificationRow.tsx`) already
// omits them — so this template does too, and uses the same relative-time
// formatting the live row uses instead of the mockup's absolute "08:42".
//
// Every color/spacing value below is the frozen §2 token, duplicated inline
// because email clients strip <style> blocks (same reasoning the mockup's
// own header comment gives).

import type { DigestForUser, DigestNotificationLine, DigestProjectGroup } from './digest-grouping';
import { webUrl } from '../urls';
import { formatRelativeTime } from './relative-time';

const FONT_SANS = 'Inter,-apple-system,\'Segoe UI\',Helvetica,Arial,sans-serif';
const FONT_MONO = '\'JetBrains Mono\',\'SF Mono\',Menlo,Consolas,monospace';

const SIGNAL_COLORS: Record<'pass' | 'fail' | 'aborted', { fg: string, bg: string }> = {
  pass: { fg: '#2fb673', bg: 'rgba(47,182,115,0.10)' },
  fail: { fg: '#e5484d', bg: 'rgba(229,72,77,0.10)' },
  aborted: { fg: '#e8a838', bg: 'rgba(232,168,56,0.10)' },
};

// Every string interpolated into this template can originate from
// user-typed content (a bug title, a run's snapshotted test title) — this is
// hand-built HTML with no framework auto-escaping, so every value crosses
// this before it reaches a template literal.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderItem(item: DigestNotificationLine): string {
  const titleHtml = item.href
    ? `<a href="${escapeHtml(item.href)}" target="_blank" style="font-family:${FONT_SANS};font-size:13px;font-weight:600;color:#f1f3f5;text-decoration:none;">${escapeHtml(item.title)}</a>`
    : `<span style="font-family:${FONT_SANS};font-size:13px;font-weight:600;color:#f1f3f5;">${escapeHtml(item.title)}</span>`;

  const reasonHtml = item.reason
    ? `<div style="font-family:${FONT_SANS};font-size:11.5px;color:#6b727c;padding-top:2px;">Reason: ${escapeHtml(item.reason)}</div>`
    : '';

  const signalHtml = item.signal
    ? (() => {
        const colors = SIGNAL_COLORS[item.signal.status];
        return `<span style="font-family:${FONT_SANS};font-size:11px;font-weight:600;color:${colors.fg};background-color:${colors.bg};border-radius:3px;padding:1px 6px;">${escapeHtml(item.signal.label)}</span>`;
      })()
    : '';

  return `
                <tr>
                  <td style="padding:12px 24px;border-bottom:1px solid rgba(255,255,255,0.05);">
                    ${titleHtml}
                    ${reasonHtml}
                    <div style="padding-top:5px;">
                      ${signalHtml}
                      <span style="font-family:${FONT_MONO};font-size:11px;color:#6b727c;">&nbsp;${escapeHtml(formatRelativeTime(item.createdAt))}</span>
                    </div>
                  </td>
                </tr>`;
}

function renderProjectGroup(group: DigestProjectGroup): string {
  const items = group.items.map(renderItem).join('');
  const overflow = group.overflowCount > 0
    ? `
                <tr>
                  <td style="padding:8px 24px 12px;border-bottom:1px solid rgba(255,255,255,0.05);">
                    <span style="font-family:${FONT_SANS};font-size:11.5px;font-style:italic;color:#6b727c;">and ${group.overflowCount} more unread notification${group.overflowCount === 1 ? '' : 's'}</span>
                  </td>
                </tr>`
    : '';

  return `
                <tr>
                  <td bgcolor="#101216" style="background-color:#101216;padding:8px 24px;border-bottom:1px solid rgba(255,255,255,0.05);">
                    <span style="font-family:${FONT_SANS};font-size:12.5px;font-weight:600;color:#d4d8de;">${escapeHtml(group.projectName)}</span>
                    <span style="font-family:${FONT_MONO};font-size:11px;color:#9aa1ab;">&nbsp;(${group.totalCount} unread)</span>
                  </td>
                </tr>${items}${overflow}`;
}

export interface BuildDigestEmailOptions {
  digest: DigestForUser
  /** UTC calendar date the digest was composed, formatted for the header/subject (e.g. "August 27, 2026"). */
  digestDateLabel: string
}

export function buildDigestEmailSubject(totalCount: number, digestDateLabel: string): string {
  return `[Bunkai] ${totalCount} unread notification${totalCount === 1 ? '' : 's'} — ${digestDateLabel}`;
}

export function buildDigestEmailHtml({ digest, digestDateLabel }: BuildDigestEmailOptions): string {
  const inboxUrl = webUrl('/home?openNotifications=1');
  const preferencesUrl = webUrl('/settings/notifications');
  const projectNames = digest.projects.map(p => p.projectName).join(' and ');
  const groups = digest.projects.map(renderProjectGroup).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(buildDigestEmailSubject(digest.totalCount, digestDateLabel))}</title>
</head>
<body style="margin:0;background-color:#0a0b0d;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0b0d" style="background-color:#0a0b0d;">
  <tr>
    <td align="center" style="padding:24px 12px;">

      <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
        ${digest.totalCount} unread notification${digest.totalCount === 1 ? '' : 's'} in ${escapeHtml(projectNames)}. Open your inbox to catch up.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
      </div>

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

        <tr>
          <td style="padding:0 4px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:'Noto Serif JP',Georgia,serif;font-weight:700;font-size:18px;color:#f1f3f5;white-space:nowrap;" lang="ja">分解&nbsp;<span lang="en" style="font-family:${FONT_SANS};font-weight:700;font-size:14px;letter-spacing:-0.02em;color:#f1f3f5;">Bunkai</span></td>
                <td align="right" style="font-family:${FONT_MONO};font-size:11px;color:#6b727c;">DAILY&nbsp;DIGEST</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td bgcolor="#14171c" style="background-color:#14171c;border:1px solid #232830;border-radius:10px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

              <tr>
                <td style="padding:20px 24px 16px;border-bottom:1px solid rgba(255,255,255,0.05);">
                  <div style="font-family:${FONT_SANS};font-size:18px;font-weight:700;color:#f1f3f5;line-height:1.2;">${digest.totalCount} unread notification${digest.totalCount === 1 ? '' : 's'}</div>
                  <div style="font-family:${FONT_SANS};font-size:12.5px;color:#9aa1ab;padding-top:4px;">${escapeHtml(digestDateLabel)} · ${escapeHtml(projectNames)}</div>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
                    <tr>
                      <td bgcolor="#d9543f" style="background-color:#d9543f;border-radius:5px;">
                        <a href="${escapeHtml(inboxUrl)}" target="_blank" style="display:inline-block;padding:8px 16px;font-family:${FONT_SANS};font-size:12.5px;font-weight:600;color:#ffffff;text-decoration:none;">Open inbox&nbsp;&rarr;</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
${groups}
              <tr>
                <td bgcolor="#101216" style="background-color:#101216;padding:14px 24px;border-top:1px solid rgba(255,255,255,0.05);border-radius:0 0 10px 10px;">
                  <span style="font-family:${FONT_SANS};font-size:12.5px;color:#9aa1ab;">All ${digest.totalCount} items stay unread until you open them.&nbsp;</span>
                  <a href="${escapeHtml(inboxUrl)}" target="_blank" style="font-family:${FONT_SANS};font-size:12.5px;font-weight:600;color:#e87060;text-decoration:underline;">Open inbox&nbsp;&rarr;</a>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 4px 0;">
            <div style="font-family:${FONT_SANS};font-size:11.5px;color:#6b727c;line-height:1.5;">
              You are receiving this daily digest because you have email notifications enabled.
              <a href="${escapeHtml(preferencesUrl)}" target="_blank" style="color:#9aa1ab;text-decoration:underline;">Manage notification preferences</a>
            </div>
            <div style="font-family:${FONT_SANS};font-size:11.5px;color:#4a5057;padding-top:8px;line-height:1.5;">
              Bunkai (<span lang="ja" style="font-family:'Noto Serif JP',Georgia,serif;">分解</span>) is the real Japanese martial-arts term — not the anime word.
            </div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
