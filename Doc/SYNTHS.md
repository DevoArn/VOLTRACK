# The instruments

VOLTRACK ships three original synthesizers, built on the Web Audio API. All DSP runs in AudioWorklets (`public/worklets/`), so timing is sample-accurate. The UI is styled like a late-90s desktop app and homepage.

| Page       | Machine                                                                               |
| ---------- | ------------------------------------------------------------------------------------- |
| `/`        | **Start page** for choosing a machine (press `1`, `2` or `3`)                         |
| `/modular` | **VOLTRACK Eurorack Modular**: a 126HP case with 22 modules and patch cables          |
| `/acid`    | **ACIDLINE BL-1**: an acid bassline synth with a 16-step slide/accent sequencer       |
| `/va`      | **HALCYON VA-8**: an 8-voice virtual-analog polysynth with an arpeggiator and effects |

> Browsers only allow AudioWorklet in a _secure context_: `http://localhost` or HTTPS. Opened over plain HTTP from another host, the machines can't start their audio engine.

## VOLTRACK Eurorack Modular

### Eurorack conventions

| Thing        | Real Eurorack           | VOLTRACK                                                    |
| ------------ | ----------------------- | ----------------------------------------------------------- |
| Panel height | 3U = 128.5 mm           | 380 px                                                      |
| Panel width  | n × HP (1 HP = 5.08 mm) | n × 15 px; every module has a fixed HP width                |
| Case         | rows of 84/104/126 HP   | 126 HP per row, 1–8 rows (CASE − / +)                       |
| Mounting     | rails + M3 screws       | modules snap to the HP grid on the rails and cannot overlap |
| Audio        | ±5 V (10 Vpp)           | ±5 V                                                        |
| Pitch        | 1 V/oct                 | 1 V/oct, 0 V = C4                                           |
| Gates        | 0 / +5…10 V             | 0 / +10 V, inputs trigger above +1 V                        |
| Envelopes    | 0…+8/10 V               | 0…+10 V                                                     |
| LFOs         | ±5 V                    | ±5 V                                                        |

Inside the engine, one sample unit is one volt. The OUTPUT module converts ±5 V to line level and runs it through a limiter.

### Modules (22)

| Category      | Module (HP)                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sources       | **VCO** (12) saw/pulse/tri/sine, 1V/oct, linear FM, PWM, sync · **NOISE** (6) white/pink/brown                                                            |
| Filters       | **VCF** (12) resonant SVF with LP/BP/HP outputs, CV amount, key tracking, drive                                                                           |
| Amps & Mixers | **VCA** (8) linear, unity gain at 10 V · **MIXER** (12) 4 channels + inverted out · **RING** (6)                                                          |
| Modulation    | **LFO** (8) 4 shapes · **ADSR** (12) with retrigger · **S&H** (6) samples internal noise when IN is empty · **SLEW** (8)                                  |
| Sequencing    | **CLOCK** (12) ×/÷ outputs, swing, reset · **STEP SEQUENCER** (28) 8 steps · **QUANTIZER** (10) 8 scales · **KEYBOARD** (22) mouse/computer keys/Web MIDI |
| Effects       | **WAVESHAPER** (10) soft/hard/fold/crush/tube/fuzz/rectify · **TAPE DELAY** (12) · **CHORUS** (10) stereo · **REVERB** (10) stereo                        |
| Utilities     | **ATT·OFFSET** (10) 2× attenuverter + ±10 V offset · **MULT** (6)                                                                                         |
| I/O           | **OUTPUT** (10) stereo + meters · **SCOPE** (20) dual trace + FFT                                                                                         |

### How to use it

- **Patch:** drag from one jack to another. Drag a patched input to move its cable, or drop it on empty space to unplug it. Right-click a jack to remove all of its cables. Outputs can feed several inputs; each input takes one cable.
- **Knobs:** drag up/down (hold Shift for fine control) or use the mouse wheel. Double-click resets a knob.
- **Rack:** click a module in the sidebar and it goes into the first free slot (a new row is added if needed). Drag a panel by its header to move it. A green outline shows a free slot and a red one shows a blocked slot.
- **View:** drag the background to pan. Ctrl+wheel or the ZOOM buttons zoom in and out, and FIT fits the whole case on screen.
- **Keyboard:** the `A W S E D F T G Y H U J K` keys play notes and `,` `.` shift the octave. Web MIDI devices are picked up automatically.
- **Tooltips:** hover over anything for 1 second to see what it does. Knobs show their value and range, and jacks show their signal type and what they are patched to.
- **Patches:** there are 3 presets plus an empty case. The patch autosaves in the browser. STORE/RECALL use one saved slot, and EXPORT/IMPORT use JSON files.

