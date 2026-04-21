import User from "./user.ts";
import Tools from "./tools.ts";
import { State } from "./global.ts";

export default class Logger {

  created_at: Date = new Date();
  user?: User;
  body: Record<string, unknown> = {};
  event?: string;
  status: number = 200;
  action?: string;
  logs: Log[] = [];
  logger?: Logger;

  constructor(event: string, body: Record<string, unknown>, user?: User, logger?: Logger) {
    this.user = user;
    this.event = event;
    this.body = body;
    if (logger) logger.logger = this;
  }

  log(action: string, body?: Record<string, unknown>) {
    const x = new Log(action, body);
    this.logs.push(x);
    return x;
  }

  getDeepUser(): User | undefined {
    return this.logger ? (this.logger.getDeepUser() ?? this.logger.user) : this.user;
  }

  async save() {
    if (!this.user) return;
    const values: Record<string, unknown> = {
      created_at: this.created_at,
      user_id: this.user?.user_id,
      event: this.event ?? 'update',
      action: this.action ?? this.event,
      location: this.user?.location,
      other_id: this.user?.other_id ?? (this.user?.state === State.HIDDEN ? null : this.user?.db?.old?.other_id),
      run_ms: new Date().getTime() - this.created_at.getTime(),
      status: this.status,
      state: this.user?.db.new.state != this.user?.db.old?.state || this.user?.db.new.other_id != this.user?.db.old?.other_id ? this.user?.db.new.state : null,
      data: {
        logs: this.logs,
        body: this.body,
        user: this.user?.db.new,
      },
    };
    await Tools.supabase.from("log").insert(values);
  }

  response(error?: string) {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Content-Type": "application/json",
    };
    EdgeRuntime.waitUntil(this.save());
    return new Response(JSON.stringify(this.getDeepUser()?.db.new), {
      status: this.status,
      headers: headers,
    });
  }

  error(action: string, error: string, status: number = 500) {
    this.log(action).result(error, status);
    this.status = status;
    return this.response(error);
  }

}

export class Log {
  action: string;
  body?: Record<string, unknown>;
  created_at: Date = new Date();
  run_ms?: number;
  data?: unknown;
  error?: unknown;

  constructor(action: string, body?: Record<string, unknown>) {
    this.action = action;
    this.body = body;
  }

  result(data: unknown, status: number) {
    this.run_ms = new Date().getTime() - this.created_at.getTime();
    if (status >= 200 && status < 300) this.data = data;
    else this.error = data;
  }

  toJSON() {
    return {
      action: this.action,
      body: this.body,
      created_at: this.created_at,
      run_ms: this.run_ms,
      data: this.data,
      error: this.error,
    };
  }

}