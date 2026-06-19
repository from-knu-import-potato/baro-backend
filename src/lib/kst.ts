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

// openTime(HH:mm) 기준으로 businessDate 계산
// 현재 KST 시각 < openTime → 어제, 이상 → 오늘
// openTime이 null(휴무일)이면 오늘 캘린더 날짜 반환
export function getBusinessDateStr(openTime: string | null): string {
  const nowUTC = new Date()

  if (!openTime) {
    return toKSTDateStr(nowUTC)
  }

  const [openHour, openMinute] = openTime.split(':').map(Number)
  const kstNow = new Date(nowUTC.getTime() + KST_OFFSET_MS)
  const kstHour = kstNow.getUTCHours()
  const kstMinute = kstNow.getUTCMinutes()

  const isBeforeOpen = kstHour < openHour || (kstHour === openHour && kstMinute < openMinute)

  if (isBeforeOpen) {
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