### Adding a module

Write a `ModuleSpec` with `type`, `name`, `category`, `hp`, `params`, `inputs`, `outputs` and a `create(ctx, sink)` function that returns the audio nodes for each jack. Optionally add a `ui()` hook. Then register it in `src/modules/index.ts`. The rack builds the panel automatically, and `tests/unit/catalog.test.ts` validates the new spec.

## ACIDLINE BL-1

An original monophonic subtractive bass synth in the classic acid-bassline style.

- **Voice:** saw/square oscillator → 4-pole nonlinear ladder low-pass (2× oversampled) → VCA.
- **Controls:** CUTOFF, RESO, ENV MOD, DECAY and ACCENT, plus TUNE and WAVE.
- **Accent:** an accented note is louder and uses a short filter decay. It also adds a lagged cutoff sweep that builds up over consecutive accents.
- **Slide:** a slide step holds the gate into the next step and glides the pitch instead of retriggering.
- **Sequencer:** a 16-step piano roll with OCT, ACC and SLIDE rows, an 8-pattern bank (A–H), length, swing and transpose, plus rotate, random, clear and copy/paste.
- **Playing live:** the computer keys play notes (hold Shift for accent) and Space starts/stops the sequencer. MIDI notes with velocity above 100 are accented.
- **Saving:** everything autosaves in the browser.

## HALCYON VA-8

An original 8-voice virtual-analog polysynth.

- **Oscillators:**
  - OSC 1: saw, square with PW, triangle, sine, or STACK (seven detuned saws spread across the stereo field)
  - OSC 2: semitone and fine tuning, hard sync, FM from OSC 1
  - SUB, NOISE and RING, all into a mixer with drive
- **Filters:** FILTER 1 (LP24 / LP12 / BP / HP) and FILTER 2 (LP / BP / HP) with a cutoff offset, routed serial, parallel or F1 only, in stereo. There's a filter ADSR and an amp ADSR, plus velocity and key tracking.
- **Modulation:** LFO 1 goes to pitch and cutoff. LFO 2 goes to pulse width, amp and pan. Both have five shapes, including sample & hold.
- **Voices and arpeggiator:** POLY (8 voices, oldest-note stealing), MONO or LEGATO with glide. The arpeggiator has UP / DOWN / UP-DOWN / RANDOM / ORDER modes, rates from 1/4 to 1/32 (with triplets), 1–4 octaves, gate length and HOLD.
- **Programs:** 8 factory programs.

## Post-effects (ACIDLINE and HALCYON)

Signal order: amp envelope → **distortion** → **mod FX** → **delay** → **reverb**. Each stage has an ON checkbox.

- **Amp envelope** (ACIDLINE): CLASSIC gate envelope or full **ADSR**.
- **Distortion**, 7 types: OVERDRIVE, TUBE, FUZZ, HARD CLIP, FOLDBACK, RECTIFY, BITCRUSH. Controls are drive, tone and mix.
- **Mod FX:** CHORUS, FLANGER or PHASER, with rate, depth, feedback and mix.
- **Delay:** tempo-synced, with feedback, tone and mix.
- **Reverb:** size, damping and mix.

## How the DSP is tested

The worklet files are loaded into a Node `vm` sandbox with a minimal AudioWorkletGlobalScope (`tests/helpers/worklet.ts`), so the shipped code is rendered and measured without a browser. The tests check:

- **Pitch:** 1 V/oct tracking against measured frequency.
- **Filters:** frequency response, plus stability at maximum resonance.
- **Envelopes and timing:** envelope shape, clock divisions, and sequencer stepping and reset.
- **Quantizer:** results for every scale and root.
- **HALCYON programs:** every factory program renders a chord without NaN or clipping.
- **Voices and arpeggiator:** polyphony limits and voice stealing, and arpeggiator order.
- **Effects:** every distortion and mod-FX type stays bounded, and is bit-transparent when bypassed.
