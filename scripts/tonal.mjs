#!/usr/bin/env node
/**
 * Tonal Skill - Full port of ts-tonal-mcp functionality
 * Commands: readiness, stats, progress, workouts, custom, details, movements, search, create, edit, update, delete, today, summary
 */

import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const SECRETS_PATH = join(homedir(), '.clawdbot', 'secrets', 'tonal.json');

// ============================================================================
// CLIENT SETUP
// ============================================================================

async function getClient() {
  const TonalClient = (await import('@dlwiest/ts-tonal-client')).default;
  const secrets = JSON.parse(readFileSync(SECRETS_PATH, 'utf-8'));
  return TonalClient.create({
    username: secrets.username,
    password: secrets.password,
  });
}

// ============================================================================
// WORKOUT CONVERSION UTILITIES (from ts-tonal-mcp)
// ============================================================================

function exercisesToSets(exercises, movements) {
  const movementMap = new Map(movements.map(m => [m.name.toLowerCase(), m]));
  const processedExercises = [];
  const blockGroupToBlockNumber = new Map();
  let nextBlockNumber = 1;

  for (const exercise of exercises) {
    const movement = movementMap.get(exercise.movementName.toLowerCase());
    if (!movement) {
      throw new Error(`Movement "${exercise.movementName}" not found. Use 'search' to find valid names.`);
    }

    const isDurationBased = !movement.countReps;

    if (!exercise.sets || exercise.sets < 1) {
      throw new Error(`Exercise "${exercise.movementName}" must have at least 1 set`);
    }

    if (isDurationBased && (!exercise.duration || exercise.duration < 1)) {
      throw new Error(`"${exercise.movementName}" is duration-based - requires duration in seconds`);
    } else if (!isDurationBased && (!exercise.reps || exercise.reps < 1)) {
      throw new Error(`"${exercise.movementName}" is reps-based - requires reps`);
    }

    let blockNumber;
    if (exercise.block !== undefined) {
      if (!blockGroupToBlockNumber.has(exercise.block)) {
        blockGroupToBlockNumber.set(exercise.block, nextBlockNumber++);
      }
      blockNumber = blockGroupToBlockNumber.get(exercise.block);
    } else {
      blockNumber = nextBlockNumber++;
    }

    processedExercises.push({ exercise, movementId: movement.id, blockNumber, isDurationBased });
  }

  const blockToExercises = new Map();
  for (const pe of processedExercises) {
    if (!blockToExercises.has(pe.blockNumber)) blockToExercises.set(pe.blockNumber, []);
    blockToExercises.get(pe.blockNumber).push(pe);
  }

  const sets = [];
  const blockHasStarted = new Set();
  const sortedBlocks = Array.from(blockToExercises.entries()).sort((a, b) => a[0] - b[0]);

  for (const [blockNumber, exercisesInBlock] of sortedBlocks) {
    const maxSets = Math.max(...exercisesInBlock.map(pe => pe.exercise.sets));
    const movementToSetGroup = new Map();
    exercisesInBlock.forEach((pe, idx) => movementToSetGroup.set(pe.movementId, idx + 1));

    for (let round = 1; round <= maxSets; round++) {
      for (const pe of exercisesInBlock) {
        if (round <= pe.exercise.sets) {
          const isFirstSetOfBlock = !blockHasStarted.has(blockNumber);
          if (isFirstSetOfBlock) blockHasStarted.add(blockNumber);

          const setData = {
            blockStart: isFirstSetOfBlock,
            movementId: pe.movementId,
            repetition: round,
            repetitionTotal: pe.exercise.sets,
            blockNumber,
            burnout: false, spotter: false, eccentric: false, chains: false, flex: false, warmUp: false,
            weightPercentage: pe.exercise.weight || 0,
            setGroup: movementToSetGroup.get(pe.movementId),
            round,
            description: '',
            dropSet: false,
          };

          if (pe.isDurationBased) {
            setData.prescribedDuration = pe.exercise.duration || 0;
          } else {
            setData.prescribedReps = pe.exercise.reps || 0;
          }

          sets.push(setData);
        }
      }
    }
  }

  return sets;
}

