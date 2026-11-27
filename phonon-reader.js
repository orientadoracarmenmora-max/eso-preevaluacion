'use strict';

const PHONON_VOICES = {
  "Noa": "./phonon/voces/b6FvJAiokjdqIti4.safetensors",
  "Borja": "./phonon/voces/tIjCgP8v3RY8UpgM.safetensors",
  "Candela": "./phonon/voces/c9wqBDmQiBie5q6Y.safetensors",
  "Marcos": "./phonon/voces/jvPx8j8zLGQ3utZz.safetensors",
  "Celia": "./phonon/voces/rmLBOdHrfkFym9MM.safetensors",
  "Iker": "./phonon/voces/t-_TS1e-0GzDAX02.safetensors",
  "Alba": "./phonon/voces/u2UscyAnHilpiwmf.safetensors",
  "Nuno": "./phonon/voces/fghJGlv90qu8OJ36.safetensors",
  "Alicia": "./phonon/voces/4701YgRXjkBcg6sL.safetensors",
  "Izan": "./phonon/voces/Ejb29qHnSOK0cIHY.safetensors",
  "Nerea": "./phonon/voces/EQcQFGkYfMn5YJgx.safetensors",
  "Guillermo": "./phonon/voces/FaLVVqpFQcDOtq45.safetensors"
};

function createPhononReader({progress, report}) {
  let modelPromise;

  function preload() {
    if (modelPromise) return modelPromise;
    progress.hidden = false;
    progress.removeAttribute('value');
    report('Preparando las voces de Phonon…');
    modelPromise = import('./phonon/motor/index.js').then(({PhononTTS}) => PhononTTS.load({
      lang: 'es', quant: 'q8', device: 'cpu', threads: 1,
      model: {
        config: './phonon/modelo-phonon-es-v1/config.json',
        tokenizer: './phonon/modelo-phonon-es-v1/tokenizer.json',
        weights: {q8: './phonon/modelo-phonon-es-v1/model.q8.gguf'},
        voices: PHONON_VOICES, defaultVoice: 'Noa'
      },
      onProgress({file, total, loaded}) {
        if (file === 'weights' && total) progress.value = (loaded / total) * 100;
      }
    })).then(model => {
      report('Voces de Phonon listas.');
      return model;
    }).catch(error => {
      console.warn('Phonon:', error);
      report('Phonon no disponible. Puedes elegir una voz del dispositivo.');
      modelPromise = undefined;
      throw error;
    }).finally(() => {
      progress.hidden = true;
    });
    return modelPromise;
  }

  async function play(text, voice, speed, signal) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    const audio = new Audio();
    const close = () => { if (audio.state !== 'closed') void audio.close().catch(() => {}); };
    let resolveAbort;
    const cancelled = new Promise(resolve => { resolveAbort = resolve; });
    const onAbort = () => { close(); resolveAbort(); };
    signal.addEventListener('abort', onAbort, {once: true});
    try {
      const [model] = await Promise.all([preload(), audio.resume()]);
      if (signal.aborted) return;
      const stream = model.stream(text, {voice, signal});
      void stream.done.catch(() => {});
      let end = 0;
      let last;
      for await (const pcm of stream) {
        if (signal.aborted) return;
        const buffer = audio.createBuffer(1, pcm.length, model.sampleRate);
        buffer.copyToChannel(pcm, 0);
        const node = audio.createBufferSource();
        node.buffer = buffer;
        node.playbackRate.value = speed;
        node.connect(audio.destination);
        end = Math.max(end, audio.currentTime + 0.035);
        last = new Promise(resolve => { node.onended = resolve; });
        node.start(end);
        end += buffer.duration / speed;
      }
      await stream.done;
      if (signal.aborted) return;
      if (!last) throw new Error('Phonon no generó audio.');
      await Promise.race([last, cancelled]);
    } finally {
      signal.removeEventListener('abort', onAbort);
      close();
    }
  }

  return {preload, play};
}
