import { LogOut, Settings, User as UserIcon, Compass } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';

interface UserMenuProps {
  onReplayTour?: () => void;
  hasTour?: boolean;
}

function initialsFromEmail(email?: string | null) {
  if (!email) return 'U';
  const name = email.split('@')[0];
  const parts = name.split(/[._-]/).filter(Boolean);
  const chars = parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return chars.toUpperCase();
}

export function UserMenu({ onReplayTour, hasTour }: UserMenuProps) {
  const { user, signOut, hasRole, roles } = useAuth();
  const navigate = useNavigate();
  const isDriver = hasRole('driver') && !hasRole('owner') && !hasRole('dispatcher');
  const settingsPath = isDriver ? '/driver-settings' : '/settings';
  const primaryRole = roles?.[0] ?? 'member';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          aria-label="Open account menu"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initialsFromEmail(user?.email)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none truncate">
              {user?.email ?? 'Signed in'}
            </p>
            <p className="text-xs leading-none text-muted-foreground capitalize">
              {primaryRole}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate(settingsPath)}>
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>
        {!isDriver && (
          <DropdownMenuItem onClick={() => navigate('/profile')}>
            <UserIcon className="mr-2 h-4 w-4" />
            Profile
          </DropdownMenuItem>
        )}
        {hasTour && onReplayTour && (
          <DropdownMenuItem onClick={onReplayTour}>
            <Compass className="mr-2 h-4 w-4" />
            Replay welcome tour
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            navigate('/');
          }}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