function reconstructExercisesFromSets(sets, movements) {
  if (sets.length === 0) return [];
  const movementMap = new Map(movements.map(m => [m.id, m]));
  const exerciseGroups = new Map();

  for (const set of sets) {
    const key = `${set.blockNumber}-${set.setGroup}`;
    if (!exerciseGroups.has(key)) {
      exerciseGroups.set(key, { blockNumber: set.blockNumber, setGroup: set.setGroup, sets: [] });
    }
    exerciseGroups.get(key).sets.push(set);
  }

  const exercises = [];
  const sortedGroups = Array.from(exerciseGroups.values()).sort((a, b) => 
    a.blockNumber !== b.blockNumber ? a.blockNumber - b.blockNumber : a.setGroup - b.setGroup
  );

  for (const group of sortedGroups) {
    const firstSet = group.sets[0];
    const movement = movementMap.get(firstSet.movementId);
    const exercise = {
      movementName: movement?.name || firstSet.movementId,
      sets: firstSet.repetitionTotal,
      weight: firstSet.weightPercentage || undefined,
      block: firstSet.blockNumber,
    };

    if (firstSet.prescribedReps > 0) exercise.reps = firstSet.prescribedReps;
    const duration = firstSet.prescribedDuration || firstSet.durationBasedRepGoal;
    if (duration > 0) exercise.duration = duration;

    exercises.push(exercise);
  }

  return exercises;
}

// ============================================================================
// COMMANDS
// ============================================================================

async function cmdReadiness() {
  const client = await getClient();
  const readiness = await client.getMuscleReadiness();

  const upperBody = { Chest: readiness.Chest, Shoulders: readiness.Shoulders, Back: readiness.Back, Triceps: readiness.Triceps, Biceps: readiness.Biceps };
  const core = { Abs: readiness.Abs, Obliques: readiness.Obliques };
  const lowerBody = { Quads: readiness.Quads, Glutes: readiness.Glutes, Hamstrings: readiness.Hamstrings, Calves: readiness.Calves };

  const avg = obj => Math.round(Object.values(obj).reduce((a, b) => a + b, 0) / Object.values(obj).length);
  const upperAvg = avg(upperBody), coreAvg = avg(core), lowerAvg = avg(lowerBody);
  const overallAvg = avg(readiness);

  const needsRecovery = Object.entries(readiness).filter(([_, v]) => v < 60).map(([m]) => m);
  const status = pct => pct >= 80 ? '🟢' : pct >= 60 ? '🟡' : '🔴';

  console.log(`# 🎯 Muscle Readiness Report\n`);
  console.log(`**Overall Readiness: ${overallAvg}%**\n`);
  console.log(`## Regional Breakdown`);
  console.log(`- **Upper Body**: ${upperAvg}%`);
  console.log(`- **Core**: ${coreAvg}%`);
  console.log(`- **Lower Body**: ${lowerAvg}%\n`);

  console.log(`## Upper Body`);
  Object.entries(upperBody).forEach(([m, p]) => console.log(`- ${m}: ${p}% ${status(p)}`));
  console.log(`\n## Core`);
  Object.entries(core).forEach(([m, p]) => console.log(`- ${m}: ${p}% ${status(p)}`));
  console.log(`\n## Lower Body`);
  Object.entries(lowerBody).forEach(([m, p]) => console.log(`- ${m}: ${p}% ${status(p)}`));

  if (needsRecovery.length > 0) {
    console.log(`\n## ⚠️ Recovery Needed`);
    needsRecovery.forEach(m => console.log(`- ${m}: ${readiness[m]}%`));
  } else {
    console.log(`\n## ✅ All Systems Go!`);
  }
}

