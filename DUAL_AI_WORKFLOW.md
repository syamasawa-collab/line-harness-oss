# Claude Code + Codex collaborative development

This repository is developed with BOTH Claude Code and OpenAI Codex. Neither replaces the other.

## Before working
- Read existing `CLAUDE.md`, `AGENTS.md`, `README.md`, project docs and relevant `.claude/skills/` where present. Existing project-specific instructions take precedence over this generic workflow.
- Check the current remote branch, recent commits, open PRs, and local uncommitted work.
- Use separate task branches/worktrees when agents work concurrently. Never overwrite the other agent's changes.
- Preserve current architecture, design, hosting and deployment settings.

## Development and verification
- Derive install, build and test commands from actual project files; never assume a framework or claim a test passed without running it.
- For static sites, verify rendered output; for services and integrations, avoid calling production endpoints in tests without approval.
- Store durable decisions and outstanding tasks in versioned project documentation, not only in AI chat sessions.
- Keep `CLAUDE.md` and existing Claude skills intact. Codex should follow their relevant project constraints.

## Safety and delivery
- Do not expose or commit API keys, passwords, personal information, or environment files.
- Do not send messages, modify external data, change credentials, merge into the production branch, or deploy without explicit authorization.
- Prefer PR review before merging. Report the exact branch, changed files, checks actually run, and whether deployment occurred.

Repository: syamasawa-collab/line-harness-oss
