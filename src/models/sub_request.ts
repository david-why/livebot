export class SubRequest {
  constructor(
    public id: number,
    public lesson_id: number,
    public instructor_id: number,
    public is_open: number,
    public opened_at: number,
    public reason: string | null,
  ) {}
}
