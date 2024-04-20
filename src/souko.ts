import * as child_process from "node:child_process";
import * as vscode from "vscode";

export class Souko {
  #command: string | null = null;
  #logChannel: vscode.LogOutputChannel;

  constructor(logChannel: vscode.LogOutputChannel) {
    this.#logChannel = logChannel;
  }

  get command(): string | null {
    return this.#command;
  }

  set command(command: string) {
    this.#command = command;
  }

  async list(): Promise<List> {
    const output = await this.#spawnWithStdout(["list", "--json"]);
    const list: List = JSON.parse(output) as List;
    const numRepos = list.roots
      .map((r) => r.repos.length)
      .reduce((a, b) => a + b, 0);
    const numRoots = list.roots.length;
    this.#logChannel.info(
      `found ${numRepos} repositories in ${numRoots} root directories`,
    );
    return list;
  }

  async #spawnWithStdout(args: readonly string[]): Promise<string> {
    const command = this.#command;
    if (command === null) {
      throw new Error("command is not set");
    }

    return new Promise((resolve, reject) => {
      const proc = child_process.spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      proc.on("error", reject);
      proc.on("spawn", () => {
        this.#logChannel.info(`Executing ${command} ${args.join(" ")}`);

        let output = "";
        proc.stdout.on("data", (data) => {
          output += String(data);
        });
        proc.stdout.on("error", reject);

        proc.stderr.on("data", (data) => {
          this.#logChannel.info(String(data));
        });
        proc.stderr.on("error", reject);

        proc.on("close", (code: number, signal: string) => {
          if (signal !== null) {
            const msg = `${command} was killed by signal: ${signal}`;
            reject(new Error(msg));
            return;
          }

          if (code !== null) {
            const msg = `${command} exited with code: ${code}`;
            if (code !== 0) {
              reject(new Error(msg));
              return;
            }
          }

          resolve(output);
        });
      });
    });
  }
}

export type List = {
  roots: Root[];
};

export type Root = {
  name: string;
  realPath: string;
  displayPath: string;
  canonicalPath: string;
  repos: Repo[];
};

export type Repo = {
  relativePath: string;
  realPath: string;
  displayPath: string;
  canonicalPath: string;
};
