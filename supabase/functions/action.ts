import { Log } from "./global.ts";
import Tools from "./tools.ts";
import User from "./user.ts";

export default class Action {

  id: string = crypto.randomUUID();
  created_at: Date = new Date();
  user: User;
  key: string;
  body: Record<string, unknown> = {};
  status: number = 200;
  logs: Log[] = [];
  error_response?: unknown;

  constructor(key: string, body: Record<string, unknown>, user: User) {
    this.user = user;
    this.key = key;
    this.logs = [new Log(this, 'body', body)];
  }

  log(task: string, body?: Record<string, unknown>) {
    const x = new Log(this, task, body);
    this.logs.push(x);
    return x;
  }

  async save() {
    if (!this.user) return;
    const values: Record<string, unknown> = {
      id: this.id,
      created_at: this.created_at,
      user_id: this.user.user_id,
      key: this.key,
      status: this.status,
      run_ms: new Date().getTime() - this.created_at.getTime(),
      log: this.logs,
      user: this.user?.db.new,

    };
    await Tools.supabase.from("actions").insert(values);
  }

  response() {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Content-Type": "application/json",
    };
    EdgeRuntime.waitUntil(this.save());
    return new Response(JSON.stringify(/*this.error_response ??*/ this.user?.db.new), {
      status: this.status,
      headers: headers,
    });
  }

  error(action: string, error: string, status: number) {
    this.log(action).result(error, status);
    this.status = status;
    this.error_response = error;
    return this.response();
  }

}