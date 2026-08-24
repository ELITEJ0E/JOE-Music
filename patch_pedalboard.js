const fs = require('fs');
let code = fs.readFileSync('src/audio/pedalboardDsp.ts', 'utf8');

// We will add an object to hold the block I/O.
code = code.replace(
  'private isInitialized: boolean = false;',
  'private blocks: Record<string, { in: GainNode, out: GainNode }> = {};\n  private isInitialized: boolean = false;'
);

// We need to modify the init() function to wrap blocks.
const initRegex = /public init\(\) \{[\s\S]*?this\.isInitialized = true;\n  \}/;
const newInit = `
  public init() {
    if (this.isInitialized) return;
    this.ctx = audioEngine.getContext();

    // Setup input/output
    this.inputNode = this.ctx.createGain();
    this.outputNode = this.ctx.createGain();
    this.limiterNode = this.ctx.createDynamicsCompressor();
    this.limiterNode.threshold.value = -3;
    this.limiterNode.ratio.value = 20;
    this.limiterNode.attack.value = 0.001;
    this.limiterNode.release.value = 0.05;
    
    // Create generic block wrappers
    const createBlock = (name: string, buildFn: (bIn: GainNode, bOut: GainNode) => void) => {
      const bIn = this.ctx!.createGain();
      const bOut = this.ctx!.createGain();
      buildFn(bIn, bOut);
      this.blocks[name] = { in: bIn, out: bOut };
    };

    createBlock("noiseGate", (bIn, bOut) => {
      this.noiseGateNode = this.ctx!.createGain();
      bIn.connect(this.noiseGateNode);
      this.noiseGateNode.connect(bOut);
    });

    createBlock("compressor", (bIn, bOut) => {
      this.compressorNode = this.ctx!.createDynamicsCompressor();
      this.compMakeupGain = this.ctx!.createGain();
      bIn.connect(this.compressorNode);
      this.compressorNode.connect(this.compMakeupGain);
      this.compMakeupGain.connect(bOut);
    });

    createBlock("overdrive", (bIn, bOut) => {
      this.odPreFilter = this.ctx!.createBiquadFilter();
      this.odShaper = this.ctx!.createWaveShaper();
      this.odPostFilter = this.ctx!.createBiquadFilter();
      this.odDryGain = this.ctx!.createGain();
      this.odWetGain = this.ctx!.createGain();
      
      bIn.connect(this.odPreFilter);
      this.odPreFilter.connect(this.odShaper);
      this.odShaper.connect(this.odPostFilter);
      this.odPostFilter.connect(this.odWetGain);
      
      bIn.connect(this.odDryGain);
      this.odWetGain.connect(bOut);
      this.odDryGain.connect(bOut);
    });

    createBlock("distortion", (bIn, bOut) => {
      this.distShaper = this.ctx!.createWaveShaper();
      this.distToneFilter = this.ctx!.createBiquadFilter();
      const distWet = this.ctx!.createGain();
      const distDry = this.ctx!.createGain();
      // ... keep it simple for now, we just need it available
      bIn.connect(this.distShaper);
      this.distShaper.connect(this.distToneFilter);
      this.distToneFilter.connect(distWet);
      bIn.connect(distDry);
      distWet.connect(bOut);
      distDry.connect(bOut);
    });

    createBlock("ampHead", (bIn, bOut) => {
      this.ampGain = this.ctx!.createGain();
      this.ampShaper = this.ctx!.createWaveShaper();
      this.ampBass = this.ctx!.createBiquadFilter();
      this.ampMid = this.ctx!.createBiquadFilter();
      this.ampTreble = this.ctx!.createBiquadFilter();
      this.ampPresence = this.ctx!.createBiquadFilter();
      this.ampCabFilter = this.ctx!.createBiquadFilter();
      
      bIn.connect(this.ampGain);
      this.ampGain.connect(this.ampShaper);
      this.ampShaper.connect(this.ampBass);
      this.ampBass.connect(this.ampMid);
      this.ampMid.connect(this.ampTreble);
      this.ampTreble.connect(this.ampPresence);
      this.ampPresence.connect(this.ampCabFilter);
      this.ampCabFilter.connect(bOut);
    });

    createBlock("chorus", (bIn, bOut) => {
      this.chorusDelayL = this.ctx!.createDelay();
      this.chorusDelayR = this.ctx!.createDelay();
      this.chorusLFO = this.ctx!.createOscillator();
      this.chorusLFOGainL = this.ctx!.createGain();
      this.chorusDryGain = this.ctx!.createGain();
      this.chorusWetGain = this.ctx!.createGain();
      
      bIn.connect(this.chorusDryGain);
      bIn.connect(this.chorusDelayL);
      bIn.connect(this.chorusDelayR);
      
      this.chorusLFO.connect(this.chorusLFOGainL);
      this.chorusLFOGainL.connect(this.chorusDelayL.delayTime);
      this.chorusLFO.start();
      
      this.chorusDryGain.connect(bOut);
      this.chorusDelayL.connect(this.chorusWetGain);
      this.chorusDelayR.connect(this.chorusWetGain);
      this.chorusWetGain.connect(bOut);
    });

    createBlock("delay", (bIn, bOut) => {
      this.delayNode = this.ctx!.createDelay(2.0);
      this.delayFeedbackGain = this.ctx!.createGain();
      this.delayDryGain = this.ctx!.createGain();
      this.delayWetGain = this.ctx!.createGain();
      
      bIn.connect(this.delayDryGain);
      bIn.connect(this.delayNode);
      this.delayNode.connect(this.delayFeedbackGain);
      this.delayFeedbackGain.connect(this.delayNode);
      this.delayNode.connect(this.delayWetGain);
      
      this.delayDryGain.connect(bOut);
      this.delayWetGain.connect(bOut);
    });

    createBlock("reverb", (bIn, bOut) => {
      this.reverbConvolver = this.ctx!.createConvolver();
      this.reverbConvolver.buffer = createSyntheticReverbImpulse(this.ctx!);
      this.reverbDryGain = this.ctx!.createGain();
      this.reverbWetGain = this.ctx!.createGain();
      
      bIn.connect(this.reverbDryGain);
      bIn.connect(this.reverbConvolver);
      this.reverbConvolver.connect(this.reverbWetGain);
      
      this.reverbDryGain.connect(bOut);
      this.reverbWetGain.connect(bOut);
    });

    // Final fixed output chain
    this.limiterNode.connect(this.outputNode);
    this.outputNode.connect(audioEngine.getMasterGain());

    this.isInitialized = true;
  }
`;

