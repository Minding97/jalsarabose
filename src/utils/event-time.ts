const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isValidEventTime(value: string) {
  return TIME_PATTERN.test(value);
}

export function eventTimeToMinutes(value: string) {
  if (!isValidEventTime(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function isValidEventTimeRange(startTime: string, endTime: string) {
  const start = eventTimeToMinutes(startTime);
  const end = eventTimeToMinutes(endTime);
  return start !== null && end !== null && end > start;
}
