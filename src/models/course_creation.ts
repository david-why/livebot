export class CourseCreationFlow {
  constructor(
    public channel_id: string,
    public user_id: string,
    public course_id: number,
    public webhook_id: string,
    public module: number,
    public stage: number,
  ) {}
}
