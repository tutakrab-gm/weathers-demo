import fs from "node:fs/promises";
import path from "node:path";
import { env, modes } from "../core/env";

export interface Storage {
  readonly mode: "real" | "mock";
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** real: presigned URL อายุสั้น ; mock: null (ให้ route อ่านไฟล์เอง) */
  signedUrl(key: string, ttlSec: number): Promise<string | null>;
  read(key: string): Promise<Buffer | null>;
}

class LocalStorage implements Storage {
  readonly mode = "mock" as const;
  private root = path.join(process.cwd(), ".data", "uploads");
  private p(key: string) {
    const full = path.join(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("bad key");
    return full;
  }
  async put(key: string, body: Buffer) { const f = this.p(key); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, body); }
  async signedUrl() { return null; }
  async read(key: string) { try { return await fs.readFile(this.p(key)); } catch { return null; } }
}

class S3Storage implements Storage {
  readonly mode = "real" as const;
  private client: import("@aws-sdk/client-s3").S3Client;
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { S3Client } = require("@aws-sdk/client-s3") as typeof import("@aws-sdk/client-s3");
    this.client = new S3Client({
      region: env.s3.region, endpoint: env.s3.endpoint || undefined, forcePathStyle: !!env.s3.endpoint,
      credentials: { accessKeyId: env.s3.key, secretAccessKey: env.s3.secret },
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await this.client.send(new PutObjectCommand({ Bucket: env.s3.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: "private, max-age=300" }));
  }
  async signedUrl(key: string, ttlSec: number) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }), { expiresIn: ttlSec });
  }
  async read(key: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const r = await this.client.send(new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    return r.Body ? Buffer.from(await r.Body.transformToByteArray()) : null;
  }
}

const g = globalThis as unknown as { __storage?: Storage };
export function storage(): Storage {
  return (g.__storage ??= modes.storage === "real" ? new S3Storage() : new LocalStorage());
}
export const __setStorage = (s: Storage | undefined) => { g.__storage = s; };
