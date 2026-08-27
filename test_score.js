function score(q, chr) {
    let chordToneStrength = 0;
    let missingTonePenalty = 0;
    let intervals;
    if (q==="maj") intervals=[0,4,7];
    if (q==="min") intervals=[0,3,7];
    if (q==="5") intervals=[0,7];
    if (q==="sus2") intervals=[0,2,7];

    let definingIntervals = [];
    if (q === "min") definingIntervals = [3];
    else if (q === "7") definingIntervals = [10];
    else if (q === "sus2") definingIntervals = [2];
    else if (q === "sus4") definingIntervals = [5];
    else if (q === "5") definingIntervals = []; // We can add penalty here?

    for (let interval of intervals) {
        let pc = interval; 
        const strength = chr[pc] || 0;
        chordToneStrength += strength;
        if (strength < 0.25) {
            missingTonePenalty += (0.25 - strength);
            if (definingIntervals.includes(interval)) missingTonePenalty += 1.5;
        }
    }
    chordToneStrength /= intervals.length;
    
    let complexityPenalty = 0;
    if (["maj", "min"].includes(q)) complexityPenalty = 0.0;
    else if (q === "5") complexityPenalty = 0.15;
    else if (q === "sus2") complexityPenalty = 0.25; // Massive complexity penalty to suppress false positives

    return chordToneStrength - missingTonePenalty - complexityPenalty;
}

const chr = {0: 1.0, 7: 0.9, 4: 0.1, 3: 0.1, 2: 0.15};
console.log("maj:", score("maj", chr).toFixed(3));
console.log("min:", score("min", chr).toFixed(3));
console.log("5:", score("5", chr).toFixed(3));
console.log("sus2:", score("sus2", chr).toFixed(3));

