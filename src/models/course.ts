export class Course {
  constructor(
    public id: number,
    public module: number,
    public duration: number, // in minutes
    public flags: number,
  ) {}
}

export enum CourseFlags {
  None = 0,
  NoCalendar = 1 << 0, // Do not create calendar events for this course
}
