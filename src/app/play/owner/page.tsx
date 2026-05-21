'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type OwnerUser = {
  id: string;
  username: string;
  email: string;
  isOwner: boolean;
  createdAt: string;
};

export default function OwnerPanelPage() {
  const [users, setUsers] = useState<OwnerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadUsers() {
    setLoading(true);
    setError('');
    const res = await fetch('/api/owner/users');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error || 'Failed to load users.');
      setLoading(false);
      return;
    }
    setUsers(Array.isArray(data?.users) ? data.users : []);
    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function toggleOwner(user: OwnerUser) {
    const res = await fetch(`/api/owner/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isOwner: !user.isOwner }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error || 'Failed to update owner status.');
      return;
    }
    setUsers((prev) => prev.map((item) => (item.id === user.id ? data.user : item)));
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-yellow-300">👑 Owner Panel</h1>
          <Link href="/" className="text-yellow-300 hover:text-yellow-200 font-bold">← Main Menu</Link>
        </div>
        {error && <div className="bg-red-950 border border-red-700 rounded-lg p-3 text-red-300">{error}</div>}
        {loading ? (
          <div className="bg-gray-800 rounded-xl p-6 text-gray-300">Loading users…</div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 text-gray-300">
                <tr>
                  <th className="text-left p-3">Username</th>
                  <th className="text-left p-3">Email</th>
                  <th className="text-left p-3">Owner</th>
                  <th className="text-left p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-gray-800">
                    <td className="p-3">{user.username}</td>
                    <td className="p-3 text-gray-400">{user.email}</td>
                    <td className="p-3">{user.isOwner ? 'Yes' : 'No'}</td>
                    <td className="p-3">
                      <button
                        onClick={() => toggleOwner(user)}
                        className="bg-indigo-700 hover:bg-indigo-600 px-3 py-1.5 rounded"
                      >
                        Toggle Owner
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
