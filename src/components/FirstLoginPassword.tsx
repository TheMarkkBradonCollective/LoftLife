import React, { useState } from 'react';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useSession } from '../session';

export const FirstLoginPassword: React.FC = () => {
  const { changePassword, authBusy, authError } = useSession();
  const [password,setPassword] = useState('');
  const [confirm,setConfirm] = useState('');
  const [error,setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (password.length < 10) return setError('Use at least 10 characters.');
    if (password === '1234567890') return setError('Choose a password different from the temporary password.');
    if (password !== confirm) return setError('Your passwords do not match.');
    try { await changePassword(password); } catch { /* session displays the API error */ }
  };
  return <div className="fixed inset-0 z-[250] flex items-center justify-center bg-[#050807] p-4">
    <div className="w-full max-w-md rounded-2xl border border-[#39ff14]/25 bg-[#0c120e] p-6 text-white shadow-2xl">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#39ff14]/10 text-[#39ff14]"><KeyRound size={24}/></div>
      <p className="text-xs font-bold uppercase tracking-[.2em] text-[#39ff14]">Account security</p>
      <h1 className="mt-1 text-2xl font-bold">Set your password</h1>
      <p className="mt-2 text-sm text-slate-400">This is your first sign-in with a temporary password. Create a new password to continue into LoftLife.</p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <label className="block text-xs text-slate-300">New password<input autoComplete="new-password" type="password" minLength={10} required value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none focus:border-[#39ff14]" /></label>
        <label className="block text-xs text-slate-300">Confirm new password<input autoComplete="new-password" type="password" minLength={10} required value={confirm} onChange={e=>setConfirm(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none focus:border-[#39ff14]" /></label>
        {(error || authError) && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-xs text-red-200">{error || authError}</p>}
        <button disabled={authBusy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#39ff14] px-4 py-3 text-sm font-bold text-black disabled:opacity-60">{authBusy?<Loader2 className="animate-spin" size={16}/>:<ShieldCheck size={16}/>}Save password & continue</button>
      </form>
      <p className="mt-4 text-[11px] text-slate-500">Your new password is securely hashed. The temporary password will no longer work.</p>
    </div>
  </div>;
};
