'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth-provider';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Building2, Users, Car, LogOut, User, Key, Shield, ArrowRight } from 'lucide-react';

const ADMIN_EMAIL = 'mkaleb@hpvgproperties.com';

const EMAIL_TO_NAME: Record<string, string> = {
  'mkaleb@hpvgproperties.com': 'Matthew Kaleb',
  'mdillon@hpvgproperties.com': 'Michael Dillon',
  'matthew.kaleb1763@gmail.com': 'Matthew Kaleb',
};

export default function Home() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [userFullName, setUserFullName] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      const fetchUserName = async () => {
        if (user.user_metadata?.full_name) {
          setUserFullName(user.user_metadata.full_name);
          return;
        }
        
        if (user.email && EMAIL_TO_NAME[user.email]) {
          setUserFullName(EMAIL_TO_NAME[user.email]);
          return;
        }
        
        if (user.email) {
          const { data } = await supabase
            .from('user_profiles')
            .select('full_name')
            .eq('email', user.email)
            .single();
          
          if (data?.full_name) {
            setUserFullName(data.full_name);
            return;
          }
        }
        
        setUserFullName(user.email?.split('@')[0] || 'User');
      };
      
      fetchUserName();
    }
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/highpoint-logo.png" alt="Highpoint Living" className="h-10 w-auto" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Property Management Hub
                </h1>
                <p className="text-sm text-muted-foreground">
                  Select a module to get started
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <User className="h-4 w-4 mr-2" />
                    {userFullName || 'Account'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push('/settings')}>
                    <Key className="h-4 w-4 mr-2" />
                    Change Password
                  </DropdownMenuItem>
                  {(user?.email === ADMIN_EMAIL || user?.email === 'matthew.kaleb1763@gmail.com') && (
                    <DropdownMenuItem onClick={() => router.push('/admin')}>
                      <Shield className="h-4 w-4 mr-2" />
                      Admin Panel
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Welcome, {userFullName || 'User'}
          </h2>
          <p className="text-muted-foreground">
            Choose a module to manage your properties
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Waitlist Manager Card */}
          <Card 
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02] border-2 hover:border-primary"
            onClick={() => router.push('/waitlist')}
          >
            <CardHeader className="text-center py-12">
              <div className="mx-auto mb-6 w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <Users className="h-10 w-10 text-blue-600 dark:text-blue-400" />
              </div>
              <CardTitle className="text-2xl mb-2">Waitlist Manager</CardTitle>
              <CardDescription className="text-base">
                Manage prospect and transfer waitlists, track leads, and match available units.
              </CardDescription>
              <div className="mt-6">
                <Button variant="outline" className="gap-2">
                  Open Module <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
          </Card>

          {/* Parking Manager Card */}
          <Card 
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02] border-2 hover:border-primary"
            onClick={() => router.push('/parking')}
          >
            <CardHeader className="text-center py-12">
              <div className="mx-auto mb-6 w-20 h-20 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <Car className="h-10 w-10 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-2xl mb-2">Parking Manager</CardTitle>
              <CardDescription className="text-base">
                Track parking inventory, manage assignments, and handle parking waitlists.
              </CardDescription>
              <div className="mt-6">
                <Button variant="outline" className="gap-2">
                  Open Module <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
          </Card>
        </div>
      </main>

      <footer className="mt-8 py-4 border-t bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-muted-foreground">
          Property Management Hub • Highpoint Living
        </div>
      </footer>
    </div>
  );
}
