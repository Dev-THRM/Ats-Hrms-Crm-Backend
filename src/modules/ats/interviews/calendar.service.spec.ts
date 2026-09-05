import { describe, it, expect, beforeEach } from 'vitest';
import { CalendarService } from './calendar.service.js';

describe('CalendarService', () => {
  let service: CalendarService;

  beforeEach(() => {
    service = new CalendarService();
  });

  it('should generate a valid Google Meet link format', () => {
    const meetUrl = service.generateGoogleMeetLink();
    expect(meetUrl).toMatch(/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
  });

  it('should generate deterministic Google Meet link when seed is provided', () => {
    const seed = 'application-uuid-12345';
    const link1 = service.generateGoogleMeetLink(seed);
    const link2 = service.generateGoogleMeetLink(seed);
    expect(link1).toBe(link2);
    expect(link1).toMatch(/^https:\/\/meet\.google\.com\//);
  });

  it('should generate 1-click Google Calendar web link with proper parameters', () => {
    const now = new Date('2026-10-15T14:00:00Z');
    const calUrl = service.generateGoogleCalendarWebLink({
      title: 'Technical Interview - Carlos Silva',
      description: 'Senior Backend Engineer interview',
      start: now,
      durationMinutes: 60,
      meetingLink: 'https://meet.google.com/abc-defg-hij',
    });

    expect(calUrl).toContain('https://calendar.google.com/calendar/render');
    expect(calUrl).toContain('action=TEMPLATE');
    expect(calUrl).toContain('Technical+Interview');
    expect(calUrl).toContain('Google+Meet');
  });

  it('should generate valid iCalendar RFC 5545 string', () => {
    const now = new Date('2026-10-15T14:00:00Z');
    const ics = service.generateIcsInvite(
      {
        title: 'System Design Interview',
        description: 'Scalable cloud architectures discussion',
        start: now,
        durationMinutes: 45,
        meetingLink: 'https://meet.google.com/xyz-uvwx-rst',
      },
      'event-uid-999',
    );

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:System Design Interview');
    expect(ics).toContain('LOCATION:https://meet.google.com/xyz-uvwx-rst');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });
});
