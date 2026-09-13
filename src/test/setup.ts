import "@testing-library/jest-dom";
import { beforeAll, afterAll } from "vitest";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// Also mock globalThis.localStorage for modules that import it directly
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// Mock performance.now
Object.defineProperty(performance, "now", {
  value: () => Date.now(),
});

// Mock AudioContext
class MockAudioContext {
  state = "running";
  currentTime = 0;
  sampleRate = 44100;

  createGain() {
    return {
      gain: {
        value: 1,
        setValueAtTime: () => {},
        setTargetAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
        cancelScheduledValues: () => {},
      },
      connect: () => {},
      disconnect: () => {},
    };
  }

  createOscillator() {
    return {
      type: "sine",
      frequency: {
        value: 440,
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      connect: () => {},
      start: () => {},
      stop: () => {},
    };
  }

  createBiquadFilter() {
    return {
      type: "lowpass",
      frequency: {
        value: 1000,
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
        setTargetAtTime: () => {},
      },
      Q: { value: 1 },
      connect: () => {},
    };
  }

  createBufferSource() {
    return {
      buffer: null,
      playbackRate: { value: 1 },
      connect: () => {},
      start: () => {},
      stop: () => {},
    };
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => new Float32Array(length),
    };
  }

  createConvolver() {
    return {
      buffer: null,
      connect: () => {},
    };
  }

  createDynamicsCompressor() {
    return {
      threshold: { value: -24 },
      knee: { value: 30 },
      ratio: { value: 12 },
      attack: { value: 0.003 },
      release: { value: 0.25 },
      connect: () => {},
    };
  }

  createAnalyser() {
    return {
      fftSize: 2048,
      frequencyBinCount: 1024,
      getByteFrequencyData: () => {},
      connect: () => {},
    };
  }

  async resume() {
    this.state = "running";
  }

  async close() {
    this.state = "closed";
  }
}

// @ts-ignore
window.AudioContext = MockAudioContext;
// @ts-ignore
window.webkitAudioContext = MockAudioContext;

// Mock requestAnimationFrame
let rafId = 0;
const rafCallbacks = new Map<number, FrameRequestCallback>();

window.requestAnimationFrame = (callback: FrameRequestCallback) => {
  const id = ++rafId;
  rafCallbacks.set(id, callback);
  return id;
};

window.cancelAnimationFrame = (id: number) => {
  rafCallbacks.delete(id);
};

// Mock URL.createObjectURL and revokeObjectURL
URL.createObjectURL = () => "blob:mock";
URL.revokeObjectURL = () => {};

// Suppress console.error in tests unless explicitly testing error output
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("Warning:")) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
