import { db, auth, getSecondaryAuth } from './firebase';
import { collection, doc, setDoc, getDoc, getDocs, getDocsFromCache, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth';
import { UserAccount } from '../types';
import { idbGet, idbSet } from './indexedDbCache';

const USERS_COLLECTION = 'users';
const CURRENT_USER_KEY = 'tnb_authenticated_user';
const ACCOUNTS_CACHE_KEY = 'tnb_user_accounts';

/**
 * Local mirror of the accounts list — only ever consulted when Firestore
 * itself is unreachable (see initializeUsersCollection's catch block).
 * Written to both localStorage (fast, synchronous) and IndexedDB (survives
 * localStorage quota/eviction) so the offline/demo-mode fallback stays
 * usable even if localStorage has been cleared.
 */
function sanitizeForFirestore<T extends Record<string, any>>(obj: T): T {
  const clean: any = {};
  Object.keys(obj).forEach((key) => {
    if (obj[key] !== undefined) {
      clean[key] = obj[key];
    }
  });
  return clean;
}

function writeAccountsCache(accounts: UserAccount[]) {
  try {
    localStorage.setItem(ACCOUNTS_CACHE_KEY, JSON.stringify(accounts));
  } catch (e) {
    // ignore quota / serialization errors — IndexedDB below still gets it
  }
  void idbSet(ACCOUNTS_CACHE_KEY, accounts);
}

async function readAccountsCache(): Promise<UserAccount[] | null> {
  try {
    const stored = localStorage.getItem(ACCOUNTS_CACHE_KEY);
    if (stored) return JSON.parse(stored) as UserAccount[];
  } catch (e) {
    // fall through to IndexedDB
  }
  const idbAccounts = await idbGet<UserAccount[]>(ACCOUNTS_CACHE_KEY);
  return idbAccounts || null;
}

// Synthetic email domain used to back real Firebase Authentication with the
// existing accountId/password login UX (no real email addresses involved).
const AUTH_EMAIL_DOMAIN = '@tnb.local';
const toSyntheticEmail = (accountId: string) => `${accountId.trim().toLowerCase()}${AUTH_EMAIL_DOMAIN}`;

// Firebase Authentication rejects passwords under 6 chars, but several legacy
// accounts (incl. the default seed accounts) use a 3-char password like "123".
// Deterministically pad the password used to back the *real* Firebase Auth
// credential so every account — regardless of its original legacy password
// length — can actually be migrated and get a real `auth.currentUser`
// session. The user-facing legacy password itself (checked against
// passwordHash) is never changed; only what's sent to Firebase Auth is.
// Without a real Auth session, every Firestore read/write is denied by
// firestore.rules (isSignedIn() requires request.auth != null), which is why
// unmigrated accounts previously appeared to "not save" and lose data on refresh.
const FIREBASE_AUTH_PASSWORD_MIN_LENGTH = 6;
const toFirebaseAuthPassword = (rawPassword: string): string =>
  rawPassword.length >= FIREBASE_AUTH_PASSWORD_MIN_LENGTH
    ? rawPassword
    : rawPassword.padEnd(FIREBASE_AUTH_PASSWORD_MIN_LENGTH, '0');

/**
 * Cryptographically hash password using browser Native Web Crypto API (SHA-256)
 * Kept only to verify legacy (pre-Firebase-Auth) accounts during migration and
 * as a non-authoritative record mirror; real login now goes through Firebase
 * Authentication (see loginUser).
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + '_TNB_SECURE_SALT_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Password for the initial Super Admin seed account — read from the
// environment, never hardcoded here. Anyone with access to this source file
// (or its git history) would otherwise know the admin credentials for every
// deployment built from it. Set VITE_SEED_ADMIN_PASSWORD in your local .env
// (gitignored) before the very first run against a fresh Firestore project;
// change it via "Đổi mật khẩu" immediately after logging in.
const SEED_SUPER_ADMIN_PASSWORD = (import.meta as any).env?.VITE_SEED_ADMIN_PASSWORD as string | undefined;

// Seed Super Admin account details. This is the only account ever auto-seeded
// — everyone else should be created from the User Management screen once
// logged in, not hardcoded here as a source-code default.
export const SUPER_ADMIN_ACCOUNT: UserAccount = {
  accountId: '3717',
  name: 'Super Admin TNB',
  role: 'super_admin',
  createdAt: new Date().toISOString(),
  isActive: true,
};

const DEFAULT_ACCOUNTS: UserAccount[] = [SUPER_ADMIN_ACCOUNT];

/**
 * Instant-paint helper for the User Management screen: reads whatever
 * Firestore's own persistent local cache already has for the `users`
 * collection — a local IndexedDB lookup, not a network call — so a repeat
 * open of that modal on the same device shows the list immediately instead
 * of the "Tổng số tài khoản: 0" empty state sitting there for however long
 * the actual network round trip takes. Callers should still follow up with
 * initializeUsersCollection() for the server-authoritative list; this is
 * only ever a (possibly stale) first paint. Empty/failed cache read (first
 * ever open, or persistence unavailable) resolves to [] — never throws.
 */
export async function getUsersFromCache(): Promise<UserAccount[]> {
  if (!db) return [];
  try {
    const snapshot = await getDocsFromCache(collection(db, USERS_COLLECTION));
    const users: UserAccount[] = [];
    snapshot.forEach((docSnap) => users.push(docSnap.data() as UserAccount));
    return users;
  } catch {
    return [];
  }
}

/**
 * Initialize Firestore users collection with default accounts if empty.
 * NOTE: this does an unfiltered list read of the whole `users` collection —
 * only safe to call from Super-Admin-gated flows or the pre-migration legacy
 * login fallback (see loginUser). Once Firestore rules restrict `list` to
 * Super Admin, a non-admin calling this will simply get an empty/failed read.
 */
export async function initializeUsersCollection(): Promise<UserAccount[]> {
  if (!SEED_SUPER_ADMIN_PASSWORD) {
    console.error(
      'VITE_SEED_ADMIN_PASSWORD is not set — cannot seed the initial Super Admin account. ' +
      'Add it to your .env file (see .env.example) before the first run against a fresh Firestore project.'
    );
  }

  try {
    if (db) {
      const usersRef = collection(db, USERS_COLLECTION);
      const snapshot = await getDocs(usersRef);

      if (snapshot.empty) {
        if (!SEED_SUPER_ADMIN_PASSWORD) return [];
        // Populate default accounts with hashed passwords
        const seeded: UserAccount[] = [];
        for (const user of DEFAULT_ACCOUNTS) {
          const passHash = await hashPassword(SEED_SUPER_ADMIN_PASSWORD);
          const userToSave: UserAccount = { ...user, passwordHash: passHash };
          delete userToSave.password;
          await setDoc(doc(db, USERS_COLLECTION, user.accountId), userToSave);
          seeded.push(userToSave);
        }
        return seeded;
      } else {
        const users: UserAccount[] = [];
        snapshot.forEach((docSnap) => {
          users.push(docSnap.data() as UserAccount);
        });

        // Ensure Super Admin 3717 always exists (only if we have a seed
        // password to give it — an account with no credential at all would
        // be permanently unreachable, which is worse than not creating it).
        const hasSuperAdmin = users.some((u) => u.accountId === '3717');
        if (!hasSuperAdmin && SEED_SUPER_ADMIN_PASSWORD) {
          const passHash = await hashPassword(SEED_SUPER_ADMIN_PASSWORD);
          const adminToSave: UserAccount = { ...SUPER_ADMIN_ACCOUNT, passwordHash: passHash };
          delete adminToSave.password;
          await setDoc(doc(db, USERS_COLLECTION, '3717'), adminToSave);
          users.push(adminToSave);
        }

        return users;
      }
    }
  } catch (err) {
    console.warn('Firestore offline/demo mode, using local memory storage for users:', err);
  }

  // Fallback to local cache (localStorage, or IndexedDB if that's empty)
  const cachedAccounts = await readAccountsCache();
  if (cachedAccounts) return cachedAccounts;

  if (!SEED_SUPER_ADMIN_PASSWORD) return [];

  const seededLocal: UserAccount[] = [];
  for (const user of DEFAULT_ACCOUNTS) {
    const passHash = await hashPassword(SEED_SUPER_ADMIN_PASSWORD);
    const userToSave: UserAccount = { ...user, passwordHash: passHash };
    delete userToSave.password;
    seededLocal.push(userToSave);
  }
  writeAccountsCache(seededLocal);
  return seededLocal;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMsg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMsg));
    }, timeoutMs);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Authenticate user with Account ID and Password.
 *
 * Path A: real Firebase Authentication (accountId@tnb.local synthetic email).
 * Path B: legacy Firestore-hash verification, used only for accounts not yet
 *         migrated — on success it lazily creates the real Firebase Auth
 *         credential so the account is on Path A from then on. This makes a
 *         normal successful login double as the one-time migration step.
 */
