'use strict';
const PIPER_WORKER_SOURCE="\nlet model, config, phonemizer;\nconst phonemizerBase = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/';\nconst runtimeBase = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/';\nconst voiceBase = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/';\nconst models = {\n  piper: 'sharvard/medium/es_ES-sharvard-medium.onnx'\n};\nlet phrases = [];\n\nasync function fetchModel(url) {\n  let cache;\n  try {\n    cache = await self.caches.open('piper-sharvard-v1');\n    const saved = await cache.match(url);\n    if (saved) return { response: saved, save: async () => {} };\n  } catch (error) {\n    console.warn('Piper: almacenamiento no disponible', error);\n  }\n  const response = await fetch(url);\n  if (!response.ok) throw new Error('Descarga de Piper: ' + response.status);\n  const copy = cache ? response.clone() : null;\n  return {\n    response,\n    async save() {\n      if (!copy) return;\n      try {\n        await cache.put(url, copy);\n      } catch (error) {\n        console.warn('Piper: no se pudo guardar la voz', error);\n      }\n    }\n  };\n}\n\nasync function readVoiceModel(response) {\n  const total = Number(response.headers.get('content-length'));\n  if (!total || !response.body) return response.arrayBuffer();\n  const reader = response.body.getReader();\n  const chunks = [];\n  let loaded = 0;\n  let lastPercent = -1;\n  while (true) {\n    const { done, value } = await reader.read();\n    if (done) break;\n    chunks.push(value);\n    loaded += value.byteLength;\n    const percent = Math.min(99, Math.floor(loaded * 100 / total));\n    if (percent !== lastPercent) {\n      lastPercent = percent;\n      self.postMessage({ percent });\n    }\n  }\n  return new Blob(chunks).arrayBuffer();\n}\n\nlet pending = Promise.resolve();\nself.onmessage = ({ data }) => {\n  pending = pending.then(() => synthesize(data));\n};\n\nasync function synthesize({ text, speed, id, modelKey, preload, pauseSeconds }) {\n  try {\n    if (!model) {\n      const modelUrl = voiceBase + models[modelKey];\n      importScripts(runtimeBase + 'ort.wasm.min.js',\n        'https://cdn.jsdelivr.net/gh/piper-tts/piper-tts.github.io@main/vendor/phonemize/piper_phonemize.js');\n      ort.env.wasm.wasmPaths = runtimeBase;\n      ort.env.wasm.numThreads = 1;\n      const [voiceFile, settings] = await Promise.all([fetchModel(modelUrl), fetchModel(modelUrl + '.json')]);\n      const [modelBytes, voiceConfig] = await Promise.all([\n        readVoiceModel(voiceFile.response),\n        settings.response.json(),\n        voiceFile.save(),\n        settings.save()\n      ]);\n      self.postMessage({ percent: 100 });\n      config = voiceConfig;\n      model = await ort.InferenceSession.create(modelBytes, { executionProviders: ['wasm'] });\n      phonemizer = await createPiperPhonemize({\n        locateFile: file => phonemizerBase + file,\n        print: line => phrases.push(JSON.parse(line))\n      });\n    }\n    if (preload) { self.postMessage({id, ready:true}); return; }\n    phrases = [];\n    phonemizer.callMain(['--espeak_data', '/espeak-ng-data', '--language', config.espeak.voice,\n      '--input', JSON.stringify([{ text }])]);\n    const ids = phrases.flatMap(phrase => phrase.phoneme_ids);\n    const eos = config.phoneme_id_map['$'][0];\n    const samples = [];\n    const gap = new Float32Array(Math.round(config.audio.sample_rate * (pauseSeconds || 0.35)));\n    for (let start = 0; start < ids.length;) {\n      const end = ids.indexOf(eos, start);\n      const sentence = ids.slice(start, end < 0 ? ids.length : end + 1);\n      start += sentence.length;\n      const inputs = {\n        input: new ort.Tensor('int64', BigInt64Array.from(sentence, BigInt), [1, sentence.length]),\n        input_lengths: new ort.Tensor('int64', [BigInt(sentence.length)], [1]),\n        scales: new ort.Tensor('float32', [config.inference.noise_scale, config.inference.length_scale / speed, config.inference.noise_w], [3]),\n      };\n      if (config.num_speakers > 1) inputs.sid = new ort.Tensor('int64', [1n], [1]);\n      const { output } = await model.run(inputs);\n      samples.push(new Float32Array(output.data), gap);\n    }\n    if (!samples.length) throw new Error('Piper no produjo audio.');\n    const pcm = new Float32Array(samples.reduce((length, chunk) => length + chunk.length, 0));\n    let offset = 0;\n    for (const chunk of samples) {\n      pcm.set(chunk, offset);\n      offset += chunk.length;\n    }\n    self.postMessage({ id, pcm, sampleRate: config.audio.sample_rate }, [pcm.buffer]);\n  } catch (error) {\n    self.postMessage({ id, error: String(error) });\n  }\n}\n";
function createPresentationReader({voiceSelect,speedSelect,status,busy,progress,progressLabel}){
 const synth=window.speechSynthesis;const Audio=window.AudioContext||window.webkitAudioContext;
 const phonon=createPhononReader({progress,report:message=>{progressLabel.textContent=message;}});
 let phononPlayback;
 let worker,audio,source,ready=false,loading=false,failed=false,run=0,serial=0,nativeActive=false;
 const jobs=new Map();let voices=[];let preferred='';try{preferred=localStorage.getItem('preeval-reader-voice')||'';}catch{}
 function nativeVoices(){voices=synth?.getVoices().filter(v=>/^es(?:[-_]|$)/i.test(v.lang))||[];return {google:voices.find(v=>/google/i.test(v.name)&&/^es[-_]ES$/i.test(v.lang))||voices.find(v=>/google/i.test(v.name)),device:voices.find(v=>/m[oó]nica/i.test(v.name))||voices.find(v=>v.localService&&v.default)||voices.find(v=>v.localService)||voices[0]};}
 function refresh(){const selected=preferred;const {google,device}=nativeVoices();
 voiceSelect.replaceChildren(new Option(google?'Automática · Google Español':'Automática · Noa',''));
 const g=new Option(google?'Google Español':'Google Español · No disponible','google');g.disabled=!google;voiceSelect.add(g);
 const phononOptions=document.createElement('optgroup');phononOptions.label='Phonon · Español de España';
 Object.keys(PHONON_VOICES).forEach(name=>phononOptions.append(new Option(name,'phonon:'+name)));
 voiceSelect.add(phononOptions);
 const p=new Option('Piper Sharvard · Segunda voz'+(ready?' · Lista':loading?' · Cargando':failed?' · No disponible':''),'piper');p.disabled=failed;voiceSelect.add(p);
 voiceSelect.add(new Option(device?'Dispositivo · '+device.name:'Voz del dispositivo','device'));
 voices.filter(v=>v!==google&&v!==device).forEach(v=>voiceSelect.add(new Option(v.name+' · '+v.lang,v.voiceURI)));
 if([...voiceSelect.options].some(o=>o.value===selected&&!o.disabled))voiceSelect.value=selected;
 }
 function failure(error){failed=true;loading=false;ready=false;progress.hidden=true;progressLabel.textContent='Piper no disponible; se usará la voz del dispositivo.';for(const j of jobs.values()){clearTimeout(j.timer);j.reject(error);}jobs.clear();worker?.terminate();worker=null;refresh();}
 function ensureWorker(){if(worker)return;worker=new Worker(URL.createObjectURL(new Blob([PIPER_WORKER_SOURCE],{type:'text/javascript'})));
 worker.onerror=()=>failure(new Error('No se pudo cargar Piper'));
 worker.onmessage=({data})=>{if(data.percent!==undefined){progress.hidden=false;progress.value=Math.min(95,Math.round(data.percent*.95));progressLabel.textContent='Cargando Piper · '+progress.value+' %';return;}
 const job=jobs.get(data.id);if(!job)return;jobs.delete(data.id);clearTimeout(job.timer);
 if(data.error){job.reject(new Error(data.error));return;}job.resolve(data);};}
 function request(data){return new Promise((resolve,reject)=>{try{ensureWorker();const id=++serial;const timer=setTimeout(()=>{jobs.delete(id);reject(new Error('Tiempo de espera de Piper agotado'));},240000);jobs.set(id,{resolve,reject,timer});worker.postMessage({...data,id,modelKey:'piper'});}catch(e){reject(e);}});}
 async function preload(){if(ready||loading||failed)return;if(!Audio||!window.Worker||!window.WebAssembly){failure(new Error('Piper no compatible'));return;}
 loading=true;progress.hidden=false;progress.removeAttribute('value');progressLabel.textContent='Cargando Piper…';refresh();
 try{await request({preload:true,text:'',speed:1});ready=true;loading=false;progress.hidden=false;progress.value=100;progressLabel.textContent='Piper lista';refresh();}catch(e){failure(e);}}
 function stop(){run++;phononPlayback?.abort();phononPlayback=null;if(nativeActive)synth?.cancel();nativeActive=false;if(source){source.onended=null;try{source.stop();source.disconnect();}catch{}source=null;}busy(false);}
 function nativeRead(text,voice,id){return new Promise(resolve=>{if(id!==run)return resolve();if(!synth||!voice){status('No hay una voz disponible.');return resolve();}
 const utterance=new SpeechSynthesisUtterance(text);utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=Number(speedSelect.value)||1;nativeActive=true;
 utterance.onend=()=>{nativeActive=false;resolve();};utterance.onerror=()=>{nativeActive=false;status('No se pudo reproducir esta voz.');resolve();};synth.speak(utterance);});}
 async function speak(text){stop();const id=run;const selected=voiceSelect.value;const {google,device}=nativeVoices();if(selected==='piper')preload();
 const native=selected==='google'?(google||device):selected==='device'?device:voices.find(v=>v.voiceURI===selected)||(google||device);
 const usePiper=selected==='piper'&&ready;
 const phononVoice=selected.startsWith('phonon:')?selected.slice(7):(!selected&&!google?'Noa':'');
 const trafficPauses=text.startsWith('¿Cómo funciona nuestra clase? Verde:');
 const paragraphs=text.split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean);
 busy(true);try{
 if(phononVoice){
 const playback=new AbortController();phononPlayback=playback;status('Leyendo con '+phononVoice+'…');
 await phonon.play(text,phononVoice,Number(speedSelect.value)||1,playback.signal);
 if(id===run)status('Lectura terminada');
 }else if(usePiper){audio||=new Audio();await audio.resume();status('');for(let paragraphIndex=0;paragraphIndex<paragraphs.length;paragraphIndex++){if(id!==run)return;const data=await request({text:paragraphs[paragraphIndex],speed:Number(speedSelect.value)||1,pauseSeconds:trafficPauses?0.55:0.35});if(id!==run)return;
 const buffer=audio.createBuffer(1,data.pcm.length,data.sampleRate);buffer.getChannelData(0).set(data.pcm);source=audio.createBufferSource();source.buffer=buffer;source.connect(audio.destination);status('');
 await new Promise(resolve=>{source.onended=()=>{source?.disconnect();source=null;resolve();};source.start();});
 if(paragraphIndex<paragraphs.length-1&&id===run)await new Promise(resolve=>setTimeout(resolve,750));}
 }else{status('');
 for(let paragraphIndex=0;paragraphIndex<paragraphs.length;paragraphIndex++){const sentences=paragraphs[paragraphIndex].match(/[^.!?…]+[.!?…]*/g)||[paragraphs[paragraphIndex]];for(let sentenceIndex=0;sentenceIndex<sentences.length;sentenceIndex++){if(id!==run)return;await nativeRead(sentences[sentenceIndex],native,id);if(sentenceIndex<sentences.length-1&&id===run)await new Promise(resolve=>setTimeout(resolve,trafficPauses?550:350));}if(paragraphIndex<paragraphs.length-1&&id===run)await new Promise(resolve=>setTimeout(resolve,750));}}
 }catch(e){if(id!==run)return;status('');await nativeRead(text,device,id);
 }finally{if(id===run)busy(false);}
 }
 voiceSelect.addEventListener('change',()=>{preferred=voiceSelect.value;try{localStorage.setItem('preeval-reader-voice',preferred);}catch{}stop();if(preferred==='piper')preload();
 if(preferred.startsWith('phonon:'))void phonon.preload().catch(()=>{});});
 function warmDefault(){
 const {google}=nativeVoices();
 if ((!preferred&&!google)||preferred.startsWith('phonon:'))void phonon.preload().catch(()=>{});
 }
 synth?.addEventListener('voiceschanged',refresh);
 refresh();
 // Give browsers a moment to populate the Google voice list before loading fallback weights.
 setTimeout(warmDefault,500);
 return {speak,stop,refresh,preload};
}

