'use client';
import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthStore } from '../../../../store/authStore';
import toast from 'react-hot-toast';

// This page handles the redirect from Google OAuth callback
export default function GoogleSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setTokenFromGoogle } = useAuthStore();

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      toast.error('Google sign-in failed.');
      router.push('/login');
      return;
    }

    setTokenFromGoogle(token)
      .then(() => router.replace('/dashboard'))
      .catch(() => {
        toast.error('Failed to complete Google sign-in.');
        router.push('/login');
      });
  }, []);

  return (
    <div className="min-h-screen bg-[#0d0d14] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white/60 text-sm">Completing sign-in…</p>
      </div>
    </div>
  );
}