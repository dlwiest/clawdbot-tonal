---
name: tonal
description: Access Tonal workout data (muscle readiness, workout history, stats, streaks). Use for workout planning, recovery advice, or when context about training state would improve recommendations.
---

# Tonal Integration

Full port of ts-tonal-mcp functionality. Fetch fitness metrics, manage workouts, browse movements.

## Quick Reference

```bash
cd ~/clawd/skills/tonal

# Daily status
node scripts/tonal.mjs today
node scripts/tonal.mjs readiness
node scripts/tonal.mjs stats

# Workout history
node scripts/tonal.mjs workouts [limit]
node scripts/tonal.mjs progress

# Custom workouts
node scripts/tonal.mjs custom
node scripts/tonal.mjs details "Workout Name"
node scripts/tonal.mjs edit "Workout Name"      # Export to JSON
node scripts/tonal.mjs create workout.json
node scripts/tonal.mjs update "Name" edited.json
node scripts/tonal.mjs delete "Workout Name"

# Movement database
node scripts/tonal.mjs movements [muscle,groups]
node scripts/tonal.mjs search <query>

# Memory summary
node scripts/tonal.mjs summary ~/clawd/memory/health/tonal-YYYY-MM-DD.md
```

## Interpreting Muscle Readiness

| Readiness | Status | Action |
|-----------|--------|--------|
| 80-100% | 🟢 Ready | Full capacity |
| 60-79% | 🟡 Partial | Can train if needed |
| <60% | 🔴 Fatigued | Prioritize recovery |

## Workout Recommendations

Based on muscle readiness:
- **Push fatigued** (chest/shoulders/triceps <50%) → Pull or legs
- **Pull fatigued** (back/biceps <50%) → Push or legs
- **Legs fatigued** (quads/glutes/hams <50%) → Upper body
- **All good** → Any workout

## Creating Workouts

### Using movement metadata to build better workout blocks

When creating multi-exercise blocks, do **not** infer compatibility from movement names alone. Tonal movement objects expose setup metadata that can help you group exercises more intelligently.

Useful fields in `onMachineInfo` include:
- `armAngle` → Low / Middle / High
- `cartHeight` → Low / Middle / High
- `accessory` → Handles / Rope / StraightBar / etc.
- `spotterDisabled`, `burnoutDisabled`, `chainsDisabled`, `eccentricDisabled`, `smartFlexDisabled`, `autoWeightOffDisabled`

A practical block-building order of operations is:
1. Prefer easy setup handling within the block
2. Prefer matching `accessory`
3. Prefer matching `baseOfSupport` when practical
4. Use `armAngle` and `cartHeight` as strong guides
5. Then, if possible, alternate muscle groups within the block

To inspect the raw movement object directly, use:
```bash
node scripts/tonal.mjs movement-json "Movement Name"
```

### Rep note for alternating movements

For alternating movements, Tonal treats prescribed reps as **total reps**, not per-side reps.
If the programming intent is 10 reps per side, set **20 total reps**.

### Note for future mode support

Before applying modes like burnout, spotter, chains, eccentric, or smart flex automatically, inspect the movement metadata to see whether Tonal exposes those modes as disabled for that movement.

JSON format for `create` command:
```json
{
  "title": "Push Day",
  "description": "Chest and triceps focus",
  "exercises": [
    { "movementName": "Bench Press", "sets": 4, "reps": 8, "weight": 80 },
    { "movementName": "Incline Chest Press", "sets": 3, "reps": 10 },
    { "movementName": "Tricep Pushdown", "sets": 3, "reps": 12, "block": 2 },
    { "movementName": "Overhead Tricep Extension", "sets": 3, "reps": 12, "block": 2 }
  ]
}
```

**Block grouping**: Same `block` number = exercises alternate (supersets).

**Duration-based exercises** (planks, etc.): Use `duration` instead of `reps`:
```json
{ "movementName": "Plank", "sets": 3, "duration": 30 }
```

## Combining with Oura

For best workout advice, check both:
1. **Oura readiness** — Overall recovery (HRV, sleep)
2. **Tonal muscle readiness** — Which muscles are recovered

| Oura | Tonal | Recommendation |
|------|-------|----------------|
| Low (<70) | Any | Rest or light work |
| Good | Fatigued muscles | Train different group |
| Good | All ready | Full workout |

## Credentials

Stored at `~/.clawdbot/secrets/tonal.json`. Do not expose.
