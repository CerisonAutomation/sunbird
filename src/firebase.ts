/**
 * Firebase configuration for Sunbird.
 *
 * Project: sunbird-leaderboard
 * App: sunbird-web (1:741609858752:web:c8b187fee6c3b1d6416f25)
 *
 * Services: Auth (Google Sign-in) + Firestore (global leaderboard)
 */
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, signOut, onAuthStateChanged, type User } from "firebase/auth";
import { getFirestore, collection, addDoc, query, orderBy, limit, getDocs, where } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBUMliAUmWeToz5q8lCYFAIai7JHjfFoCM",
  authDomain: "sunbird-leaderboard.firebaseapp.com",
  projectId: "sunbird-leaderboard",
  storageBucket: "sunbird-leaderboard.firebasestorage.app",
  messagingSenderId: "741609858752",
  appId: "1:741609858752:web:c8b187fee6c3b1d6416f25",
};

let app: ReturnType<typeof initializeApp> | null = null;
let auth: ReturnType<typeof getAuth> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;
let currentUser: User | null = null;

function ensureInit() {
  if (app) return;
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
  });
}

/* ── Auth ──────────────────────────────────────────────────────── */

export async function signInWithGoogle(): Promise<User | null> {
  ensureInit();
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth!, provider);
    return result.user;
  } catch {
    return null;
  }
}

/** Sign in anonymously — lets users submit scores without an account */
export async function signInAnon(): Promise<User | null> {
  ensureInit();
  try {
    const result = await signInAnonymously(auth!);
    return result.user;
  } catch {
    return null;
  }
}

/** Auto-sign-in: try anonymous if no user yet */
export async function ensureAuth(): Promise<User | null> {
  ensureInit();
  if (currentUser) return currentUser;
  return signInAnon();
}

export async function signOutUser(): Promise<void> {
  ensureInit();
  await signOut(auth!);
}

export function getCurrentUser(): User | null {
  ensureInit();
  return currentUser;
}

export function getDisplayName(): string {
  if (!currentUser) return "Anonymous";
  return currentUser.displayName?.split(" ")[0] ?? currentUser.email?.split("@")[0] ?? "Pilot";
}

/* ── Firestore: Global Leaderboard ─────────────────────────────── */

export type FirestoreScore = {
  userId: string;
  name: string;
  score: number;
  distance: number;
  coins: number;
  perfects: number;
  mode: string;
  skin: string;
  ts: number;
};

export async function submitScore(
  mode: string,
  name: string,
  score: number,
  distance: number,
  coins: number,
  perfects: number,
  skin: string,
): Promise<number> {
  ensureInit();
  if (!currentUser) return -1;

  try {
    const docRef = await addDoc(collection(db!, "scores"), {
      userId: currentUser.uid,
      name: name.slice(0, 16),
      score: Math.floor(score),
      distance: Math.floor(distance),
      coins,
      perfects,
      mode,
      skin,
      ts: Date.now(),
    });
    void docRef;

    // Fetch rank after submit
    const rank = await getMyRank(mode, score);
    return rank;
  } catch {
    return -1;
  }
}

export async function fetchTop(mode: string, topN = 10): Promise<FirestoreScore[]> {
  ensureInit();
  try {
    const q = query(
      collection(db!, "scores"),
      where("mode", "==", mode),
      orderBy("score", "desc"),
      limit(topN),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as FirestoreScore);
  } catch {
    return [];
  }
}

export async function getMyRank(mode: string, score: number): Promise<number> {
  ensureInit();
  try {
    const q = query(
      collection(db!, "scores"),
      where("mode", "==", mode),
      where("score", ">", Math.floor(score)),
    );
    const snap = await getDocs(q);
    return snap.size + 1;
  } catch {
    return -1;
  }
}

export async function getRankDisplay(mode: string, score: number): Promise<string> {
  const rank = await getMyRank(mode, score);
  if (rank <= 0) return "";
  if (rank === 1) return "🏆 #1 GLOBAL!";
  if (rank <= 3) return `🥇 #${rank} Global`;
  if (rank <= 10) return `⚡ #${rank} Global`;
  return `#${rank} Global`;
}
