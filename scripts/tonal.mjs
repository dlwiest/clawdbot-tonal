#!/usr/bin/env node
/**
 * Tonal Skill - Full port of ts-tonal-mcp functionality
 * Commands: readiness, stats, progress, workouts, custom, details, movements, search, create, edit, update, delete, today, summary
 */

import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

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

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function exercisesToSets(exercises, movements) {
  const parsedExercises = exercises.map((input, exerciseIndex) => {
    if (!isRecord(input)) {
      throw new Error(`Exercise at index ${exerciseIndex} must be an object`);
    }
    if (typeof input.movementName !== 'string' || input.movementName.length === 0) {
      throw new Error(`Exercise at index ${exerciseIndex} must have a movementName`);
    }

    const movementName = input.movementName;
    if (
      input.sets !== undefined &&
      (typeof input.sets !== 'number' || !Number.isInteger(input.sets) || input.sets < 0)
    ) {
      throw new Error(
        `Exercise "${movementName}" sets must be an integer greater than or equal to 0`
      );
    }
    if (input.setDetails !== undefined && !Array.isArray(input.setDetails)) {
      throw new Error(`Exercise "${movementName}" setDetails must be an array`);
    }
    if (input.sets === undefined && input.setDetails === undefined) {
      throw new Error(`Exercise "${movementName}" must specify sets or setDetails`);
    }
    if (Array.isArray(input.setDetails) && input.setDetails.length === 0) {
      throw new Error(`Exercise "${movementName}" setDetails must contain at least 1 set`);
    }
    if (
      typeof input.sets === 'number' &&
      Array.isArray(input.setDetails) &&
      input.sets !== input.setDetails.length
    ) {
      throw new Error(
        `Exercise "${movementName}" sets "${input.sets}" does not match setDetails length "${input.setDetails.length}"`
      );
    }

    for (const field of ['reps', 'duration', 'weight']) {
      const value = input[field];
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
        throw new Error(`Exercise "${movementName}" ${field} must be a number`);
      }
    }
    if (
      input.block !== undefined &&
      (typeof input.block !== 'number' || !Number.isInteger(input.block) || input.block < 0)
    ) {
      throw new Error(
        `Exercise "${movementName}" block must be an integer greater than or equal to 0`
      );
    }
    if (input.isWarmup !== undefined && typeof input.isWarmup !== 'boolean') {
      throw new Error(`Exercise "${movementName}" isWarmup must be a boolean`);
    }

    let setDetails;
    if (Array.isArray(input.setDetails)) {
      setDetails = input.setDetails.map((setDetailInput, setIndex) => {
        if (!isRecord(setDetailInput)) {
          throw new Error(`Exercise "${movementName}" setDetails[${setIndex}] must be an object`);
        }

        for (const field of ['reps', 'duration', 'weight']) {
          const value = setDetailInput[field];
          if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
            throw new Error(
              `Exercise "${movementName}" setDetails[${setIndex}].${field} must be a number`
            );
          }
        }
        if (setDetailInput.reps !== undefined && setDetailInput.duration !== undefined) {
          throw new Error(
            `Exercise "${movementName}" setDetails[${setIndex}] cannot specify both reps and duration`
          );
        }
        for (const field of ['warmUp', 'dropSet', 'burnout']) {
          const value = setDetailInput[field];
          if (value !== undefined && typeof value !== 'boolean') {
            throw new Error(
              `Exercise "${movementName}" setDetails[${setIndex}].${field} must be a boolean`
            );
          }
        }
        if (
          setDetailInput.description !== undefined &&
          typeof setDetailInput.description !== 'string'
        ) {
          throw new Error(
            `Exercise "${movementName}" setDetails[${setIndex}].description must be a string`
          );
        }

        const setDetail = {};
        if (typeof setDetailInput.reps === 'number') {
          setDetail.reps = setDetailInput.reps;
        }
        if (typeof setDetailInput.duration === 'number') {
          setDetail.duration = setDetailInput.duration;
        }
        if (typeof setDetailInput.weight === 'number') {
          setDetail.weight = setDetailInput.weight;
        }
        if (typeof setDetailInput.warmUp === 'boolean') {
          setDetail.warmUp = setDetailInput.warmUp;
        }
        if (typeof setDetailInput.dropSet === 'boolean') {
          setDetail.dropSet = setDetailInput.dropSet;
        }
        if (typeof setDetailInput.burnout === 'boolean') {
          setDetail.burnout = setDetailInput.burnout;
        }
        if (typeof setDetailInput.description === 'string') {
          setDetail.description = setDetailInput.description;
        }
        return setDetail;
      });
    }

    const exercise = { movementName };
    if (typeof input.sets === 'number') {
      exercise.sets = input.sets;
    }
    if (typeof input.reps === 'number') {
      exercise.reps = input.reps;
    }
    if (typeof input.duration === 'number') {
      exercise.duration = input.duration;
    }
    if (typeof input.weight === 'number') {
      exercise.weight = input.weight;
    }
    if (typeof input.isWarmup === 'boolean') {
      exercise.isWarmup = input.isWarmup;
    }
    if (typeof input.block === 'number') {
      exercise.block = input.block;
    }
    if (setDetails !== undefined) {
      exercise.setDetails = setDetails;
    }
    return exercise;
  });

  const movementMap = new Map(movements.map(m => [m.name.toLowerCase(), m]));
  const hasExplicitBlocks = parsedExercises.some(exercise => exercise.block !== undefined);
  const hasOmittedBlocks = parsedExercises.some(exercise => exercise.block === undefined);
  const renumberMixedBlocks = hasExplicitBlocks && hasOmittedBlocks;
  const renumberedExplicitBlocks = new Map();

  // First pass: validate exercises and assign block numbers
  const processedExercises = [];
  let nextBlockNumber = 1;

  for (const exercise of parsedExercises) {
    const movement = movementMap.get(exercise.movementName.toLowerCase());
    if (!movement) {
      throw new Error(`Movement "${exercise.movementName}" not found. Use 'search' to find valid names.`);
    }

    const isDurationBased = !movement.countReps;
    const setCount = exercise.setDetails?.length ?? exercise.sets;

    if (!setCount || setCount < 1) {
      throw new Error(`Exercise "${exercise.movementName}" must have at least 1 set`);
    }

    if (exercise.setDetails !== undefined) {
      exercise.setDetails.forEach((setDetail, index) => {
        if (isDurationBased) {
          if (!setDetail.duration || setDetail.duration < 1) {
            throw new Error(
              `Exercise "${exercise.movementName}" set ${index + 1} is duration-based and requires a duration in seconds (e.g., duration: 30)`
            );
          }
        } else if (!setDetail.reps || setDetail.reps < 1) {
          throw new Error(
            `Exercise "${exercise.movementName}" set ${index + 1} is reps-based and requires reps (e.g., reps: 10)`
          );
        }
      });
    } else if (isDurationBased) {
      if (!exercise.duration || exercise.duration < 1) {
        throw new Error(
          `Exercise "${exercise.movementName}" is duration-based and requires a duration in seconds (e.g., duration: 30)`
        );
      }
    } else if (!exercise.reps || exercise.reps < 1) {
      throw new Error(
        `Exercise "${exercise.movementName}" is reps-based and requires reps (e.g., reps: 10)`
      );
    }

    // Output is sorted by block, so mixed requests use encounter-order block numbers.
    // Explicit values still identify groups; each omitted exercise gets its own group.
    let blockNumber;
    if (renumberMixedBlocks) {
      if (exercise.block === undefined) {
        blockNumber = nextBlockNumber++;
      } else {
        const existingBlockNumber = renumberedExplicitBlocks.get(exercise.block);
        if (existingBlockNumber !== undefined) {
          blockNumber = existingBlockNumber;
        } else {
          blockNumber = nextBlockNumber++;
          renumberedExplicitBlocks.set(exercise.block, blockNumber);
        }
      }
    } else {
      blockNumber = exercise.block ?? nextBlockNumber++;
    }

    processedExercises.push({
      exercise,
      movementId: movement.id,
      blockNumber,
      setCount,
      isDurationBased,
    });
  }

  // Tonal requires blockNumber >= 1 but preserves gaps and relative order, so
  // translate resolved blocks instead of densely renumbering them.
  let minimumBlockNumber = Number.POSITIVE_INFINITY;
  for (const processedExercise of processedExercises) {
    minimumBlockNumber = Math.min(minimumBlockNumber, processedExercise.blockNumber);
  }
  if (minimumBlockNumber < 1) {
    const blockNumberShift = 1 - minimumBlockNumber;
    for (const processedExercise of processedExercises) {
      processedExercise.blockNumber += blockNumberShift;
    }
  }

  // Second pass: group exercises by block and create sets in rounds
  const blockToExercises = new Map();
  for (const pe of processedExercises) {
    if (!blockToExercises.has(pe.blockNumber)) {
      blockToExercises.set(pe.blockNumber, []);
    }
    blockToExercises.get(pe.blockNumber).push(pe);
  }

  const sets = [];
  const blockHasStarted = new Set();
  const sortedBlocks = Array.from(blockToExercises.entries()).sort((a, b) => a[0] - b[0]);

  for (const [blockNumber, exercisesInBlock] of sortedBlocks) {
    const maxSets = Math.max(...exercisesInBlock.map(pe => pe.setCount));

    // Set groups identify exercise positions, not movements. A movement can
    // intentionally appear more than once in a block with different programming.
    exercisesInBlock.forEach((pe, idx) => {
      pe.setGroup = idx + 1;
    });

    for (let round = 1; round <= maxSets; round++) {
      for (const pe of exercisesInBlock) {
        if (round <= pe.setCount) {
          const isFirstSetOfBlock = !blockHasStarted.has(blockNumber);
          if (isFirstSetOfBlock) {
            blockHasStarted.add(blockNumber);
          }

          const hasSetDetails = pe.exercise.setDetails !== undefined;
          const setDetail = pe.exercise.setDetails?.[round - 1];
          const setData = {
            blockStart: isFirstSetOfBlock,
            movementId: pe.movementId,
            repetition: round,
            repetitionTotal: pe.setCount,
            blockNumber,
            burnout: hasSetDetails ? (setDetail?.burnout ?? false) : false,
            spotter: false,
            eccentric: false,
            chains: false,
            flex: false,
            warmUp: hasSetDetails
              ? (setDetail?.warmUp ?? pe.exercise.isWarmup ?? false)
              : (pe.exercise.isWarmup ?? false),
            weightPercentage: hasSetDetails
              ? (setDetail?.weight ?? pe.exercise.weight ?? 0)
              : (pe.exercise.weight ?? 0),
            setGroup: pe.setGroup,
            round,
            description: hasSetDetails ? (setDetail?.description ?? '') : '',
            dropSet: hasSetDetails ? (setDetail?.dropSet ?? false) : false,
          };

          // Add either prescribedReps or prescribedDuration, but never both.
          if (pe.isDurationBased) {
            const duration = hasSetDetails ? setDetail?.duration : pe.exercise.duration;
            if (duration !== undefined) {
              setData.prescribedDuration = duration;
            }
          } else {
            const reps = hasSetDetails ? setDetail?.reps : pe.exercise.reps;
            if (reps !== undefined) {
              setData.prescribedReps = reps;
            }
          }

          sets.push(setData);
        }
      }
    }
  }

  return sets;
}

