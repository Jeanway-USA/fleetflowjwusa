import { format, differenceInDays, differenceInHours, isToday, isYesterday, parseISO } from 'date-fns';

interface RelativeTimestampProps {
  date: string | null;
  time?: string | null;
  prefix?: string;
  className?: string;
}

export function getRelativeTimestamp(date: string | null, time?: string | null): string {
  if (!date) return 'Unknown';

  // Parse the date
  let parsedDate = parseISO(date + 'T00:00:00');
  
  // If we have a time, try to parse and use it
  if (time) {
    const timeParts = time.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
    if (timeParts) {
      let hours = parseInt(timeParts[1]);
      const minutes = timeParts[2] ? parseInt(timeParts[2]) : 0;
      const meridiem = timeParts[3]?.toUpperCase();
      
      if (meridiem === 'PM' && hours !== 12) hours += 12;
      if (meridiem === 'AM' && hours === 12) hours = 0;
      
      parsedDate = new Date(parsedDate);
      parsedDate.setHours(hours, minutes, 0, 0);
    }
  }

  const now = new Date();
  const daysDiff = differenceInDays(now, parsedDate);
  const hoursDiff = differenceInHours(now, parsedDate);

  // Format the time portion if available
  const timeString = time ? ` ${format(parsedDate, 'h:mm a')}` : '';

  if (isToday(parsedDate)) {
    if (hoursDiff < 1) {
      return 'Just now';
    }
    return `Today${timeString}`;
  }

  if (isYesterday(parsedDate)) {
    return `Yesterday${timeString}`;
  }

  if (daysDiff < 7) {
    return `${daysDiff} day${daysDiff === 1 ? '' : 's'} ago`;
  }

  if (daysDiff < 30) {
    const weeks = Math.floor(daysDiff / 7);
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  }

  // For older dates, show the actual date
  return format(parsedDate, 'MMM d, yyyy');
}

export function RelativeTimestamp({ date, time, prefix = '', className = '' }: RelativeTimestampProps) {
  const relativeTime = getRelativeTimestamp(date, time);
  
  return (
    <span className={className}>
      {prefix && `${prefix} `}{relativeTime}
    </span>
  );
}
