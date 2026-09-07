import { db, auth, getSecondaryAuth } from './firebase';
import { collection, doc, setDoc, getDoc, getDocs, getDocsFromCache, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth';
import { UserAccount } from '../types';
import { idbGet, idbSet, idbDelete } from './indexedDbCache';

const USERS_COLLECTION = 'users';
const CURRENT_USER_KEY = 'tnb_authenticated_user';

/**
 * Tăng số này lên là VÔ HIỆU HOÁ toàn bộ phiên đăng nhập đang tồn tại trên
 * mọi máy, buộc mọi người nhập lại mật khẩu.
 *
 * v2: vá lỗ hổng giả mạo phiên — trước đây chỉ cần ghi tay
 * localStorage['tnb_authenticated_user'] là vào thẳng app với quyền
 * super_admin mà không cần mật khẩu. Mọi phiên tạo ra trước bản vá đều không
 * đáng tin nên phải bị huỷ.
 */
const SESSION_VERSION = 2;
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
  // Cache này chỉ để hiển thị nhanh màn hình Quản lý tài khoản, KHÔNG bao giờ
  // dùng để xác thực. Tuyệt đối không lưu mật khẩu / hash xuống máy: bất kỳ ai
  // mở DevTools trên máy đó đều đọc được, mà hash ở đây là SHA-256 salt cố
  // định nên dò ngược rất nhanh.
  const safe = accounts.map((u) => {
    const clone: any = { ...u };
    delete clone.password;
    delete clone.passwordHash;
    return clone as UserAccount;
  });
  try {
    localStorage.setItem(ACCOUNTS_CACHE_KEY, JSON.stringify(safe));
  } catch (e) {
    // ignore quota / serialization errors — IndexedDB below still gets it
  }
  void idbSet(ACCOUNTS_CACHE_KEY, safe);
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

// KHÔNG đọc mật khẩu seed từ môi trường nữa.
//
// Vite thay `import.meta.env.VITE_*` thành CHUỖI CỐ ĐỊNH ngay lúc build, nên
// mật khẩu Super Admin từng nằm nguyên văn trong file JS công khai trên
// GitHub Pages — ai tải bundle về cũng đọc được. Tệ hơn, nhánh seed bên dưới
// chạy ngay tại trình duyệt: gặp máy chưa có cache là nó tự dựng tài khoản
// 3717 với mật khẩu đó rồi cho đăng nhập thẳng vào quyền super_admin.
//
// Tạo tài khoản quản trị đầu tiên cho một project Firestore trắng là việc làm
// MỘT LẦN bằng tay (Firebase Console: tạo user trong Authentication, rồi tạo
// document users/<accountId> với role 'super_admin'), không phải việc của mã
// chạy trên máy người dùng.


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
/**
 * Danh sách tài khoản cho màn hình "Quản Lý Tài Khoản".
 *
 * CHỈ dùng để hiển thị. Không bao giờ được dùng kết quả của hàm này để quyết
 * định cho ai đăng nhập: firestore.rules chỉ cho Super Admin liệt kê
 * collection `users`, nên với mọi vai trò khác hàm này trả về cache cục bộ —
 * mà cache cục bộ thì người dùng tự sửa được.
 */
export async function initializeUsersCollection(): Promise<UserAccount[]> {
  try {
    if (db) {
      const usersRef = collection(db, USERS_COLLECTION);
      const snapshot = await getDocs(usersRef);
      const users: UserAccount[] = [];
      snapshot.forEach((docSnap) => {
        users.push(docSnap.data() as UserAccount);
      });
      writeAccountsCache(users);
      return users;
    }
  } catch (err) {
    console.warn('Không đọc được danh sách tài khoản từ Firestore (chỉ Super Admin mới có quyền):', err);
  }

  const cachedAccounts = await readAccountsCache();
  return cachedAccounts || [];
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
  let lastAuthErrorCode: string | undefined;

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

    // KHÔNG có hồ sơ thì KHÔNG cho vào (fail closed).
    //
    // Trước đây chỗ này lần lượt: đọc cache cục bộ, rồi nếu vẫn không có thì
    // TỰ BỊA ra một hồ sơ với isActive: true (và role super_admin nếu là
    // 3717). Hai đường đó đều là lỗ hổng:
    //  - Cache cục bộ nằm trong localStorage, ai cũng sửa được.
    //  - Khi Super Admin khoá một tài khoản (isActive: false), firestore.rules
    //    chặn luôn quyền đọc hồ sơ của chính tài khoản đó -> getDoc ném lỗi ->
    //    rơi vào nhánh bịa hồ sơ isActive: true -> TÀI KHOẢN ĐÃ KHOÁ VẪN VÀO
    //    ĐƯỢC. Đúng thứ mà nút "khoá tài khoản" lẽ ra phải chặn.
    // Đã qua được signInWithEmailAndPassword nghĩa là có mạng, nên đọc hồ sơ
    // thất bại gần như luôn là bị rules từ chối, tức tài khoản đã bị khoá.
    if (!profile) {
      await signOut(auth).catch(() => {});
      return {
        success: false,
        error:
          'Không đọc được hồ sơ tài khoản. Tài khoản có thể đã bị khoá — vui lòng liên hệ 21707.',
      };
    }

    if (!profile.isActive) {
      // Đăng xuất khỏi Firebase Auth luôn, nếu không phiên xác thực vẫn sống
      // và tài khoản bị khoá vẫn còn request.auth hợp lệ với Firestore.
      await signOut(auth).catch(() => {});
      return { success: false, error: 'Tài khoản này đã bị khóa! Vui lòng liên hệ 21707.' };
    }

    const updatedUser = { ...profile, lastLogin: new Date().toISOString() };
    saveSession(updatedUser);
    if (db) {
      updateDoc(doc(db, USERS_COLLECTION, normalizedId), { lastLogin: updatedUser.lastLogin }).catch(() => {});
    }
    return { success: true, user: updatedUser };
  } catch (authErr: any) {
    const code = authErr?.code;
    lastAuthErrorCode = code;
    if (code === 'auth/too-many-requests') {
      return { success: false, error: 'Đăng nhập thất bại quá nhiều lần. Vui lòng thử lại sau vài phút!' };
    }
    if (code === 'auth/network-request-failed') {
      return { success: false, error: 'Lỗi kết nối mạng. Vui lòng kiểm tra kết nối WiFi/4G!' };
    }
    // Not yet migrated to Firebase Auth (or the password is genuinely wrong) —
    // fall through to the legacy check, which is the authoritative answer.
  }

  // --- Không còn Path B ---
  //
  // Trước đây, khi Firebase Auth từ chối, code rơi xuống một đường "xác thực
  // legacy" tự so khớp mật khẩu với danh sách tài khoản lấy từ
  // initializeUsersCollection(). Đường đó có ba lỗ hổng nghiêm trọng:
  //
  //  1. Với người chưa đăng nhập, firestore.rules chặn quyền liệt kê
  //     collection `users`, nên initializeUsersCollection() luôn rơi xuống
  //     CACHE CỤC BỘ. Cache đó nằm trong localStorage — kẻ tấn công tự ghi
  //     một tài khoản kèm passwordHash do mình chọn là đăng nhập được.
  //  2. Khi cache rỗng, nó tự seed tài khoản 3717 ngay tại máy khách bằng
  //     VITE_SEED_ADMIN_PASSWORD. Biến này bị Vite nhúng thành chuỗi cố định
  //     trong file JS công khai, nên bất kỳ ai tải bundle về cũng đọc được
  //     mật khẩu đó rồi đăng nhập với quyền super_admin.
  //  3. Nó so sánh cả `matchedUser.password === cleanPass`, tức chấp nhận
  //     mật khẩu lưu dạng văn bản thuần.
  //
  // Giờ Firebase Authentication là nguồn xác thực DUY NHẤT. Tài khoản nào
  // chưa từng có chứng danh Firebase Auth thì Super Admin tạo lại trong màn
  // hình "Quản Lý Tài Khoản" (createUserAccount tạo chứng danh trước, rồi
  // mới ghi hồ sơ) — chứ không tự cấp quyền từ dữ liệu nằm ở máy người dùng.
  const failCode = lastAuthErrorCode;
  if (failCode === 'auth/user-not-found' || failCode === 'auth/invalid-credential') {
    return {
      success: false,
      error: 'Tài khoản hoặc mật khẩu không chính xác!',
    };
  }
  if (failCode === 'auth/user-disabled') {
    return { success: false, error: 'Tài khoản này đã bị khóa! Vui lòng liên hệ 21707.' };
  }
  return { success: false, error: 'Tài khoản hoặc mật khẩu không chính xác!' };
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
    // KHÔNG tự tạo chứng danh Firebase Auth từ accountId đọc ở localStorage.
    //
    // Nhánh cũ gọi createUserWithEmailAndPassword bằng session.accountId lấy
    // từ localStorage — thứ mà người dùng tự sửa được. Kẻ tấn công chỉ cần
    // ghi một phiên giả mang accountId của người khác rồi bấm "Đổi mật khẩu"
    // là ĐẶT ĐƯỢC mật khẩu cho tài khoản đó (miễn là tài khoản đó chưa có
    // chứng danh Firebase Auth), sau đó đăng nhập thật với đúng quyền hạn của
    // nạn nhân. Đổi mật khẩu chỉ được phép trên phiên xác thực THẬT.
    return {
      success: false,
      error: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng xuất và đăng nhập lại bằng mật khẩu hiện tại.',
    };
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
  const safeUser: any = { ...user };
  delete safeUser.password;
  delete safeUser.passwordHash;
  safeUser.sessionVersion = SESSION_VERSION;
  try {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(safeUser));
  } catch (e) {}
  void idbSet(CURRENT_USER_KEY, safeUser);
}