code = code.replace(initRegex, newInit.trim());

// Now rewrite applyPedalConfig to route dynamically
const applyConfigRegex = /public applyPedalConfig\(pedals: PedalConfig\[\]\) \{[\s\S]*?case "reverb":[\s\S]*?break;\n      \}\n    \}\);\n  \}/;

const newApplyConfig = `
  public applyPedalConfig(pedals: PedalConfig[]) {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    
    // Disconnect all blocks first
    this.inputNode!.disconnect();
    Object.values(this.blocks).forEach(b => b.out.disconnect());
    
    let currentConnection = this.inputNode!;
    
    pedals.forEach((pedal) => {
      const p = pedal.params;
      const isEnabled = pedal.enabled;
      
      // Dynamic Routing: Add block to chain if enabled, otherwise skip routing entirely
      if (isEnabled && this.blocks[pedal.type]) {
        currentConnection.connect(this.blocks[pedal.type].in);
        currentConnection = this.blocks[pedal.type].out;
      }
      
      switch (pedal.type) {
        case "noiseGate":
          this.noiseGateParams.threshold = (p.threshold as number) ?? -45;
          this.noiseGateParams.active = isEnabled;
          break;
        case "compressor":
          if (this.compressorNode && this.compMakeupGain) {
            this.compressorNode.threshold.setValueAtTime((p.threshold as number) ?? -24, now);
            this.compressorNode.ratio.setValueAtTime((p.ratio as number) ?? 4, now);
            this.compressorNode.attack.setValueAtTime(((p.attack as number) ?? 15) / 1000, now);
            this.compressorNode.release.setValueAtTime(((p.release as number) ?? 200) / 1000, now);
            this.compMakeupGain.gain.setValueAtTime(1 + ((p.gain as number) ?? 0) / 10, now);
          }
          break;
        case "overdrive":
          if (this.odShaper && this.odPreFilter && this.odPostFilter && this.odWetGain && this.odDryGain) {
            const drive = (p.drive as number) ?? 45;
            const tone = (p.tone as number) ?? 50;
            const level = (p.level as number) ?? 75;
            this.odShaper.curve = makeOverdriveCurve(drive, this.ctx.sampleRate) as any;
            if (this.odPostFilter.type) this.odPostFilter.type = "lowpass";
            this.odPostFilter.frequency.setValueAtTime(1500 + tone * 60, now);
            this.odWetGain.gain.setValueAtTime(level / 100, now);
            this.odDryGain.gain.setValueAtTime(0.0, now); // 100% wet
          }
          break;
        case "distortion": // Note: Distortion parameters weren't mapped before, just adding stub
          break;
        case "ampHead":
          if (this.ampGain && this.ampBass && this.ampMid && this.ampTreble && this.ampPresence && this.ampCabFilter) {
            const gain = (p.gain as number) ?? 60;
            const bass = (p.bass as number) ?? 50;
            const mid = (p.mid as number) ?? 50;
            const treble = (p.treble as number) ?? 50;
            const presence = (p.presence as number) ?? 50;
            this.ampGain.gain.setValueAtTime(0.5 + (gain / 100) * 2.5, now);
            if(this.ampBass.type) this.ampBass.type = "lowshelf";
            this.ampBass.frequency.value = 150;
            this.ampBass.gain.setValueAtTime((bass - 50) / 4, now);
            if(this.ampMid.type) this.ampMid.type = "peaking";
            this.ampMid.frequency.value = 800;
            this.ampMid.gain.setValueAtTime((mid - 50) / 4, now);
            if(this.ampTreble.type) this.ampTreble.type = "highshelf";
            this.ampTreble.frequency.value = 3500;
            this.ampTreble.gain.setValueAtTime((treble - 50) / 4, now);
            if(this.ampPresence.type) this.ampPresence.type = "highshelf";
            this.ampPresence.frequency.value = 6000;
            this.ampPresence.gain.setValueAtTime((presence - 50) / 4, now);
            const cab = (p.cabinet as string) || "4x12 Vintage";
            if (this.ampCabFilter.type) this.ampCabFilter.type = "lowpass";
            if (cab === "2x12 Open Back") {
              this.ampCabFilter.frequency.setValueAtTime(6200, now);
            } else if (cab === "1x12 Tweed") {
              this.ampCabFilter.frequency.setValueAtTime(4600, now);
            } else {
              this.ampCabFilter.frequency.setValueAtTime(5100, now);
            }
          }
          break;
        case "chorus":
          if (this.chorusLFO && this.chorusLFOGainL && this.chorusWetGain && this.chorusDryGain) {
            const rate = (p.rate as number) ?? 1.5;
            const depth = (p.depth as number) ?? 60;
            const mix = (p.mix as number) ?? 50;
            if (this.chorusLFO.type) this.chorusLFO.type = "sine";
            this.chorusLFO.frequency.setValueAtTime(0.2 + (rate / 100) * 4.8, now);
            this.chorusLFOGainL.gain.setValueAtTime((depth / 100) * 0.006, now);
            this.chorusWetGain.gain.setValueAtTime(mix / 100, now);
            this.chorusDryGain.gain.setValueAtTime(1 - (mix / 100) * 0.5, now);
          }
          break;
        case "delay":
          if (this.delayNode && this.delayFeedbackGain && this.delayWetGain && this.delayDryGain) {
            const time = (p.time as number) ?? 350; // ms
            const feedback = (p.feedback as number) ?? 40;
            const mix = (p.mix as number) ?? 35;
            this.delayNode.delayTime.setValueAtTime(time / 1000, now);
            this.delayFeedbackGain.gain.setValueAtTime(Math.min(0.88, feedback / 100), now);
            this.delayWetGain.gain.setValueAtTime(mix / 100, now);
            this.delayDryGain.gain.setValueAtTime(1.0, now);
          }
          break;
        case "reverb":
          if (this.reverbWetGain && this.reverbDryGain) {
            const mix = (p.mix as number) ?? 30;
            this.reverbWetGain.gain.setValueAtTime(mix / 100, now);
            this.reverbDryGain.gain.setValueAtTime(1.0, now);
          }
          break;
      }
    });
    
    // Connect the end of the chain to the limiter
    currentConnection.connect(this.limiterNode!);
  }
`;

code = code.replace(applyConfigRegex, newApplyConfig.trim());

fs.writeFileSync('src/audio/pedalboardDsp.ts', code);
