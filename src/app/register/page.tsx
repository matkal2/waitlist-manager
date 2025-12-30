'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Loader2 } from 'lucide-react';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteId = searchParams.get('invite');
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ email: string; full_name: string } | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!inviteId) {
      setError('Invalid invite link. Please request a new invite from your administrator.');
      setLoading(false);
      return;
    }

    validateInvite();
  }, [inviteId]);

  const validateInvite = async () => {
    try {
      const { data, error } = await supabase
        .from('user_invites')
        .select('*')
        .eq('id', inviteId)
        .single();

      if (error || !data) {
        setError('Invalid invite link. Please request a new invite from your administrator.');
        return;
      }

      if (data.used) {
        setError('This invite has already been used. Please request a new invite.');
        return;
      }

      if (new Date(data.expires_at) < new Date()) {
        setError('This invite has expired. Please request a new invite from your administrator.');
        return;
      }

      setInvite({ email: data.email, full_name: data.full_name });
    } catch (err) {
      console.error('Error validating invite:', err);
      setError('Failed to validate invite. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Create Supabase auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: invite!.email,
        password: password,
        options: {
          data: {
            full_name: invite!.full_name,
          },
        },
      });

      if (authError) throw authError;

      // Create user profile
      if (authData.user) {
        await supabase.from('user_profiles').insert({
          id: authData.user.id,
          email: invite!.email,
          full_name: invite!.full_name,
          is_admin: false,
        });

        // Mark invite as used
        await supabase
          .from('user_invites')
          .update({ used: true })
          .eq('id', inviteId);
      }

      alert('Account created successfully! You can now log in.');
      router.push('/login');
    } catch (err: any) {
      console.error('Error creating account:', err);
      setError(err.message || 'Failed to create account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Validating invite...</span>
        </div>
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Building2 className="h-12 w-12 mx-auto text-primary mb-2" />
            <CardTitle>Invalid Invite</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-red-600 mb-4">{error}</p>
            <Button onClick={() => router.push('/login')} className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Building2 className="h-12 w-12 mx-auto text-primary mb-2" />
          <CardTitle>Create Your Account</CardTitle>
          <CardDescription>
            Welcome, {invite?.full_name}! Set up your password to complete registration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={invite?.email || ''} disabled className="bg-gray-100" />
            </div>
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={invite?.full_name || ''} disabled className="bg-gray-100" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password (min 6 characters)"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating Account...
                </>
              ) : (
                'Create Account'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    }>
      <RegisterForm />
    </Suspense>
  );
}