export async function loginUser(
  accountId: string,
  password: string
): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
  const cleanId = accountId.trim();
  const cleanPass = password.trim();

  if (!cleanId || !cleanPass) {
    return { success: false, error: 'Vui lòng nhập đầy đủ Tài khoản và Mật khẩu!' };
  }

  if (!auth) {
    return { success: false, error: 'Chưa kết nối được hệ thống xác thực Firebase.' };
  }

  const normalizedId = cleanId.toLowerCase();
  const email = toSyntheticEmail(normalizedId);
  const authPass = toFirebaseAuthPassword(cleanPass);

  // --- Path A: real Firebase Auth sign-in ---
  try {
    await withTimeout(
      signInWithEmailAndPassword(auth, email, authPass),
      10000,
      'Quá thời gian kết nối máy chủ xác thực (Timeout).'
    );

    let profile: UserAccount | null = null;

    if (db) {
      try {
        const snap = await withTimeout(
          getDoc(doc(db, USERS_COLLECTION, normalizedId)),
          5000,
          'getDoc timeout'
        );
        if (snap.exists()) {
          profile = snap.data() as UserAccount;
        }
      } catch (dbErr) {
        console.warn('Could not fetch user profile from Firestore live, checking local cache:', dbErr);
      }
    }

    // If Firestore getDoc is slow/offline, try reading from local cache
    if (!profile) {
      const cached = await readAccountsCache();
      const match = cached?.find((u) => u.accountId.toLowerCase() === normalizedId);
      if (match) {
        profile = match;
      }
    }

    // Fallback profile if profile document is not found or still syncing
    if (!profile) {
      profile = {
        accountId: normalizedId,
        name: normalizedId === '3717' ? 'Super Admin TNB' : `Tài khoản ${normalizedId}`,
        role: normalizedId === '3717' ? 'super_admin' : 'viewer',
        isActive: true,
        createdAt: new Date().toISOString(),
      };
    }

    if (!profile.isActive) {
      return { success: false, error: 'Tài khoản này đã bị khóa! Vui lòng liên hệ Super Admin (3717).' };
    }

    const updatedUser = { ...profile, lastLogin: new Date().toISOString() };
    saveSession(updatedUser);
    if (db) {
      updateDoc(doc(db, USERS_COLLECTION, normalizedId), { lastLogin: updatedUser.lastLogin }).catch(() => {});
    }
    return { success: true, user: updatedUser };
  } catch (authErr: any) {
    const code = authErr?.code;
    if (code === 'auth/too-many-requests') {
      return { success: false, error: 'Đăng nhập thất bại quá nhiều lần. Vui lòng thử lại sau vài phút!' };
    }
    if (code === 'auth/network-request-failed') {
      return { success: false, error: 'Lỗi kết nối mạng. Vui lòng kiểm tra kết nối WiFi/4G!' };
    }
    // Not yet migrated to Firebase Auth (or the password is genuinely wrong) —
    // fall through to the legacy check, which is the authoritative answer.
  }

  // --- Path B: legacy verification + lazy migration ---
  try {
    const inputHash = await hashPassword(cleanPass);
    const allUsers = await withTimeout(
      initializeUsersCollection(),
      6000,
      'Quá thời gian đồng bộ dữ liệu tài khoản.'
    );
    const matchedUser = allUsers.find((u) => u.accountId.toLowerCase() === normalizedId);

    if (!matchedUser) {
      return { success: false, error: 'Tài khoản hoặc mật khẩu không chính xác!' };
    }

    const isMatch =
      (matchedUser.passwordHash && matchedUser.passwordHash === inputHash) ||
      matchedUser.password === cleanPass;

    if (!isMatch) {
      return { success: false, error: 'Tài khoản hoặc mật khẩu không chính xác!' };
    }

    if (!matchedUser.isActive) {
      return { success: false, error: 'Tài khoản này đã bị khóa! Vui lòng liên hệ Super Admin (3717).' };
    }

    // Correct legacy password confirmed — lazily create the real Firebase Auth
    // credential (padded to meet Firebase's 6-char minimum, see
    // toFirebaseAuthPassword) so this account is fully migrated from here on,
    // regardless of how short its legacy password is.
    try {
      await createUserWithEmailAndPassword(auth, email, authPass);
    } catch (e: any) {
      if (e?.code !== 'auth/email-already-in-use') {
        console.warn('Lazy Firebase Auth migration failed:', e);
      }
    }

    const updatedUser = { ...matchedUser, lastLogin: new Date().toISOString() };
    saveSession(updatedUser);

    if (db) {
      updateDoc(doc(db, USERS_COLLECTION, normalizedId), { lastLogin: updatedUser.lastLogin }).catch(() => {});
    }

    return { success: true, user: updatedUser };
  } catch (err: any) {
    if (err?.message?.includes('Timeout') || err?.message?.includes('thời gian')) {
      return { success: false, error: err.message };
    }
    return { success: false, error: 'Tài khoản hoặc mật khẩu không chính xác!' };
  }
}

