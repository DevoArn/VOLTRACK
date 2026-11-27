import { keyboardTargets } from './modules/sequencing';

/** Route Web MIDI note messages to every KEYBOARD module. Returns a status string. */
export async function initMidi(onStatus: (s: string) => void): Promise<void> {
  if (!('requestMIDIAccess' in navigator)) {
    onStatus('MIDI: n/a');
    return;
  }
  try {
    const access = await navigator.requestMIDIAccess();
    const handler = (e: MIDIMessageEvent) => {
      const d = e.data;
      if (!d || d.length < 3) return;
      const cmd = d[0] & 0xf0;
      const note = d[1];
      const vel = d[2];
      if (cmd === 0x90 && vel > 0) keyboardTargets.forEach((t) => t.api.noteOn(note, vel / 127));
      else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) keyboardTargets.forEach((t) => t.api.noteOff(note));
    };
    const attach = () => {
      let n = 0;
      access.inputs.forEach((input) => {
        input.onmidimessage = handler;
        n++;
      });
      onStatus(n ? `MIDI: ${n} in` : 'MIDI: no device');
    };
    access.onstatechange = attach;
    attach();
  } catch {
    onStatus('MIDI: blocked');
  }
}
