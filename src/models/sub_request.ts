export class SubRequest {
  constructor(
    public id: number,
    public lesson_id: number,
    public instructor_id: number,
    public is_open: number,
    public opened_at: number,
    public reason: string | null,
    public sent_notification: number = 0,
  ) {}

  get openedDate(): Date {
    return new Date(this.opened_at)
  }
  set openedDate(date: Date) {
    this.opened_at = date.getTime()
  }
}
