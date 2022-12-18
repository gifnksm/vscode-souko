import * as child_process from "node:child_process";
import * as fs from "node:fs";
import * as util from "node:util";
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  const souko = new Extension();

  souko.registerCommands(context);
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate() {}

class Extension {
  #souko: Souko;

  constructor() {
    this.#souko = new Souko();
  }

  registerCommands(context: vscode.ExtensionContext) {
    const commands: [string, () => void][] = [
      ["souko.open", async () => await this.#commandOpen(false)],
      ["souko.openInNewWindow", async () => await this.#commandOpen(true)],
    ];

    for (const [name, command] of commands) {
      const disposable = vscode.commands.registerCommand(name, command);
      context.subscriptions.push(disposable);
    }
  }

  async #commandOpen(forceNewWindow: boolean) {
    try {
      await this.#open(forceNewWindow);
    } catch (err: unknown) {
      console.error("Failed to open repository", err);
      vscode.window.showErrorMessage(`Failed to open repository: ${err}`);
    }
  }

  async #open(forceNewWindow: boolean) {
    const list = await this.#souko.list();
    const candidates = list.roots.flatMap((root) => {
      const separator = [
        {
          label: root.name,
          description: root.displayPath,
          kind: vscode.QuickPickItemKind.Separator,
          root,
          repo: <Repo | null>null,
        },
      ];
      const items = root.repos.map((repo) => ({
        label: repo.name,
        description: repo.displayPath,
        kind: vscode.QuickPickItemKind.Default,
        root,
        repo,
      }));
      return separator.concat(items);
    });

    const selected = await vscode.window.showQuickPick(candidates, {
      title: "Select repository to open",
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (selected === undefined || selected.repo === null) {
      return;
    }

    const stats = await util.promisify(fs.stat)(selected.repo.absolutePath);
    if (!stats.isDirectory()) {
      throw new Error(`selected path is not a directory: ${selected}`);
    }

    const uri = vscode.Uri.file(selected.repo.absolutePath);
    await vscode.commands.executeCommand("vscode.openFolder", uri, {
      forceNewWindow,
      noRecentEntry: false,
    });
  }
}

class Souko {
  #logChannel: vscode.OutputChannel;

  constructor() {
    this.#logChannel = vscode.window.createOutputChannel("souko", "log");
  }

  async list(): Promise<List> {
    const output = await this.#spawnWithStdout("souko", ["list", "--json"]);
    const list: List = JSON.parse(output);
    const numRepos = list.roots
      .map((r) => r.repos.length)
      .reduce((a, b) => a + b, 0);
    const numRoots = list.roots.length;
    this.#logChannel.appendLine(
      `found ${numRepos} repositories in ${numRoots} root directories`
    );
    return list;
  }

  async #spawnWithStdout(
    command: string,
    args: readonly string[]
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = child_process.spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      proc.on("error", reject);
      proc.on("spawn", () => {
        this.#logChannel.appendLine(`$ ${command} ${args.join(" ")}`);

        let output = "";
        proc.stdout.on("data", (data) => {
          output += data.toString();
        });
        proc.stdout.on("error", reject);

        proc.stderr.on("data", (data) => {
          this.#logChannel.append(data.toString());
        });
        proc.stderr.on("error", reject);

        proc.on("close", (code: number, signal: string) => {
          if (signal !== null) {
            const msg = `${command} was killed by signal: ${signal}`;
            this.#logChannel.appendLine(msg);
            reject(new Error(msg));
            return;
          }

          if (code !== null) {
            const msg = `${command} exited with code: ${code}`;
            this.#logChannel.appendLine(msg);
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

type List = {
  roots: Root[];
};
type Root = {
  name: string;
  displayPath: string;
  absolutePath: string;
  repos: Repo[];
};
type Repo = {
  name: string;
  displayPath: string;
  absolutePath: string;
};
