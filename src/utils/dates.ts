import { DateTime, FixedOffsetZone } from "luxon"

export function parseDatesString(datesString: string): DateTime[] {
  // 2025-07-15,+0x0,2025-07-16,+0x0,2025-07-17,+0x0,2025-07-18,+0x0,2025-07-21,2025-07-22,2025-07-23,2025-07-24,2025-07-25,+7x2,2025-08-11,+0x0
  const parts = datesString.split(",")
  const dates: DateTime[] = []
  const repeatDates: DateTime[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    if (part.startsWith("+")) {
      const offsetMatch = part.match(/^\+(\d+)x(\d+)/)
      if (offsetMatch) {
        const offsetDays = parseInt(offsetMatch[1]!, 10)
        const repeatCount = parseInt(offsetMatch[2]!, 10)
        for (let j = 0; j < repeatCount; j++) {
          for (const date of repeatDates) {
            const newDate = date.plus({ days: offsetDays * (j + 1) })
            dates.push(newDate)
          }
        }
        repeatDates.length = 0
      } else {
        throw new Error(`Invalid offset format: ${part}`)
      }
    } else {
      const dateMatch = part.match(/^(\d{4}-\d{2}-\d{2})/)
      if (dateMatch) {
        // const date = DateTime.fromISO(dateMatch[1]!, {
        //   zone: FixedOffsetZone.utcInstance,
        // })
        const date = DateTime.utc(
          parseInt(dateMatch[1]!.slice(0, 4), 10),
          parseInt(dateMatch[1]!.slice(5, 7), 10),
          parseInt(dateMatch[1]!.slice(8, 10), 10),
        ).setZone(FixedOffsetZone.utcInstance)
        dates.push(date)
        repeatDates.push(date) // Store for potential repeats
      } else {
        throw new Error(`Invalid date format: ${part}`)
      }
    }
  }
  return dates
}
