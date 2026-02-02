# Skill Authoring Best Practices

This document summarizes the Claude Skill authoring best practices implemented in this project.

## Core Principles

### 1. Conciseness is Key

Claude is already smart. Only add context Claude doesn't already have.

**Challenge each piece of information:**
- "Does Claude really need this explanation?"
- "Can I assume Claude knows this?"
- "Does this paragraph justify its token cost?"

### 2. Skill Naming

Use **gerund form** (verb + -ing) for skill names:

| Good | Bad |
|------|-----|
| `avoiding-direct-manipulation` | `avoid-direct-manipulation` |
| `using-viewport-service` | `use-viewport-service` |
| `handling-errors-gracefully` | `error-handling` |

**Requirements:**
- Max 64 characters
- Lowercase letters, numbers, and hyphens only
- No reserved words: "anthropic", "claude"

### 3. Description Format

Write in **third person** and include **both what AND when**:

```yaml
# Good
description: Prevents direct viewport manipulation. Use when working with OHIF viewer components.

# Bad
description: I help you avoid viewport issues
description: You should use this for viewports
description: Avoid viewport manipulation  # Missing "when to use"
```

**Requirements:**
- Max 1024 characters
- No XML tags
- Third person voice
- Includes usage context

## Content Guidelines

### Line Budget

Keep SKILL.md under **500 lines**. If larger:
- Split into reference files (EXAMPLES.md, DETAILS.md)
- Use progressive disclosure pattern
- Main file should be an overview with links

### Progressive Disclosure Pattern

```
skill-folder/
├── SKILL.md           # Overview + references (< 500 lines)
├── EXAMPLES.md        # Code examples
└── DETAILS.md         # Detailed guidance
```

### No Time-Sensitive Information

Store dates as metadata, not in main content:

```markdown
<!-- Good: metadata comment -->
<!--
Source Metadata:
PR: #123
Date: 2024-01-15
-->

<!-- Bad: in main body -->
## Source
- Date: 2024-01-15
```

### Avoid Verbose Patterns

Remove these:
- "There are many options/ways to..."
- "First, you'll need to..."
- "Basically/essentially/simply/just"
- Explanations of well-known concepts (PDF, JSON, API, etc.)

## Structure Template

```markdown
---
name: gerund-form-skill-name
description: Third-person description of what it does. Use when [context].
---

# Skill Title

## Instructions

Concise, actionable guidance.

## Anti-Pattern / Best Practice

Specific guidance on what to avoid or do.

## Examples

### Bad

```code
// minimal example
```

### Good

```code
// minimal example
```

<!--
Source Metadata:
PR: #123
Author: @username
-->
```

## Validation Checklist

Run `npm run validate` to check:

- [ ] Name uses gerund form
- [ ] Name is lowercase with hyphens only
- [ ] Name ≤ 64 characters
- [ ] Description in third person
- [ ] Description includes "when to use"
- [ ] Description ≤ 1024 characters
- [ ] No XML tags in description
- [ ] SKILL.md ≤ 500 lines
- [ ] No time-sensitive information in body
- [ ] No Windows-style paths
- [ ] References one level deep

## Reference

- [Claude Skill Authoring Best Practices](https://docs.anthropic.com/docs/en/agents-and-tools/agent-skills/authoring)
- [Skills Overview](https://docs.anthropic.com/docs/en/agents-and-tools/agent-skills/overview)
