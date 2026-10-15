interface CycleConfig { interval?: number | string | null; unit?: string | null; day_of_week?: number | string | null; reminder_mail?: number | boolean | string | null }
const WEEKDAY_NAMES_DE: Record<number, string> = {
  1: 'Montag',
  2: 'Dienstag',
  3: 'Mittwoch',
  4: 'Donnerstag',
  5: 'Freitag',
  6: 'Samstag',
  7: 'Sonntag',
};

const WEEKDAY_SHORT_DE: Record<number, string> = {
  1: 'Mo.',
  2: 'Di.',
  3: 'Mi.',
  4: 'Do.',
  5: 'Fr.',
  6: 'Sa.',
  7: 'So.',
};

const WEEKDAY_NAMES_EN: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

const WEEKDAY_SHORT_EN: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

export const WEEKDAY_NAMES = WEEKDAY_NAMES_DE;
export const WEEKDAY_SHORT = WEEKDAY_SHORT_DE;

/**
 * Wandelt ein Javascript Date in den ISO-Wochentag (1 = Montag, ..., 7 = Sonntag) um.
 */
export function getIsoDay(date: Date) {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

/**
 * Berechnet den Status und das nächste Fälligkeitsdatum für einen Pflege- oder Messzyklus.
 *
 * @param {Object} cycleConfig - { interval, unit, day_of_week, reminder_mail }
 * @param {string|Date|null} lastActionDate - Datum der letzten Durchführung
 * @param {string|Date|null} fallbackDate - Fallback-Datum (z. B. Erstellungsdatum des Aquariums)
 * @param {Date} [nowDate] - Aktueller Zeitpunkt (für Tests injizierbar)
 * @param {string} [lang] - Sprache ('de' oder 'en')
 */
export function calculateCycleStatus(cycleConfig: CycleConfig = {}, lastActionDate: string | Date | null = null, fallbackDate: string | Date | null = null, nowDate: Date = new Date(), lang: string = 'de') {
  const isEn = String(lang).toLowerCase().startsWith('en');
  const weekdayNames = isEn ? WEEKDAY_NAMES_EN : WEEKDAY_NAMES_DE;
  const weekdayShort = isEn ? WEEKDAY_SHORT_EN : WEEKDAY_SHORT_DE;

  const interval = cycleConfig.interval != null && cycleConfig.interval !== '' ? Number(cycleConfig.interval) : null;
  const unit = cycleConfig.unit === 'weeks' ? 'weeks' : 'days';
  let dayOfWeek = cycleConfig.day_of_week != null && cycleConfig.day_of_week !== '' ? Number(cycleConfig.day_of_week) : null;
  if (dayOfWeek != null && (dayOfWeek < 1 || dayOfWeek > 7 || !Number.isInteger(dayOfWeek))) {
    dayOfWeek = null;
  }
  const reminderMail = Boolean(cycleConfig.reminder_mail);

  if (!interval || interval <= 0 || !Number.isFinite(interval)) {
    return {
      configured: false,
      interval: null,
      unit,
      day_of_week: dayOfWeek,
      day_of_week_label: dayOfWeek ? weekdayNames[dayOfWeek] : null,
      day_of_week_short: dayOfWeek ? weekdayShort[dayOfWeek] : null,
      reminder_mail: reminderMail,
      last_action_at: lastActionDate ? new Date(lastActionDate).toISOString() : null,
      next_due_at: null,
      is_due: false,
      is_overdue: false,
      days_remaining: null,
      days_overdue: 0,
      cycle_label: isEn ? 'No cycle configured' : 'Kein Zyklus festgelegt',
      status_label: isEn ? 'Not configured' : 'Nicht konfiguriert',
    };
  }

  // Bestimme Referenzdatum (nur Datumsteil ohne Uhrzeit für faire Tagesvergleiche)
  const now = new Date(nowDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let baseDate;
  if (lastActionDate) {
    const d = new Date(lastActionDate);
    baseDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  } else if (fallbackDate) {
    const d = new Date(fallbackDate);
    baseDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  } else {
    baseDate = new Date(today);
  }

  let nextDue;

  if (unit === 'days') {
    nextDue = new Date(baseDate);
    nextDue.setDate(nextDue.getDate() + interval);
    if (dayOfWeek != null) {
      while (getIsoDay(nextDue) !== dayOfWeek) {
        nextDue.setDate(nextDue.getDate() + 1);
      }
    }
  } else {
    // unit === 'weeks'
    if (dayOfWeek != null) {
      const baseIso = getIsoDay(baseDate);
      const dayDiff = dayOfWeek - baseIso;
      const targetInBaseWeek = new Date(baseDate);
      targetInBaseWeek.setDate(targetInBaseWeek.getDate() + dayDiff);

      nextDue = new Date(targetInBaseWeek);
      nextDue.setDate(nextDue.getDate() + interval * 7);

      // Falls das Ziel vor oder auf dem baseDate liegt, mindestens um das Intervall vorschieben
      while (nextDue <= baseDate) {
        nextDue.setDate(nextDue.getDate() + interval * 7);
      }
    } else {
      nextDue = new Date(baseDate);
      nextDue.setDate(nextDue.getDate() + interval * 7);
    }
  }

  const diffMs = nextDue.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (24 * 3600 * 1000));

  const isDue = diffDays <= 0;
  const isOverdue = diffDays < 0;
  const daysOverdue = isOverdue ? Math.abs(diffDays) : (diffDays === 0 ? 0 : 0);
  const daysRemaining = diffDays > 0 ? diffDays : 0;

  let statusLabel;
  if (isEn) {
    if (diffDays === 0) {
      statusLabel = 'Due today';
    } else if (diffDays === 1) {
      statusLabel = 'Due tomorrow';
    } else if (diffDays > 1) {
      statusLabel = `Due in ${diffDays} days`;
    } else if (diffDays === -1) {
      statusLabel = 'Overdue since yesterday (1 day)';
    } else {
      statusLabel = `Overdue since ${Math.abs(diffDays)} days`;
    }
  } else {
    if (diffDays === 0) {
      statusLabel = 'Fällig heute';
    } else if (diffDays === 1) {
      statusLabel = 'Fällig morgen';
    } else if (diffDays > 1) {
      statusLabel = `Fällig in ${diffDays} Tagen`;
    } else if (diffDays === -1) {
      statusLabel = 'Überfällig seit gestern (1 Tag)';
    } else {
      statusLabel = `Überfällig seit ${Math.abs(diffDays)} Tagen`;
    }
  }

  const dayLabel = dayOfWeek ? ` (${weekdayNames[dayOfWeek]})` : '';
  let cycleLabel;
  if (isEn) {
    if (unit === 'days') {
      cycleLabel = interval === 1 ? `Daily${dayLabel}` : `Every ${interval} days${dayLabel}`;
    } else {
      cycleLabel = interval === 1 ? `Weekly${dayLabel}` : `Every ${interval} weeks${dayLabel}`;
    }
  } else {
    if (unit === 'days') {
      cycleLabel = interval === 1 ? `Täglich${dayLabel}` : `Alle ${interval} Tage${dayLabel}`;
    } else {
      cycleLabel = interval === 1 ? `Wöchentlich${dayLabel}` : `Alle ${interval} Wochen${dayLabel}`;
    }
  }

  return {
    configured: true,
    interval,
    unit,
    day_of_week: dayOfWeek,
    day_of_week_label: dayOfWeek ? weekdayNames[dayOfWeek] : null,
    day_of_week_short: dayOfWeek ? weekdayShort[dayOfWeek] : null,
    reminder_mail: reminderMail,
    last_action_at: lastActionDate ? new Date(lastActionDate).toISOString() : null,
    next_due_at: nextDue.toISOString(),
    is_due: isDue,
    is_overdue: isOverdue,
    days_remaining: daysRemaining,
    days_overdue: daysOverdue,
    cycle_label: cycleLabel,
    status_label: statusLabel,
  };
}

