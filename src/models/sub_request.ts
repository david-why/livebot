export class SubRequest {
  constructor(
    public id: number,
    public lesson_id: number,
    public instructor_id: number,
    public is_open: number,
    public opened_at: number,
    public reason: string | null,
    public sent_notification: number = 0,
    public filled_by: number | null,
    public filled_at: number | null
  ) {}

  get openedDate(): Date {
    return new Date(this.opened_at)
  }
  set openedDate(date: Date) {
    this.opened_at = date.getTime()
  }

  get filledDate(): Date | null {
    return this.filled_at ? new Date(this.filled_at) : null
  }
  set filledDate(date: Date | null) {
    this.filled_at = date ? date.getTime() : null
  }
}
