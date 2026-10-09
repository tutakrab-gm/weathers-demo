export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}
export const unauthorized = () => new AppError(401, "unauthorized", "กรุณาเข้าสู่ระบบ");
export const forbidden = (m = "ไม่มีสิทธิ์ดำเนินการ") => new AppError(403, "forbidden", m);
export const notFound = (m = "ไม่พบข้อมูล") => new AppError(404, "not_found", m);
export const badRequest = (m: string) => new AppError(400, "bad_request", m);

/** optimistic lock ไม่ผ่าน: current = แถวล่าสุดในฐานข้อมูล */
export class ConflictError extends AppError {
  constructor(public current: Record<string, unknown> | null, message = "ข้อมูลถูกแก้ไขโดยผู้อื่นแล้ว") {
    super(409, "conflict", message, { current });
  }
}
