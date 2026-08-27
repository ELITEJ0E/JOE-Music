const meanChroma = {4: 0.15, 3: 0.15};
const majorScore = 0.517;
const minorScore = -0.983; // due to missing defining tone penalty
let winner = "5";

const pcMaj3 = 4;
const pcMin3 = 3;
const actualThirdEvidence = Math.max(meanChroma[pcMaj3], meanChroma[pcMin3]);

const POWER_CHORD_MARGIN = 0.12;
const POWER_CHORD_ABSENCE_THRESHOLD = 0.12;

// The OLD logic:
if (actualThirdEvidence >= POWER_CHORD_ABSENCE_THRESHOLD) {
    if (majorScore >= minorScore) {
        winner = "maj";
    } else {
        winner = "min";
    }
}
console.log("Old logic winner:", winner);

// The PROBLEM was: what if the key estimator gave a +0.04 to the minor score?
// But wait, minorScore is -0.983! +0.04 makes it -0.943. It STILL loses to majorScore (0.517)!
// Why did minorScore beat majorScore in the real app?
// BECAUSE majorScore ALSO had the missing defining tone penalty!
