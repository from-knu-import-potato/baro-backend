const KST_OFFSET_MS = 9 * 60 * 60 * 1000

export function toKSTDateStr(utcDate: Date): string {
  const kst = new Date(utcDate.getTime() + KST_OFFSET_MS)
  return kst.toISOString().slice(0, 10)
}

export function getKSTDateRange(dateStr: string): { start: Date; end: Date } {
  const [yy, mm, dd] = dateStr.split('-').map(Number)
  const startUTC = new Date(Date.UTC(yy, mm - 1, dd) - KST_OFFSET_MS)
  return { start: startUTC, end: new Date(startUTC.getTime() + 86400000) }
}

// 자정~오전 6시(KST) → 어제, 그 외 → 오늘
export function getAutoClosingDateStr(): string {
  const nowUTC = new Date()
  const kstHour = new Date(nowUTC.getTime() + KST_OFFSET_MS).getUTCHours()
  if (kstHour < 6) {
    return toKSTDateStr(new Date(nowUTC.getTime() - 86400000))
  }
  return toKSTDateStr(nowUTC)
}

// 오늘 또는 어제만 허용 (2일 이상 전 소급 불가)
export function isValidClosingDate(dateStr: string): boolean {
  const now = Date.now()
  const today = toKSTDateStr(new Date(now))
  const yesterday = toKSTDateStr(new Date(now - 86400000))
  return dateStr === today || dateStr === yesterday
}