/**
 * Create a new account (Super Admin capability).
 * Creates the real Firebase Auth credential first (on an isolated secondary
 * Auth instance so the admin's own session isn't hijacked), then the
 * Firestore profile that carries role/status.
 */
export async function createUserAccount(
  newAccount: UserAccount,
  creatorAccountId: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedId = newAccount.accountId.trim().toLowerCase();

  if (!newAccount.password || newAccount.password.length < 6) {
    return { success: false, error: 'Mật khẩu phải có ít nhất 6 ký tự (yêu cầu của Firebase Authentication)!' };
  }

  const users = await initializeUsersCollection();
  if (users.some((u) => u.accountId.toLowerCase() === normalizedId)) {
    return { success: false, error: `Tài khoản ${normalizedId} đã tồn tại!` };
  }

  const secondaryAuth = getSecondaryAuth();
  if (secondaryAuth) {
    try {
      await createUserWithEmailAndPassword(secondaryAuth, toSyntheticEmail(normalizedId), newAccount.password);
    } catch (e: any) {
      if (e?.code === 'auth/email-already-in-use') {
        // Tài khoản đã từng tồn tại trong Firebase Auth (orphan user)
        // Tiếp tục ghi profile vào Firestore và cập nhật password hash để kích hoạt lại tài khoản
        console.warn(`Auth user ${normalizedId} already exists in Firebase Auth, syncing profile to Firestore.`);
      } else if (e?.code === 'auth/weak-password') {
        return { success: false, error: 'Mật khẩu quá yếu (tối thiểu 6 ký tự)!' };
      } else {
        console.warn('secondaryAuth createUser error:', e);
      }
    } finally {
      try {
        await signOut(secondaryAuth);
      } catch (e) {
        // ignore
      }
    }
  }

  const passHash = await hashPassword(newAccount.password);
  const accountToSave: UserAccount & { passwordHash?: string } = {
    accountId: normalizedId,
    name: newAccount.name ? newAccount.name.trim() : normalizedId,
    role: newAccount.role || 'viewer',
    passwordHash: passHash,
    allowedChannels: newAccount.allowedChannels && newAccount.allowedChannels.length > 0 ? newAccount.allowedChannels : [],
    createdAt: new Date().toISOString(),
    createdBy: creatorAccountId,
    isActive: true,
  };

  if (!db) {
    return { success: false, error: 'Không thể lưu tài khoản: chưa kết nối được Firebase.' };
  }

  try {
    const cleanData = sanitizeForFirestore(accountToSave);
    await setDoc(doc(db, USERS_COLLECTION, normalizedId), cleanData);
  } catch (e) {
    console.error('Firestore profile write failed after Auth user created:', e);
    return {
      success: false,
      error: 'Tài khoản đăng nhập đã được tạo nhưng lưu hồ sơ (quyền hạn) thất bại! Vui lòng thử lại hoặc liên hệ kỹ thuật.',
    };
  }

  const updatedList = [...users, accountToSave];
  writeAccountsCache(updatedList);

  return { success: true };
}

