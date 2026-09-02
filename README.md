> ## ⚠️ Deprecated — do not use
>
> **This skill has two bugs that silently corrupt your custom workouts.** They are
> fixed in the projects below, but not here.
>
> 1. Editing a workout flattens its set programming. `scripts/tonal.mjs` rebuilds
>    every set from the first set of each exercise, so a 12/8/5 ramp at 50/75/90%
>    saves back as 12/12/12 at 50/50/50, and `warmUp` / `dropSet` / `burnout`
>    flags and per-set descriptions are erased. This happens even if you change
>    nothing.
> 2. Using the same movement twice in one block deletes half the sets. Set groups
>    are keyed by movement id, so a pyramid or drop set collapses two exercises
>    into one on the next save.
>
> Both were reproduced against a real Tonal account. The write path reports
> success either way, so the loss is invisible until you look at the workout.
>
> **Use instead:**
>
> - [`ts-tonal-mcp`](https://github.com/dlwiest/ts-tonal-mcp) — MCP server for
>   Claude Desktop, Claude Code, or any MCP client
> - [`hermes-tonal`](https://github.com/dlwiest/hermes-tonal) — Hermes Agent
>   integration: registers the MCP server plus a companion skill
> - [`@dlwiest/ts-tonal-client`](https://www.npmjs.com/package/@dlwiest/ts-tonal-client)
>   — the underlying TypeScript client, if you are building your own thing
>
> This repository stays up for reference and for anyone who linked to it. It is
> not maintained.

# clawdbot-tonal

Clawdbot skill for talking to your Tonal — muscle readiness, workout history, the works.

Full port of [ts-tonal-mcp](https://github.com/dlwiest/ts-tonal-mcp) functionality, optimized for [Clawdbot](https://clawd.bot).

## What it does

- Check muscle readiness before workouts
- View workout history and streaks
- Browse the full movement database
- Create, edit, and delete custom workouts
- Generate health summaries for Clawdbot's memory system

## Installation

Clone into your Clawdbot skills directory:

```bash
cd ~/clawd/skills
git clone https://github.com/dlwiest/clawdbot-tonal.git tonal
cd tonal
npm install
```

Add your credentials:

```bash
mkdir -p ~/.clawdbot/secrets
echo '{"username": "your@email.com", "password": "your-password"}' > ~/.clawdbot/secrets/tonal.json
```

## Usage

```bash
cd ~/clawd/skills/tonal

# Quick status
node scripts/tonal.mjs today
node scripts/tonal.mjs readiness

# Stats and history
node scripts/tonal.mjs stats
node scripts/tonal.mjs progress
node scripts/tonal.mjs workouts

# Custom workouts
node scripts/tonal.mjs custom
node scripts/tonal.mjs details "Workout Name"
node scripts/tonal.mjs create workout.json
node scripts/tonal.mjs edit "Workout Name"
node scripts/tonal.mjs update "Workout Name" edited.json
node scripts/tonal.mjs delete "Workout Name"

# Movement database
node scripts/tonal.mjs movements Chest,Back
node scripts/tonal.mjs search "bench press"
```

## Creating workouts

```json
{
  "title": "Push Day",
  "description": "Chest and triceps",
  "exercises": [
    { "movementName": "Bench Press", "sets": 4, "reps": 8, "weight": 80 },
    { "movementName": "Incline Chest Press", "sets": 3, "reps": 10 },
    { "movementName": "Tricep Pushdown", "sets": 3, "reps": 12, "block": 2 },
    { "movementName": "Overhead Tricep Extension", "sets": 3, "reps": 12, "block": 2 }
  ]
}
```

Same `block` number = exercises alternate (supersets).

## Dependencies

- [@dlwiest/ts-tonal-client](https://github.com/dlwiest/ts-tonal-client)

## See also

- [ts-tonal-mcp](https://github.com/dlwiest/ts-tonal-mcp) — MCP server version for Claude Desktop/Code
- [ts-tonal-client](https://github.com/dlwiest/ts-tonal-client) — The underlying TypeScript client

## License

ISC