async function cmdStats() {
  const client = await getClient();
  const [userInfo, stats, streak] = await Promise.all([
    client.getUserInfo(),
    client.getUserStatistics(),
    client.getCurrentStreak(),
  ]);

  console.log(`# 📊 Your Fitness Stats\n`);
  console.log(`## Profile`);
  console.log(`**${userInfo.firstName} ${userInfo.lastName}** - Level ${userInfo.level}`);
  if (userInfo.location) console.log(`📍 ${userInfo.location}`);
  
  console.log(`\n## Lifetime Stats`);
  console.log(`- **Total Workouts**: ${stats.workouts.total.toLocaleString()}`);
  console.log(`- **Total Volume**: ${stats.volume.total.toLocaleString()} lbs`);
  console.log(`- **Total Time**: ${Math.round(stats.workouts.totalDuration / 3600)} hours`);
  console.log(`- **Avg per Workout**: ${stats.volume.avgVolumePerWorkout.toLocaleString()} lbs`);
  console.log(`- **Unique Movements**: ${stats.movements.total}`);
  
  console.log(`\n## Current Streak 🔥`);
  console.log(`- **Current**: ${streak.currentStreak} workout${streak.currentStreak !== 1 ? 's' : ''}`);
  console.log(`- **Personal Best**: ${streak.maxStreak} workout${streak.maxStreak !== 1 ? 's' : ''}`);
}

async function cmdProgress() {
  const client = await getClient();
  const [dailyMetrics, activities] = await Promise.all([
    client.getDailyMetrics(30),
    client.getActivitySummaries().then(all => all.slice(0, 10)),
  ]);

  const activeDays = dailyMetrics.filter(d => d.totalWorkouts > 0);
  const workoutFrequency = (activeDays.length / dailyMetrics.length) * 100;
  const totalVolume = activeDays.reduce((sum, d) => sum + d.totalVolume, 0);

  console.log(`# 📈 Recent Progress (30 days)\n`);
  console.log(`## Monthly Overview`);
  console.log(`- **Workout Days**: ${activeDays.length} out of 30 (${workoutFrequency.toFixed(1)}%)`);
  console.log(`- **Total Volume**: ${totalVolume.toLocaleString()} lbs`);

  if (workoutFrequency >= 80) console.log(`\n🔥 Exceptional consistency!`);
  else if (workoutFrequency >= 60) console.log(`\n💪 Great consistency!`);
  else if (workoutFrequency >= 40) console.log(`\n📈 Good progress!`);
  else console.log(`\n🌱 Building a habit!`);

  console.log(`\n## Recent Activity`);
  activities.slice(0, 5).forEach((a, i) => {
    const daysAgo = Math.floor((Date.now() - new Date(a.timestamp).getTime()) / (1000 * 60 * 60 * 24));
    const timeAgo = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;
    console.log(`${i + 1}. **${a.name}** (${timeAgo}) - ${a.totalVolume.toLocaleString()} lbs, ${Math.round(a.duration / 60)} min`);
  });
}

async function cmdWorkouts(limit = 10) {
  const client = await getClient();
  const activities = await client.getActivitySummaries();
  const recent = activities.slice(0, parseInt(limit));

  const totalVolume = recent.reduce((sum, w) => sum + w.totalVolume, 0);
  const totalTime = recent.reduce((sum, w) => sum + w.duration, 0);

  console.log(`# 🏋️ Recent Workouts\n`);
  console.log(`**Summary (last ${recent.length})**: ${totalVolume.toLocaleString()} lbs, ${Math.round(totalTime / 60)} min total\n`);

  recent.forEach(a => {
    const daysAgo = Math.floor((Date.now() - new Date(a.timestamp).getTime()) / (1000 * 60 * 60 * 24));
    const timeAgo = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;
    console.log(`**${a.name}** (${timeAgo})`);
    console.log(`- ${Math.round(a.duration / 60)} min | ${a.totalVolume.toLocaleString()} lbs | ${a.totalReps} reps`);
    console.log(`- Target: ${a.targetArea} | ${a.isGuidedWorkout ? 'Guided' : 'Free Lift'}\n`);
  });
}