/**
 * Update account role / active status.
 * Does NOT support setting another user's password: the client-side Firebase
 * SDK can only change the currently signed-in user's own password — resetting
 * someone else's requires the Admin SDK, which this client-only app doesn't
 * have. Use changeOwnPassword() for self-service password changes instead.
 */
export async function updateUserAccount(
  updated: Partial<UserAccount> & { accountId: string; newPassword?: string }
): Promise<{ success: boolean; error?: string }> {
  if (!db) {
    return { success: false, error: 'Không thể cập nhật: chưa kết nối được Firebase.' };
  }

  const normalizedId = updated.accountId.trim().toLowerCase();
  const updateData: Record<string, any> = {};

  if (updated.name !== undefined) updateData.name = updated.name.trim();
  if (updated.role !== undefined) updateData.role = updated.role;
  if (updated.isActive !== undefined) updateData.isActive = updated.isActive;
  if (updated.allowedChannels !== undefined) {
    updateData.allowedChannels = updated.allowedChannels.length > 0 ? updated.allowedChannels : [];
  }

  if (updated.newPassword && updated.newPassword.trim().length >= 6) {
    const passHash = await hashPassword(updated.newPassword.trim());
    updateData.passwordHash = passHash;
  } else if (updated.newPassword && updated.newPassword.trim().length > 0 && updated.newPassword.trim().length < 6) {
    return { success: false, error: 'Mật khẩu mới phải có tối thiểu 6 ký tự!' };
  }

  try {
    const cleanUpdate = sanitizeForFirestore(updateData);
    await updateDoc(doc(db, USERS_COLLECTION, normalizedId), cleanUpdate);
  } catch (e) {
    console.error('Firestore update failed:', e);
    return { success: false, error: 'Cập nhật tài khoản lên Firebase thất bại!' };
  }

  const users = await initializeUsersCollection();
  const newList = users.map((u) => (u.accountId.toLowerCase() === normalizedId ? { ...u, ...updateData } : u));
  writeAccountsCache(newList);

  return { success: true };
}

