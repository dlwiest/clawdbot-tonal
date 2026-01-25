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
