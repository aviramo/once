import { LogEntry } from "./global.ts";
import Tools from "./tools.ts";
import User from "./user.ts";

export default class Log {
  id: string = crypto.randomUUID();
  created_at: Date = new Date();
  user: User;
  key: string;
  body: Record<string, unknown> = {};
  status: number = 200;
  logs: LogEntry[] = [];
  error_response?: unknown;
  response_body: unknown = null;

  constructor(key: string, body: Record<string, unknown>, user: User) {
    this.user = user;
    this.key = key;
    this.body = body;
    this.logs = [new LogEntry(this, "body", body)];
  }

  log(task: string, body?: Record<string, unknown>) {
    const x = new LogEntry(this, task, body);
    this.logs.push(x);
    return x;
  }

  async save() {
    const values: Record<string, unknown> = {
      id: this.id,
      created_at: this.created_at,
      user_id: this.user?.user_id && this.user.user_id !== "unknown" ? this.user.user_id : null,
      key: this.key || null,
      status: this.status,
      run_ms: new Date().getTime() - this.created_at.getTime(),
      log: this.logs,
      user: this.user?.user_id && this.user.user_id !== "unknown" ? (this.user?.db?.new ?? null) : null,
    };
    try {
      const { error } = await Tools.supabase.from("log").insert(values);
      if (!error) return;
      await new Promise((r) => setTimeout(r, 100));
      const retry = await Tools.supabase.from("log").insert(values);
      if (!retry.error) return;
      console.error("log_insert_failed", JSON.stringify({ id: this.id, error: retry.error, values }));
    } catch (err) {
      console.error("log_save_crash", JSON.stringify({ id: this.id, err: (err as Error).message, values }));
    }
  }

  response() {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Content-Type": "application/json",
    };
    EdgeRuntime.waitUntil(this.save());
    return new Response(JSON.stringify(this.response_body ?? this.error_response ?? this.user?.db?.new ?? null), {
      status: this.status,
      headers,
    });
  }

  error(task: string, error: string, status: number) {
    this.log(task).result(error, status);
    this.status = status;
    this.error_response = error;
    return this.response();
  }

  success(body: unknown) {
    this.response_body = body;
    this.status = 200;
    return this.response();
  }
}