/**
 * Delete or deactivate user account
 */
export async function deleteUserAccount(accountId: string): Promise<{ success: boolean; error?: string }> {
  if (accountId === '3717') {
    return { success: false, error: 'Không thể xóa tài khoản Super Admin (3717) mặc định!' };
  }

  if (!db) {
    return { success: false, error: 'Không thể xóa: chưa kết nối được Firebase.' };
  }

  try {
    await deleteDoc(doc(db, USERS_COLLECTION, accountId));
  } catch (e) {
    console.error('Firestore delete failed:', e);
    return { success: false, error: 'Xóa tài khoản trên Firebase thất bại!' };
  }

  const users = await initializeUsersCollection();
  const newList = users.filter((u) => u.accountId !== accountId);
  writeAccountsCache(newList);

  return { success: true };
}

/**
 * Self-service password change for the current session.
 *
 * - If the account is already on real Firebase Auth (auth.currentUser set),
 *   changes it in place via updatePassword().
 * - If the account is still on the legacy Firestore-hash path (never
 *   migrated — e.g. still on a <6-char legacy password, so the automatic
 *   lazy-migration on login never fired), this call itself performs the
 *   migration: it creates the real Firebase Auth credential using the new
 *   (now-valid, ≥6 char) password. A valid app session (getCurrentSession())
 *   is required either way, standing in for re-entering the old password.
 */
export async function changeOwnPassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
  if (newPassword.length < 6) {
    return { success: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự!' };
  }

  const session = getCurrentSession();
  if (!auth || !session) {
    return { success: false, error: 'Bạn cần đăng nhập lại trước khi đổi mật khẩu.' };
  }

  if (auth.currentUser) {
    try {
      await updatePassword(auth.currentUser, newPassword);
    } catch (e: any) {
      if (e?.code === 'auth/requires-recent-login') {
        return {
          success: false,
          error: 'Phiên đăng nhập đã cũ. Vui lòng đăng xuất, đăng nhập lại, rồi đổi mật khẩu ngay sau đó.',
        };
      }
      console.error('changeOwnPassword failed:', e);
      return { success: false, error: 'Đổi mật khẩu thất bại!' };
    }
  } else {
    // Legacy session, not yet migrated — this call IS the migration.
    try {
      await createUserWithEmailAndPassword(auth, toSyntheticEmail(session.accountId), newPassword);
    } catch (e: any) {
      if (e?.code === 'auth/email-already-in-use') {
        return {
          success: false,
          error: 'Tài khoản này đã có mật khẩu đăng nhập thật. Vui lòng đăng xuất, đăng nhập lại bằng mật khẩu hiện tại, rồi thử đổi lại.',
        };
      }
      console.error('changeOwnPassword (legacy migration) failed:', e);
      return { success: false, error: 'Đổi mật khẩu thất bại!' };
    }
  }

  // Keep the Firestore hash mirror in sync for record-keeping (not used for
  // authentication anymore — real login now goes through Firebase Auth).
  if (db) {
    try {
      const passHash = await hashPassword(newPassword);
      await updateDoc(doc(db, USERS_COLLECTION, session.accountId), { passwordHash: passHash });
    } catch (e) {
      // non-fatal
    }
  }

  return { success: true };
}

// Session Helpers
export function saveSession(user: UserAccount) {
  const safeUser = { ...user };
  delete safeUser.password;
  delete (safeUser as any).passwordHash;
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(safeUser));
}

export function getCurrentSession(): UserAccount | null {
  const data = localStorage.getItem(CURRENT_USER_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

export function logoutUser() {
  localStorage.removeItem(CURRENT_USER_KEY);
  if (auth) {
    signOut(auth).catch(() => {});
  }
}
