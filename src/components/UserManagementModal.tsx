import React, { useState, useEffect } from 'react';
import { UserAccount, UserRole } from '../types';
import {
  initializeUsersCollection,
  getUsersFromCache,
  createUserAccount,
  updateUserAccount,
  deleteUserAccount
} from '../services/authService';
import { X, UserPlus, Shield, Key, Trash2, Check, RefreshCw, UserCheck } from 'lucide-react';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Distinguishes "never loaded yet, nothing to show" (skeleton) from a
  // background refresh (keep showing whatever's already there) and from a
  // genuinely empty result — "Tổng số tài khoản: 0" used to be indistinguishable
  // from "still loading, give it a second", which on a slow connection reads
  // as the screen being broken/stuck.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New account form state
  const [newAccountId, setNewAccountId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('editor');

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      // Instant paint from Firestore's own local cache (if this device has
      // opened this screen before) — a local IndexedDB read, not a network
      // call — while the authoritative network read below is still in
      // flight. Skipped entirely on a first-ever open (cache empty), which
      // is exactly when the loading skeleton below matters most.
      const cached = await getUsersFromCache();
      if (cached.length > 0) setUsers(cached);

      const data = await initializeUsersCollection();
      setUsers(data);
    } catch (e) {
      // ignore
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountId || !newPassword || !newName) {
      setMsg({ type: 'error', text: 'Vui lòng nhập đầy đủ thông tin!' });
      return;
    }

    const result = await createUserAccount(
      {
        accountId: newAccountId.trim(),
        password: newPassword.trim(),
        name: newName.trim(),
        role: newRole,
        isActive: true,
      },
      currentUser.accountId
    );

    if (result.success) {
      setMsg({ type: 'success', text: `Đã cấp tài khoản ${newAccountId} thành công!` });
      setNewAccountId('');
      setNewPassword('');
      setNewName('');
      setShowAddForm(false);
      loadUsers();
    } else {
      setMsg({ type: 'error', text: result.error || 'Tạo tài khoản thất bại!' });
    }
  };

  const handleToggleActive = async (account: UserAccount) => {
    if (account.accountId === '3717') return;
    const res = await updateUserAccount({ accountId: account.accountId, isActive: !account.isActive });
    if (!res.success) {
      setMsg({ type: 'error', text: res.error || 'Cập nhật trạng thái thất bại!' });
      return;
    }
    loadUsers();
  };

  const handleDelete = async (accountId: string) => {
    if (confirm(`Bạn có chắc chắn muốn xóa tài khoản ${accountId}?`)) {
      const res = await deleteUserAccount(accountId);
      if (res.success) {
        setMsg({ type: 'success', text: `Đã xóa tài khoản ${accountId}` });
        loadUsers();
      } else {
        setMsg({ type: 'error', text: res.error || 'Không thể xóa tài khoản!' });
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-extrabold">
              <Shield className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">QUẢN LÝ TÀI KHOẢN HỆ THỐNG</h2>
              <p className="text-xs font-semibold text-slate-400">
                Quyền Super Admin ({currentUser.accountId}) - Cấp &amp; phân quyền người dùng
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Action Bar */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="text-xs font-bold text-slate-700">
              Tổng số tài khoản:{' '}
              <strong className="text-blue-600 font-extrabold">
                {isLoading && !hasLoadedOnce ? '...' : users.length}
              </strong>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadUsers}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1 transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                Làm mới
              </button>
              <button
                onClick={() => setShowAddForm((prev) => !prev)}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                {showAddForm ? 'Hủy thêm' : 'Cấp tài khoản mới'}
              </button>
            </div>
          </div>

          {/* Feedback Message */}
          {msg && (
            <div
              className={`p-3 rounded-2xl text-xs font-bold flex items-center justify-between ${
                msg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              <span>{msg.text}</span>
              <button onClick={() => setMsg(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
          )}

          {/* Add Form Collapsible */}
          {showAddForm && (
            <form onSubmit={handleCreateUser} className="p-4 bg-slate-50 border border-blue-200 rounded-2xl space-y-3 animate-in zoom-in-95 duration-100">
              <h3 className="text-xs font-extrabold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-blue-600" />
                THÔNG TIN TÀI KHOẢN MỚI
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Mã tài khoản (ID)</label>
                  <input
                    type="text"
                    required
                    value={newAccountId}
                    onChange={(e) => setNewAccountId(e.target.value)}
                    placeholder="vd: 62790..."
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Mật khẩu (tối thiểu 6 ký tự)</label>
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Tối thiểu 6 ký tự..."
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Tên người sử dụng</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="vd: Boss Khai..."
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Quyền hạn</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="super_admin">Super Admin</option>
                    <option value="admin">Quản trị viên (Admin)</option>
                    <option value="editor">Biên tập viên (Editor)</option>
                    <option value="viewer">Xem báo cáo (Viewer)</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer"
                >
                  Lưu &amp; Cấp Tài Khoản
                </button>
              </div>
            </form>
          )}

          {/* User Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-extrabold uppercase text-[10.5px]">
                  <th className="p-3">TÀI KHOẢN (ID)</th>
                  <th className="p-3">HỌ &amp; TÊN</th>
                  <th className="p-3">MẬT KHẨU</th>
                  <th className="p-3">VAI TRÒ</th>
                  <th className="p-3 text-center">TRẠNG THÁI</th>
                  <th className="p-3 text-right">THAO TÁC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white font-medium text-slate-800">
                {isLoading && !hasLoadedOnce && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400 font-semibold">
                      <RefreshCw className="w-4 h-4 inline-block mr-1.5 animate-spin align-[-2px]" />
                      Đang tải danh sách tài khoản...
                    </td>
                  </tr>
                )}
                {!isLoading && hasLoadedOnce && users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400 font-semibold">
                      Chưa có tài khoản nào.
                    </td>
                  </tr>
                )}
                {users.map((user) => (
                  <tr key={user.accountId} className="hover:bg-slate-50">
                    <td className="p-3 font-extrabold text-blue-900">
                      {user.accountId}
                      {user.accountId === '3717' && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-black">
                          SUPER
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-bold">{user.name}</td>
                    <td className="p-3 font-mono text-slate-500">••••••••</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-extrabold uppercase ${
                        user.role === 'super_admin' ? 'bg-purple-100 text-purple-900' :
                        user.role === 'admin' ? 'bg-blue-100 text-blue-900' :
                        user.role === 'editor' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleToggleActive(user)}
                        disabled={user.accountId === '3717'}
                        className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold cursor-pointer transition-all ${
                          user.isActive ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-red-100 text-red-800 hover:bg-red-200'
                        }`}
                      >
                        {user.isActive ? 'Hoạt động' : 'Tạm khóa'}
                      </button>
                    </td>
                    <td className="p-3 text-right">
                      {user.accountId !== '3717' && (
                        <button
                          onClick={() => handleDelete(user.accountId)}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Xóa tài khoản"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
