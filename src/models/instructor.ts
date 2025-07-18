export class Instructor {
  constructor(
    public id: number,
    public discord_id: string,
    public email: string,
    public name: string,
  ) {}
}

export class LessonInstructor extends Instructor {
  constructor(
    id: number,
    discord_id: string,
    email: string,
    name: string,
    public flags: number,
  ) {
    super(id, discord_id, email, name)
  }
}
