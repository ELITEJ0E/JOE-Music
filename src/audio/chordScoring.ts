export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function scoreCandidate(
    candidate: any,
    meanChroma: Float32Array,
    meanBassChroma: Float32Array
) {
    const root = candidate.rootIdx;
    const intervals = candidate.intervals;
    const q = candidate.quality;
    let chordToneStrength = 0;
    let missingTonePenalty = 0;
    
    let thirdEvidence = 0;
    let hasThird = false;

    // Define essential tones that MUST be present for complex chords
    let definingIntervals: number[] = [];
    if (q === "min") definingIntervals = [3];
    else if (q === "maj") definingIntervals = [4];
    else if (q === "7") definingIntervals = [10];
    else if (q === "maj7") definingIntervals = [11];
    else if (q === "min7") definingIntervals = [10, 3];
    else if (q === "sus2") definingIntervals = [2];
    else if (q === "add9") definingIntervals = [2, 4];
    else if (q === "sus4") definingIntervals = [5];
    else if (q === "dim") definingIntervals = [3, 6];
    else if (q === "dim7") definingIntervals = [3, 6, 9];
    else if (q === "aug") definingIntervals = [4, 8];

    let missingTones: string[] = [];
    let toneEvidence: Record<string, number> = {};

    for (let interval of intervals) {
        const pc = (root + interval) % 12;
        const strength = meanChroma[pc];
        chordToneStrength += strength;
        toneEvidence[NOTE_NAMES[pc]] = Number(strength.toFixed(2));
        
        if (interval === 3 || interval === 4) {
          thirdEvidence = strength;
          hasThird = true;
        }

        // Weak evidence threshold
        if (strength < 0.25) {
            missingTones.push(NOTE_NAMES[pc]);
            missingTonePenalty += (0.25 - strength); // base penalty
            
            if (definingIntervals.includes(interval)) {
                missingTonePenalty += 1.5; // Massive penalty for missing defining tone
            }
        }
        
        // Sus4 anti-evidence: Penalize if major 3rd is strong
        if (q === "sus4" && interval === 5) {
            const major3rdPC = (root + 4) % 12;
            if (meanChroma[major3rdPC] > 0.35) {
                missingTonePenalty += meanChroma[major3rdPC] * 1.5;
            }
        }
    }
    
    chordToneStrength /= intervals.length;

    // Complexity penalty: Prefer simpler triads over extensions unless heavily supported
    let complexityPenalty = 0;
    if (["maj", "min", "5"].includes(q)) complexityPenalty = 0.0;
    else if (["sus2", "sus4", "aug", "dim"].includes(q)) complexityPenalty = 0.05;
    else if (["6", "m6", "7"].includes(q)) complexityPenalty = 0.08;
    else if (["maj7", "min7", "dim7"].includes(q)) complexityPenalty = 0.12;
    else if (["add9", "9", "maj9", "m9"].includes(q)) complexityPenalty = 0.20;
    else complexityPenalty = 0.25;

    let trebleScore = chordToneStrength - missingTonePenalty - complexityPenalty;
    
    // Bass Integration & Slash Competition
    let bestBassScore = -Infinity;
    let bestBassIdx = root;
    let isSlash = false;
    let appliedSlashPenalty = 0;
    
    const rootBassEv = meanBassChroma[root];
    
    // 1. Root Position Score (slight structural bonus to favor stability)
    const rootPositionScore = trebleScore + (rootBassEv * 0.15) + 0.05; 
    bestBassScore = rootPositionScore;
    
    // 2. Evaluate all other bass notes to see if they can beat root position
    for (let k = 0; k < 12; k++) {
        if (k === root) continue;
        
        const bassEv = meanBassChroma[k];
        // Bass must be very strong to even be considered for slash
        if (bassEv < 0.6) continue;
        
        const isChordTone = intervals.some((interval: number) => (root + interval) % 12 === k);
        
        // Slash penalties: 
        // Inversions (3rd, 5th in bass) are more common, lower penalty
        // Non-chord tones need massive evidence to overcome
        let slashPenalty = isChordTone ? 0.35 : 0.9;
        
        // Special case: 3rd in the bass (e.g. D/F#, C/E) is the most common inversion
        const isThirdInBass = ((root + 3) % 12 === k || (root + 4) % 12 === k);
        if (isThirdInBass && isChordTone) {
            slashPenalty = 0.25;
        }
        
        const bassRatio = bassEv / (rootBassEv + 1e-6);
        // Bass must be substantially stronger than root in the bass region
        if (bassRatio < 2.5) continue; 
        
        // If it is a non-chord tone slash (like E/A), the bass note MUST also 
        // have some presence in the upper harmonic structure, otherwise it's just a transient bass movement
        if (!isChordTone && meanChroma[k] < 0.25) continue;
        
        const slashScore = trebleScore + (bassEv * 0.15) - slashPenalty;
        
        if (slashScore > bestBassScore) {
            bestBassScore = slashScore;
            bestBassIdx = k;
            isSlash = true;
            appliedSlashPenalty = slashPenalty;
        }
    }
    
    return {
        candidate,
        score: bestBassScore,
        trebleScore,
        bassNoteIdx: bestBassIdx,
        isSlash,
        slashPenalty: appliedSlashPenalty,
        rootBassEv,
        chordToneStrength,
        missingTones,
        toneEvidence,
        complexityPenalty,
        thirdEvidence: hasThird ? thirdEvidence : 0,
        requiredTones: intervals.map((i: number) => NOTE_NAMES[(root + i) % 12])
    };
}