/**
 * Phiên lưu ở máy chỉ là bản sao để vẽ giao diện cho nhanh — KHÔNG phải bằng
 * chứng đăng nhập. Quyền thật luôn phải được xác minh lại bằng
 * verifySession() với Firebase Auth + hồ sơ trên Firestore.
 */
function isSessionShapeValid(data: any): data is UserAccount {
  return Boolean(
    data &&
    typeof data === 'object' &&
    typeof data.accountId === 'string' &&
    data.accountId.trim() &&
    data.sessionVersion === SESSION_VERSION
  );
}

export function getCurrentSession(): UserAccount | null {
  const data = localStorage.getItem(CURRENT_USER_KEY);
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    if (isSessionShapeValid(parsed)) return parsed as UserAccount;
    // Phiên hỏng / thuộc phiên bản cũ / bị giả mạo — dọn luôn thay vì để nằm
    // lại trong máy gây nhầm lẫn khi chẩn đoán.
    clearStoredSession();
    return null;
  } catch (e) {
    clearStoredSession();
    return null;
  }
}

function clearStoredSession() {
  try {
    localStorage.removeItem(CURRENT_USER_KEY);
  } catch (e) {}
  void idbDelete(CURRENT_USER_KEY);
}

export async function getCurrentSessionAsync(): Promise<UserAccount | null> {
  const syncSession = getCurrentSession();
  if (syncSession) return syncSession;
  try {
    const idbSession = await idbGet<UserAccount>(CURRENT_USER_KEY);
    if (idbSession && isSessionShapeValid(idbSession)) {
      try {
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(idbSession));
      } catch (e) {}
      return idbSession;
    }
  } catch (e) {}
  return null;
}

