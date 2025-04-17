// src/services/dataProcessor.js
import { database } from "./firebase";
import { ref, set, push, get, query, orderByChild, equalTo } from "firebase/database";
import { createHash } from 'crypto';

// Normalize Tangkhul text for comparison
export function normalizeTangkhulText(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Generate hash for deduplication
export function generateHash(text) {
  return createHash('md5').update(text).digest('hex');
}

// Check if entry exists
export async function checkDuplicateEntry(tangkhulText) {
  const normalizedText = normalizeTangkhulText(tangkhulText);
  const hashValue = generateHash(normalizedText);
  
  const examplesRef = ref(database, 'languageExamples');
  const duplicateQuery = query(
    examplesRef,
    orderByChild('hashValue'),
    equalTo(hashValue)
  );
  
  const snapshot = await get(duplicateQuery);
  return !snapshot.exists();
}

// Store new language example
export async function storeLanguageExample(example, conversationId, trainerId) {
  if (await checkDuplicateEntry(example.tangkhulText)) {
    const examplesRef = ref(database, 'languageExamples');
    const newExampleRef = push(examplesRef);
    
    await set(newExampleRef, {
      tangkhulText: example.tangkhulText,
      tangkhulRaw: example.tangkhulText,
      englishTranslation: example.englishTranslation,
      category: example.category || 'general',
      context: example.context || '',
      source: conversationId,
      trainerId: trainerId,
      timestamp: Date.now(),
      hashValue: generateHash(normalizeTangkhulText(example.tangkhulText))
    });
    
    return true;
  }
  
  return false;
}

// Update trainer knowledge profile
export async function updateTrainerKnowledgeProfile(trainerId, category, score) {
  const profileRef = ref(database, `trainers/${trainerId}/knowledgeStrengths/${category}`);
  const snapshot = await get(profileRef);
  
  let newScore;
  if (snapshot.exists()) {
    // Update existing score with weighted average
    const currentScore = snapshot.val();
    newScore = (currentScore * 0.8) + (score * 0.2);
  } else {
    newScore = score;
  }
  
  await set(profileRef, newScore);
  return newScore;
}