async function cmdCustomWorkouts() {
  const client = await getClient();
  const workouts = await client.getUserWorkouts(0, 100);

  console.log(`# 🏗️ Your Custom Workouts\n`);
  console.log(`Found ${workouts.length} custom workouts\n`);

  workouts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  workouts.forEach((w, i) => {
    const date = new Date(w.createdAt).toLocaleDateString();
    console.log(`## ${i + 1}. ${w.title}`);
    console.log(`- Created: ${date} | Duration: ${Math.round(w.duration / 60)} min | Target: ${w.targetArea || 'N/A'}`);
    if (w.description) console.log(`- ${w.description}`);
    console.log();
  });
}

async function cmdWorkoutDetails(name) {
  if (!name) { console.error('Usage: tonal.mjs details "Workout Name"'); process.exit(1); }
  
  const client = await getClient();
  const workouts = await client.getUserWorkouts(0, 100);
  const match = workouts.find(w => w.title.toLowerCase() === name.toLowerCase());
  
  if (!match) { console.log(`❌ No workout found with name "${name}"`); return; }

  const detailed = await client.getWorkoutById(match.id);
  const movements = await client.getMovements();
  const movementMap = new Map(movements.map(m => [m.id, m.name]));

  console.log(`# 📋 ${detailed.title}\n`);
  console.log(`- Duration: ${Math.round(detailed.duration / 60)} min`);
  console.log(`- Target: ${detailed.targetArea || 'N/A'}`);
  if (detailed.description) console.log(`- Description: ${detailed.description}`);
  if (detailed.accessories?.length) console.log(`- Equipment: ${detailed.accessories.join(', ')}`);

  if (detailed.sets?.length) {
    console.log(`\n## Structure`);
    let currentBlock = -1;
    detailed.sets.forEach((set, i) => {
      if (set.blockNumber !== currentBlock) {
        currentBlock = set.blockNumber;
        console.log(`\n### Block ${currentBlock + 1}`);
      }
      const name = movementMap.get(set.movementId) || 'Unknown';
      let info = `${i + 1}. **${name}** - ${set.prescribedReps || set.prescribedDuration + 's'}`;
      if (set.weightPercentage) info += ` @ ${set.weightPercentage}%`;
      console.log(info);
    });
  }
}

async function cmdMovements(muscleGroups) {
  const client = await getClient();
  const movements = await client.getMovements();

  let filtered = movements;
  if (muscleGroups) {
    const groups = muscleGroups.split(',').map(g => g.trim().toLowerCase());
    filtered = movements.filter(m => 
      groups.some(g => m.muscleGroups.some(mg => mg.toLowerCase().includes(g)))
    );
  }

  console.log(`# 💪 Available Movements\n`);
  if (muscleGroups) console.log(`Filtered by: ${muscleGroups}\n`);
  console.log(`Found ${filtered.length} movements\n`);

  const grouped = filtered.reduce((acc, m) => {
    const primary = m.muscleGroups[0] || 'Other';
    if (!acc[primary]) acc[primary] = [];
    acc[primary].push(m);
    return acc;
  }, {});

  Object.entries(grouped).sort().forEach(([muscle, list]) => {
    console.log(`## ${muscle} (${list.length})`);
    list.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 10).forEach(m => {
      let line = `- **${m.name}**`;
      if (m.muscleGroups.length > 1) line += ` _(also: ${m.muscleGroups.slice(1).join(', ')})_`;
      console.log(line);
    });
    if (list.length > 10) console.log(`  _(and ${list.length - 10} more...)_`);
    console.log();
  });
}

async function cmdSearch(query) {
  const client = await getClient();
  const movements = await client.getMovements();

  const q = (query || '').toLowerCase();
  const filtered = movements.filter(m => 
    m.name.toLowerCase().includes(q) ||
    m.muscleGroups.some(mg => mg.toLowerCase().includes(q)) ||
    m.family?.toLowerCase().includes(q)
  );

  console.log(`# 🔍 Search: "${query}"\n`);
  console.log(`Found ${filtered.length} movements\n`);

  filtered.slice(0, 20).forEach(m => {
    console.log(`- **${m.name}** (${m.muscleGroups.join(', ')})`);
  });
  if (filtered.length > 20) console.log(`\n_(and ${filtered.length - 20} more...)_`);
}