/**
 * Xác minh phiên đang lưu ở máy bằng nguồn đáng tin: chứng danh Firebase Auth
 * + hồ sơ trên Firestore.
 *
 * Vì sao cần: currentUser của App vốn đọc thẳng localStorage. Ai mở DevTools
 * ghi tay một object {accountId:'3717', role:'super_admin'} là vào thẳng app
 * với quyền cao nhất mà không cần mật khẩu. Đây là hàng rào bịt lỗ đó:
 *
 *  - 'rejected'   : không có phiên Firebase Auth thật, hoặc accountId không
 *                   khớp chứng danh, hoặc hồ sơ đã bị khoá/không tồn tại.
 *                   Người gọi phải đăng xuất ngay.
 *  - 'verified'   : hợp lệ. `user` trả về lấy role/allowedChannels TỪ MÁY CHỦ,
 *                   nên kẻ tấn công có sửa role trong localStorage cũng vô ích.
 *  - 'unverified' : có chứng danh thật và đúng accountId, nhưng không đọc
 *                   được hồ sơ (mất mạng). Cho xem dữ liệu đã tải, người gọi
 *                   phải khoá các chức năng ghi / nhạy cảm.
 */
export async function verifySession(
  fbUser: { email: string | null } | null
): Promise<
  | { status: 'rejected'; reason: string }
  | { status: 'verified'; user: UserAccount }
  | { status: 'unverified'; user: UserAccount }
> {
  const session = getCurrentSession();
  if (!session) return { status: 'rejected', reason: 'Chưa đăng nhập.' };

  if (!fbUser || !fbUser.email) {
    return {
      status: 'rejected',
      reason: 'Phiên đăng nhập không hợp lệ hoặc đã hết hiệu lực. Vui lòng đăng nhập lại.',
    };
  }

  const authAccountId = fbUser.email.split('@')[0].toLowerCase();
  if (authAccountId !== session.accountId.trim().toLowerCase()) {
    return {
      status: 'rejected',
      reason: 'Phiên đăng nhập không khớp với tài khoản đã xác thực. Vui lòng đăng nhập lại.',
    };
  }

  if (!db) return { status: 'unverified', user: session };

  try {
    const snap = await withTimeout(
      getDoc(doc(db, USERS_COLLECTION, authAccountId)),
      10000,
      'Quá thời gian đọc hồ sơ tài khoản.'
    );
    if (!snap.exists()) {
      return { status: 'rejected', reason: 'Tài khoản không còn tồn tại. Vui lòng liên hệ 21707.' };
    }
    const profile = snap.data() as UserAccount;
    if (!profile.isActive) {
      return { status: 'rejected', reason: 'Tài khoản này đã bị khóa! Vui lòng liên hệ 21707.' };
    }
    // Quyền hạn LUÔN lấy từ máy chủ, không lấy từ bản sao ở localStorage.
    const verified: UserAccount = {
      ...session,
      name: profile.name ?? session.name,
      role: profile.role,
      allowedChannels: profile.allowedChannels ?? [],
      isActive: true,
    };
    saveSession(verified);
    return { status: 'verified', user: verified };
  } catch (e) {
    // Đọc hồ sơ thất bại — có thể mất mạng, cũng có thể bị rules từ chối vì
    // tài khoản vừa bị khoá. Không thể phân biệt ở client, nên hạ quyền chứ
    // không đá người dùng ra: giữ nguyên dữ liệu đã tải, khoá chức năng ghi.
    console.warn('verifySession: không đọc được hồ sơ tài khoản:', e);
    return { status: 'unverified', user: session };
  }
}

export function logoutUser() {
  try {
    localStorage.removeItem(CURRENT_USER_KEY);
  } catch (e) {}
  void idbDelete(CURRENT_USER_KEY);
  if (auth) {
    signOut(auth).catch(() => {});
  }
}