export function reconstructExercisesFromSets(sets, movements) {
  if (!sets || sets.length === 0) {
    return [];
  }

  const movementMap = new Map(movements.map(m => [m.id, m]));
  const exerciseGroups = new Map();

  // A set group, not a movement id, identifies one exercise within a block.
  for (const set of sets) {
    const key = `${set.blockNumber}-${set.setGroup}`;
    if (!exerciseGroups.has(key)) {
      exerciseGroups.set(key, {
        blockNumber: set.blockNumber,
        setGroup: set.setGroup,
        sets: [],
      });
    }
    exerciseGroups.get(key).sets.push(set);
  }

  const exercises = [];
  const sortedGroups = Array.from(exerciseGroups.values()).sort((a, b) =>
    a.blockNumber !== b.blockNumber
      ? a.blockNumber - b.blockNumber
      : a.setGroup - b.setGroup
  );

  for (const group of sortedGroups) {
    const firstSet = group.sets[0];
    const movement = movementMap.get(firstSet.movementId);
    const setDetails = group.sets.map(set => {
      const setDetail = {
        weight: set.weightPercentage,
        warmUp: set.warmUp,
        dropSet: set.dropSet,
        burnout: set.burnout,
        description: set.description,
      };

      if (movement === undefined) {
        // The cached movement catalog can miss new or retired movements. Without
        // countReps, trust whichever goal the set itself carries.
        const duration = set.prescribedDuration || set.durationBasedRepGoal;
        if (duration !== undefined && duration > 0) {
          setDetail.duration = duration;
        } else if (set.prescribedReps !== undefined && set.prescribedReps > 0) {
          setDetail.reps = set.prescribedReps;
        }
      } else if (movement.countReps) {
        if (set.prescribedReps !== undefined && set.prescribedReps > 0) {
          setDetail.reps = set.prescribedReps;
        }
      } else {
        // The API has used both names for duration-based goals.
        const duration = set.prescribedDuration || set.durationBasedRepGoal;
        if (duration !== undefined && duration > 0) {
          setDetail.duration = duration;
        }
      }

      return setDetail;
    });

    const exercise = {
      movementName: movement?.name || firstSet.movementId,
      block: group.blockNumber,
      setDetails,
    };

    const firstSetDetail = setDetails[0];
    const hasUniformProgramming = setDetails.every(setDetail =>
      setDetail.reps === firstSetDetail.reps &&
      setDetail.duration === firstSetDetail.duration &&
      setDetail.weight === firstSetDetail.weight
    );
    if (hasUniformProgramming) {
      exercise.sets = group.sets.length;
      if (firstSetDetail.reps !== undefined) {
        exercise.reps = firstSetDetail.reps;
      }
      if (firstSetDetail.duration !== undefined) {
        exercise.duration = firstSetDetail.duration;
      }
      if (firstSetDetail.weight !== undefined) {
        exercise.weight = firstSetDetail.weight;
      }
    }

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
        console.log(`\n### Block ${currentBlock}`);
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

async function cmdMovementJson(name) {
  const client = await getClient();
  const movements = await client.getMovements();
  const movement = movements.find(m => m.name.toLowerCase() === (name || '').toLowerCase());

  if (!movement) {
    throw new Error(`Movement "${name}" not found. Use 'search' to find valid names.`);
  }

  console.log(JSON.stringify(movement, null, 2));
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
  'movement-json': () => cmdMovementJson(args.join(' ')),
  create: () => cmdCreate(args[0]),
  edit: () => cmdEdit(args.join(' ')),
  update: () => cmdUpdate(args[0], args[1]),
  delete: () => cmdDelete(args.join(' ')),
  today: cmdToday,
  summary: () => cmdSummary(args[0]),
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
  movement-json <n>   Show raw movement JSON for exact movement name
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
}
