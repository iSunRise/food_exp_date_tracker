export function pluralizeDayEn(days: number): string {
  return days === 1 ? "day" : "days";
}

export function pluralizeDayUk(days: number): string {
  const absDays = Math.abs(days);
  const mod10 = absDays % 10;
  const mod100 = absDays % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return "день";
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "дні";
  }

  return "днів";
}
