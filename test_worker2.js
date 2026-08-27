const majorScoreBase = -0.983; // with -1.5 penalty
const minorScoreBase = -0.983; // with -1.5 penalty

// Diatonic prior from key A# Minor:
// A#m (minor) gets +0.04
// A# (major) gets 0
const majorScore = majorScoreBase + 0;
const minorScore = minorScoreBase + 0.04;

console.log("Major:", majorScore);
console.log("Minor:", minorScore);
if (majorScore >= minorScore) {
    console.log("maj wins");
} else {
    console.log("min wins");
}