async function cmdCreate(jsonFile) {
  if (!jsonFile) {
    console.log(`# Create Workout\n`);
    console.log(`Usage: tonal.mjs create workout.json\n`);
    console.log(`JSON format:`);
    console.log(`{
  "title": "My Workout",
  "description": "Optional description",
  "exercises": [
    { "movementName": "Bench Press", "sets": 3, "reps": 10, "weight": 80 },
    { "movementName": "Tricep Pushdown", "sets": 3, "reps": 12, "block": 2 },
    { "movementName": "Overhead Tricep Extension", "sets": 3, "reps": 12, "block": 2 }
  ]
}`);
    console.log(`\nUse same "block" number to group exercises (supersets).`);
    return;
  }

  const data = JSON.parse(readFileSync(jsonFile, 'utf-8'));
  const client = await getClient();
  const movements = await client.getMovements();
  const sets = exercisesToSets(data.exercises, movements);

  const workout = await client.createWorkout({
    title: data.title,
    sets,
    description: data.description || '',
    createdSource: 'WorkoutBuilder',
  });

  console.log(`# ✅ Workout Created\n`);
  console.log(`**${workout.title}**`);
  console.log(`- ID: ${workout.id}`);
  console.log(`- Duration: ${Math.round(workout.duration / 60)} min`);
  console.log(`- Exercises: ${data.exercises.length}`);
}

async function cmdEdit(name) {
  if (!name) { console.error('Usage: tonal.mjs edit "Workout Name"'); process.exit(1); }

  const client = await getClient();
  const workouts = await client.getUserWorkouts(0, 100);
  const match = workouts.find(w => w.title.toLowerCase() === name.toLowerCase());

  if (!match) { console.log(`❌ No workout found with name "${name}"`); return; }

  const detailed = await client.getWorkoutById(match.id);
  const movements = await client.getMovements();
  const exercises = reconstructExercisesFromSets(detailed.sets, movements);

  const output = {
    title: detailed.title,
    description: detailed.description || '',
    exercises,
  };

  console.log(`# 🏋️ ${detailed.title} (Edit Format)\n`);
  console.log('```json');
  console.log(JSON.stringify(output, null, 2));
  console.log('```');
  console.log(`\nSave to file, edit, then: tonal.mjs update "${name}" edited.json`);
}

async function cmdUpdate(name, jsonFile) {
  if (!name || !jsonFile) { console.error('Usage: tonal.mjs update "Workout Name" updated.json'); process.exit(1); }

  const data = JSON.parse(readFileSync(jsonFile, 'utf-8'));
  const client = await getClient();
  const workouts = await client.getUserWorkouts(0, 100);
  const match = workouts.find(w => w.title.toLowerCase() === name.toLowerCase());

  if (!match) { console.log(`❌ No workout found with name "${name}"`); return; }

  const detailed = await client.getWorkoutById(match.id);
  const movements = await client.getMovements();
  const sets = exercisesToSets(data.exercises, movements);

  const updated = await client.updateWorkout({
    id: detailed.id,
    title: data.title || detailed.title,
    description: data.description ?? detailed.description ?? '',
    sets,
    coachId: detailed.coachId,
    assetId: detailed.assetId,
    level: detailed.level,
    createdSource: 'WorkoutBuilder',
  });

  console.log(`# ✅ Workout Updated\n`);
  console.log(`**${updated.title}**`);
  console.log(`- Duration: ${Math.round(updated.duration / 60)} min`);
}

async function cmdDelete(name) {
  if (!name) { console.error('Usage: tonal.mjs delete "Workout Name"'); process.exit(1); }

  const client = await getClient();
  const workouts = await client.getUserWorkouts(0, 100);
  const match = workouts.find(w => w.title.toLowerCase() === name.toLowerCase());

  if (!match) { console.log(`❌ No workout found with name "${name}"`); return; }

  await client.deleteWorkout(match.id);
  console.log(`✅ Deleted: **${match.title}**`);
}

