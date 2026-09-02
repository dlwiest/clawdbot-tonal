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

Workout files for `create` and `update` use this JSON format:

```json
{
  "title": "Push Day",
  "description": "Chest and triceps",
  "exercises": [
    { "movementName": "Bench Press", "sets": 4, "reps": 8, "weight": 80 },
    { "movementName": "Tricep Pushdown", "sets": 3, "reps": 12, "block": 2 },
    { "movementName": "Overhead Tricep Extension", "sets": 3, "reps": 12, "block": 2 },
    { "movementName": "Plank", "sets": 3, "duration": 30 }
  ]
}
```

Each exercise requires `movementName` and either `sets` or `setDetails`. Use
`reps` for rep-based movements and `duration` in seconds for duration-based
movements. `weight` is the percentage of the movement's one-rep maximum. Give
exercises the same `block` number to alternate them as a superset.
`block` must be a non-negative integer. `isWarmup` marks all of an exercise's
sets as warm-up sets unless an individual `setDetails[].warmUp` overrides it.

Use `setDetails` when sets have different programming. It is authoritative when
present, and its length defines the set count. If `sets` is also present, it must
match `setDetails.length`. Each entry accepts:

```json
{
  "reps": 8,
  "weight": 75,
  "warmUp": false,
  "dropSet": false,
  "burnout": false,
  "description": "Optional set note"
}
```

For a duration-based movement, use `"duration": 30` instead of `reps`.

Specify either `reps` or `duration` in an entry, never both. Every field except
the movement's goal (`reps` or `duration`) is optional. Exercise-level `weight`
is the default for entries that omit `weight`; an explicit per-set `0` is
preserved.

For example, this non-uniform ramp programs 12, 8, and 5 reps at 50%, 75%, and
90%, while preserving set flags and descriptions:

```json
{
  "title": "Ramp Day",
  "description": "Non-uniform programming",
  "exercises": [
    {
      "movementName": "Bench Press",
      "setDetails": [
        { "reps": 12, "weight": 50, "warmUp": true, "description": "Warm-up" },
        { "reps": 8, "weight": 75, "dropSet": true, "description": "Working set" },
        { "reps": 5, "weight": 90, "burnout": true, "description": "Top set" }
      ]
    }
  ]
}
```

## Dependencies

- [@dlwiest/ts-tonal-client](https://github.com/dlwiest/ts-tonal-client)

## See also

- [ts-tonal-mcp](https://github.com/dlwiest/ts-tonal-mcp) — MCP server version for Claude Desktop/Code
- [ts-tonal-client](https://github.com/dlwiest/ts-tonal-client) — The underlying TypeScript client
- [hermes-tonal](https://github.com/dlwiest/hermes-tonal) — Hermes Agent integration, if you have moved off Clawdbot/OpenClaw

## License

ISC
