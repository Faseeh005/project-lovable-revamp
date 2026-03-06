// APPROACH: Call Android's native TTS directly via Capacitor's plugin bridge.
// This avoids the broken window.speechSynthesis in Android WebView entirely.
// On web/browser we fall back to the Web Speech API as normal.

import { Capacitor } from "@capacitor/core";

const isAndroid = () => {
  try {
    return Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
};

// Android: call native TTS via Capacitor plugin bridge
// @capacitor-community/text-to-speech registers itself as "TextToSpeech"
// on the native bridge — we access it via window.Capacitor.Plugins
const speakAndroid = (text) => {
  try {
    const plugins = window.Capacitor && window.Capacitor.Plugins;

    if (plugins && plugins.TextToSpeech) {
      console.log("[tts] Using Capacitor TextToSpeech plugin");
      plugins.TextToSpeech.speak({
        text: text,
        lang: "en-GB",
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0,
        category: "ambient",
      })
        .then(() => console.log("[tts] Android speak success"))
        .catch((err) => console.error("[tts] Android speak error:", err));
      return;
    }

    console.error(
      "[tts] TextToSpeech plugin not found. Did you run:\n" +
        "  npm install @capacitor-community/text-to-speech\n" +
        "  npx cap sync android\n" +
        "And rebuild + reinstall the APK?",
    );
  } catch (err) {
    console.error("[tts] speakAndroid crash:", err);
  }
};

// Web / iOS: Web Speech API
const speakWeb = (text) => {
  if (!window.speechSynthesis) {
    console.warn("[tts] speechSynthesis not available");
    return;
  }

  const synth = window.speechSynthesis;

  const doSpeak = () => {
    synth.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1.0;
    utt.pitch = 1.0;
    utt.volume = 1.0;
    utt.lang = "en-GB";
    const voices = synth.getVoices() || [];
    const voice =
      voices.find((v) => v.lang?.startsWith("en-GB")) ||
      voices.find((v) => v.lang?.startsWith("en")) ||
      voices[0] ||
      null;
    if (voice) {
      utt.voice = voice;
      utt.lang = voice.lang;
    }
    utt.onerror = (e) => console.error("[tts] Web Speech error:", e?.error);
    synth.speak(utt);
  };

  try {
    synth.resume();
    const voices = synth.getVoices() || [];
    if (voices.length > 0) {
      window.setTimeout(doSpeak, 100);
      return;
    }
    let done = false;
    const onReady = () => {
      if (done) return;
      done = true;
      synth.removeEventListener("voiceschanged", onReady);
      doSpeak();
    };
    synth.addEventListener("voiceschanged", onReady);
    window.setTimeout(() => {
      if (!done) {
        done = true;
        synth.removeEventListener("voiceschanged", onReady);
        doSpeak();
      }
    }, 1500);
  } catch (err) {
    console.error("[tts] speakWeb error:", err);
  }
};

// Public API

export const speak = (text, enabled = true) => {
  if (!enabled || !text?.trim()) return;
  console.log(
    "[tts] speak() — platform:",
    Capacitor.getPlatform(),
    "| text:",
    text.substring(0, 50),
  );
  if (isAndroid()) speakAndroid(text);
  else speakWeb(text);
};

export const stopSpeaking = () => {
  try {
    if (isAndroid()) {
      window.Capacitor?.Plugins?.TextToSpeech?.stop();
    } else {
      window.speechSynthesis?.cancel();
    }
  } catch {}
};

export default speak;
