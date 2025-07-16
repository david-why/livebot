export class Lesson {
  private date_timestamp: number

  constructor(
    public id: number,
    public course_id: number,
    date: Date,
    public name: string,
    public abbrev: string,
    public description: string,
    public google_event_id: string | null,
    public google_event_outdated: number,
  ) {
    this.date_timestamp = date.getTime()
  }

  get date(): Date {
    return new Date(this.date_timestamp)
  }
  set date(value: Date) {
    this.date_timestamp = value.getTime()
  }
}
