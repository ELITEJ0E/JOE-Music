const actualThirdEvidence = 0.15;
const minThirdEv = 0.15;
const majThirdEv = 0.10;

let winnerQual = "5";
let majorScore = -1.2;
let minorScore = -1.1;

// new fallback logic
if (actualThirdEvidence >= 0.12) {
    // If minor has strong absolute evidence, allow it
    if (minThirdEv >= 0.35 && minorScore > majorScore) {
        winnerQual = "min";
    } else {
        winnerQual = "maj";
    }
}
console.log(winnerQual);
