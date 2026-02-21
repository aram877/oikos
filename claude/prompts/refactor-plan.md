# Prompt: Refactor Plan

Create a safe, incremental refactor plan for the current codebase.

## How to Use

Paste the code or describe the problem area, then ask:

> "Create a refactor plan for this using the structure below."

## Deliver

1. Problems detected (what is wrong and why it matters)
2. Refactor goals (what the code should look like after)
3. Incremental steps — each step must leave the app working
4. Risk areas (what could break and how to check)
5. Test coverage recommendations before starting
6. Definition of done for the refactor

## Principles

- No big-bang rewrites
- Each step is independently mergeable
- Tests must pass at every step
- No scope creep — only fix what's described
