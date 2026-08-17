import React, { useState, useEffect } from 'react';
import { UserAccount, UserRole, Channel } from '../types';
import {
  initializeUsersCollection,
  getUsersFromCache,
  createUserAccount,
  updateUserAccount,
  deleteUserAccount,
} from '../services/authService';
import { X, UserPlus, Shield, Trash2, Check, RefreshCw, Edit2, Save, Radio } from 'lucide-react';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
}

const AVAILABLE_CHANNELS: { id: Channel | string; label: string }[] = [
  { id: 'DML', label: 'ĐML' },
  { id: 'DMM', label: 'ĐMM' },
  { id: 'DMS', label: 'ĐMS' },
  { id: 'TGD', label: 'TGD' },
  { id: 'TopZone', label: 'TopZone' },
  { id: 'LƯU ĐỘNG', label: 'Lưu Động' },
];

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New account form state
  const [newAccountId, setNewAccountId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('editor');
  const [newAllowedChannels, setNewAllowedChannels] = useState<string[]>([]); // empty = ALL

  // Edit account form state
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('editor');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editNewPassword, setEditNewPassword] = useState('');
  const [editAllowedChannels, setEditAllowedChannels] = useState<string[]>([]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const cached = await getUsersFromCache();
      if (cached.length > 0) setUsers(cached);

      const data = await initializeUsersCollection();
      setUsers(data);
    } catch (e) {
      console.error('Failed to load users:', e);
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      setShowAddForm(false);
      setEditingUser(null);
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
        allowedChannels: newAllowedChannels.length > 0 ? (newAllowedChannels as Channel[]) : [],
        isActive: true,
      },
      currentUser.accountId
    );

    if (result.success) {
      setMsg({ type: 'success', text: `Đã cấp tài khoản ${newAccountId} thành công!` });
      setNewAccountId('');
      setNewPassword('');
      setNewName('');
      setNewAllowedChannels([]);
      setShowAddForm(false);
      loadUsers();
    } else {
      setMsg({ type: 'error', text: result.error || 'Tạo tài khoản thất bại!' });
    }
  };

  const startEditUser = (user: UserAccount) => {
    setEditingUser(user);
    setEditName(user.name || '');
    setEditRole(user.role || 'editor');
    setEditIsActive(user.isActive !== false);
    setEditNewPassword('');
    setEditAllowedChannels(user.allowedChannels ? [...user.allowedChannels] : []);
    setShowAddForm(false);
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!editName.trim()) {
      setMsg({ type: 'error', text: 'Tên người dùng không được để trống!' });
      return;
    }

    const res = await updateUserAccount({
      accountId: editingUser.accountId,
      name: editName.trim(),
      role: editRole,
      isActive: editIsActive,
      allowedChannels: editAllowedChannels.length > 0 ? (editAllowedChannels as Channel[]) : [],
      newPassword: editNewPassword.trim() || undefined,
    });

    if (res.success) {
      setMsg({ type: 'success', text: `Cập nhật tài khoản ${editingUser.accountId} thành công!` });
      setEditingUser(null);
      loadUsers();
    } else {
      setMsg({ type: 'error', text: res.error || 'Cập nhật tài khoản thất bại!' });
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
        if (editingUser?.accountId === accountId) setEditingUser(null);
        loadUsers();
      } else {
        setMsg({ type: 'error', text: res.error || 'Không thể xóa tài khoản!' });
      }
    }
  };

  // Helper toggle channel checkbox
  const toggleChannelList = (
    channelId: string,
    currentList: string[],
    setList: (val: string[]) => void
  ) => {
    if (currentList.includes(channelId)) {
      setList(currentList.filter((c) => c !== channelId));
    } else {
      setList([...currentList, channelId]);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-extrabold shadow-sm">
              <Shield className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight">
                QUẢN LÝ TÀI KHOẢN HỆ THỐNG
              </h2>
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
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Action Bar */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
            <div className="text-xs font-bold text-slate-700">
              Tổng số tài khoản:{' '}
              <strong className="text-blue-600 font-extrabold text-sm">
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
                onClick={() => {
                  setShowAddForm((prev) => !prev);
                  setEditingUser(null);
                }}
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
                msg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              <span>{msg.text}</span>
              <button onClick={() => setMsg(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                ✕
              </button>
            </div>
          )}

          {/* Add Form Collapsible */}
          {showAddForm && (
            <form
              onSubmit={handleCreateUser}
              className="p-4 bg-slate-50 border border-blue-200 rounded-2xl space-y-3.5 animate-in zoom-in-95 duration-100"
            >
              <h3 className="text-xs font-extrabold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-blue-600" />
                THÔNG TIN CẤP TÀI KHOẢN MỚI
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Mã tài khoản (ID)
                  </label>
                  <input
                    type="text"
                    required
                    value={newAccountId}
                    onChange={(e) => setNewAccountId(e.target.value)}
                    placeholder="vd: 62790, leader..."
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Mật khẩu (tối thiểu 6 ký tự)
                  </label>
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
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Tên người sử dụng
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="vd: Boss Khải, Quản Lý..."
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

              {/* Phân quyền xem dữ liệu theo kênh */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wide">
                    Quyền xem dữ liệu theo Kênh:
                  </span>
                  <button
                    type="button"
                    onClick={() => setNewAllowedChannels([])}
                    className={`text-[11px] font-bold px-2 py-0.5 rounded cursor-pointer ${
                      newAllowedChannels.length === 0
                        ? 'bg-blue-100 text-blue-800'
                        : 'text-slate-500 hover:text-blue-600'
                    }`}
                  >
                    Xem tất cả kênh (Mặc định)
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {AVAILABLE_CHANNELS.map((ch) => {
                    const isChecked = newAllowedChannels.includes(ch.id);
                    return (
                      <label
                        key={ch.id}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-indigo-50 border-indigo-400 text-indigo-900 shadow-2xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() =>
                            toggleChannelList(ch.id, newAllowedChannels, setNewAllowedChannels)
                          }
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                        />
                        {ch.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1"
                >
                  <Save className="w-3.5 h-3.5" />
                  Lưu &amp; Cấp Tài Khoản
                </button>
              </div>
            </form>
          )}

          {/* Edit Form Modal/Panel */}
          {editingUser && (
            <form
              onSubmit={handleSaveEditUser}
              className="p-4 bg-amber-50/70 border-2 border-amber-300 rounded-2xl space-y-3.5 animate-in zoom-in-95 duration-100"
            >
              <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                <h3 className="text-xs font-extrabold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Edit2 className="w-4 h-4 text-amber-700" />
                  CHỈNH SỬA TÀI KHOẢN: <span className="font-mono text-blue-700">{editingUser.accountId}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="text-amber-800 hover:text-amber-950 text-xs font-bold cursor-pointer"
                >
                  ✕ Đóng sửa
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Mã tài khoản (ID)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={editingUser.accountId}
                    className="w-full p-2 bg-slate-200/80 border border-slate-300 rounded-xl text-xs font-bold text-slate-500 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Tên người sử dụng
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="vd: Boss Khải, Quản Lý..."
                    className="w-full p-2 bg-white border border-amber-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Mật khẩu mới (tùy chọn)
                  </label>
                  <input
                    type="text"
                    minLength={6}
                    value={editNewPassword}
                    onChange={(e) => setEditNewPassword(e.target.value)}
                    placeholder="Để trống nếu không đổi..."
                    className="w-full p-2 bg-white border border-amber-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Quyền hạn</label>
                  <select
                    value={editRole}
                    disabled={editingUser.accountId === '3717'}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full p-2 bg-white border border-amber-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="super_admin">Super Admin</option>
                    <option value="admin">Quản trị viên (Admin)</option>
                    <option value="editor">Biên tập viên (Editor)</option>
                    <option value="viewer">Xem báo cáo (Viewer)</option>
                  </select>
                </div>
              </div>

              {/* Phân quyền xem dữ liệu theo kênh trong Edit Form */}
              <div className="bg-white p-3 rounded-xl border border-amber-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wide">
                    Quyền xem dữ liệu theo Kênh:
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditAllowedChannels([])}
                    className={`text-[11px] font-bold px-2 py-0.5 rounded cursor-pointer ${
                      editAllowedChannels.length === 0
                        ? 'bg-amber-100 text-amber-900 font-extrabold'
                        : 'text-slate-500 hover:text-amber-700'
                    }`}
                  >
                    Xem tất cả kênh (Mặc định)
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {AVAILABLE_CHANNELS.map((ch) => {
                    const isChecked = editAllowedChannels.includes(ch.id);
                    return (
                      <label
                        key={ch.id}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-amber-100 border-amber-400 text-amber-950 shadow-2xs font-extrabold'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() =>
                            toggleChannelList(ch.id, editAllowedChannels, setEditAllowedChannels)
                          }
                          className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                        />
                        {ch.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editIsActive}
                      disabled={editingUser.accountId === '3717'}
                      onChange={(e) => setEditIsActive(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <span>Tài khoản đang hoạt động</span>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Lưu Thay Đổi
                  </button>
                </div>
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
                  <th className="p-3">VAI TRÒ / QUYỀN KÊNH</th>
                  <th className="p-3 text-center">TRẠNG THÁI</th>
                  <th className="p-3 text-center">THAO TÁC</th>
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
                  <tr
                    key={user.accountId}
                    className={`hover:bg-slate-50 transition-colors ${
                      editingUser?.accountId === user.accountId ? 'bg-amber-50/50' : ''
                    }`}
                  >
                    {/* ID */}
                    <td className="p-3 font-extrabold text-blue-900">
                      {user.accountId}
                      {user.accountId === '3717' && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-black">
                          SUPER
                        </span>
                      )}
                    </td>

                    {/* Họ & Tên */}
                    <td className="p-3 font-bold">{user.name}</td>

                    {/* Mật khẩu */}
                    <td className="p-3 font-mono text-slate-500">••••••••</td>

                    {/* Vai trò & Quyền Kênh */}
                    <td className="p-3">
                      <div className="space-y-1">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase inline-block ${
                            user.role === 'super_admin'
                              ? 'bg-purple-100 text-purple-900'
                              : user.role === 'admin'
                              ? 'bg-blue-100 text-blue-900'
                              : user.role === 'editor'
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {user.role}
                        </span>
                        {user.allowedChannels && user.allowedChannels.length > 0 ? (
                          <span
                            className="text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded font-black border border-amber-200 block max-w-[170px] truncate"
                            title={`Được xem: ${user.allowedChannels.join(', ')}`}
                          >
                            Kênh: {user.allowedChannels.join(', ')}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-semibold block">
                            Tất cả kênh
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Trạng thái */}
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleToggleActive(user)}
                        disabled={user.accountId === '3717'}
                        className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold cursor-pointer transition-all ${
                          user.isActive
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-red-100 text-red-800 hover:bg-red-200'
                        }`}
                      >
                        {user.isActive ? 'Hoạt động' : 'Tạm khóa'}
                      </button>
                    </td>

                    {/* Thao tác (Sửa + Xóa) */}
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {/* Nút Sửa */}
                        <button
                          onClick={() => startEditUser(user)}
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-blue-200"
                          title="Chỉnh sửa tài khoản"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        {/* Nút Xóa */}
                        {user.accountId !== '3717' && (
                          <button
                            onClick={() => handleDelete(user.accountId)}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-red-200"
                            title="Xóa tài khoản"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
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