async function cmdToday() {
  const client = await getClient();
  const [readiness, streak] = await Promise.all([
    client.getMuscleReadiness(),
    client.getCurrentStreak(),
  ]);

  console.log(`# Tonal Status\n`);
  console.log(`**Streak**: ${streak?.currentStreak || 0} days\n`);

  const ready = Object.entries(readiness).filter(([_, v]) => v >= 80);
  const tired = Object.entries(readiness).filter(([_, v]) => v < 50);

  console.log(`## Muscle Readiness`);
  if (tired.length > 0) console.log(`⚠️ Fatigued: ${tired.map(([m, v]) => `${m} (${v}%)`).join(', ')}`);
  if (ready.length > 0) console.log(`✅ Ready: ${ready.map(([m]) => m).join(', ')}`);

  console.log(`\n## Recommendation`);
  if (tired.some(([m]) => ['Chest', 'Shoulders', 'Triceps'].includes(m))) {
    console.log('Push muscles are fatigued — consider pull or legs today.');
  } else if (tired.some(([m]) => ['Back', 'Biceps'].includes(m))) {
    console.log('Pull muscles are fatigued — consider push or legs today.');
  } else if (tired.some(([m]) => ['Quads', 'Glutes', 'Hamstrings'].includes(m))) {
    console.log('Legs are fatigued — consider upper body today.');
  } else {
    console.log('All systems go — pick your workout!');
  }
}

async function cmdSummary(outputPath) {
  const client = await getClient();
  const readiness = await client.getMuscleReadiness();

  const lines = [`# Tonal — ${new Date().toISOString().split('T')[0]}`, ''];
  const tired = Object.entries(readiness).filter(([_, v]) => v < 50);
  const ready = Object.entries(readiness).filter(([_, v]) => v >= 80);

  lines.push('## Muscle Readiness');
  if (tired.length > 0) lines.push(`Fatigued: ${tired.map(([m, v]) => `${m} ${v}%`).join(', ')}`);
  if (ready.length > 0) lines.push(`Ready: ${ready.map(([m]) => m).join(', ')}`);

  const content = lines.join('\n');
  if (outputPath) {
    writeFileSync(outputPath, content + '\n');
    console.log(`Written to ${outputPath}`);
  } else {
    console.log(content);
  }
}

// ============================================================================
// CLI
// ============================================================================

const [,, cmd, ...args] = process.argv;

const commands = {
  readiness: cmdReadiness,
  stats: cmdStats,
  progress: cmdProgress,
  workouts: () => cmdWorkouts(args[0]),
  custom: cmdCustomWorkouts,
  details: () => cmdWorkoutDetails(args.join(' ')),
  movements: () => cmdMovements(args[0]),
  search: () => cmdSearch(args.join(' ')),
  create: () => cmdCreate(args[0]),
  edit: () => cmdEdit(args.join(' ')),
  update: () => cmdUpdate(args[0], args[1]),
  delete: () => cmdDelete(args.join(' ')),
  today: cmdToday,
  summary: () => cmdSummary(args[0]),
};

if (!cmd || !commands[cmd]) {
  console.log(`Tonal Skill - Full MCP Port

Usage: tonal.mjs <command> [args]

Commands:
  readiness           Full muscle readiness report
  stats               Lifetime stats and streak
  progress            30-day progress analysis
  workouts [n]        Recent completed workouts (default: 10)
  custom              List your custom workouts
  details "Name"      Show workout structure
  movements [groups]  Browse movements (e.g., "Chest,Back")
  search <query>      Search movements by name/muscle/family
  create <file.json>  Create workout from JSON
  edit "Name"         Export workout to JSON for editing
  update "Name" <f>   Update workout from JSON file
  delete "Name"       Delete a custom workout
  today               Quick status check
  summary [path]      Generate health summary for memory`);
  process.exit(1);
}

commands[cmd]().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
