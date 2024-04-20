import * as fs from "node:fs";
import * as util from "node:util";
import * as vscode from "vscode";
import { Repo, Souko } from "./souko.js";

export function activate(context: vscode.ExtensionContext) {
  const souko = new Extension();
  souko.watchConfiguration(context);
  souko.loadConfiguration();
  souko.registerCommands(context);
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate() {}

const CONFIG_SECTION: string = "souko";

class Extension {
  #logChannel: vscode.LogOutputChannel = vscode.window.createOutputChannel(
    "Souko",
    {
      log: true,
    },
  );
  #souko: Souko = new Souko(this.#logChannel);

  constructor() {}

  watchConfiguration(context: vscode.ExtensionContext) {
    const disbosable = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(CONFIG_SECTION)) {
        this.loadConfiguration();
      }
    });
    context.subscriptions.push(disbosable);
  }

  loadConfiguration() {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const soukoCommand = config.get<string>("command");
    if (soukoCommand === undefined) {
      throw new Error("souko.command is not set");
    }
    this.#souko.command = soukoCommand;
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
      const errStr = String(err);
      this.#logChannel.error(`Failed to open repository: ${errStr}`);
      await vscode.window.showErrorMessage(
        `Failed to open repository: ${errStr}`,
      );
    }
  }

  async #open(forceNewWindow: boolean) {
    const repo = await this.#selectRepository();
    if (repo === null) {
      return;
    }

    const path = repo.canonicalPath;
    const stats = await util.promisify(fs.stat)(path);
    if (!stats.isDirectory()) {
      throw new Error(`selected path is not a directory: ${path}`);
    }

    const uri = vscode.Uri.file(path);
    await vscode.commands.executeCommand("vscode.openFolder", uri, {
      forceNewWindow,
      noRecentEntry: false,
    });
  }

  async #selectRepository(): Promise<Repo | null> {
    interface Candidate extends vscode.QuickPickItem {
      repo?: Repo;
    }

    const candidates = this.#souko.list().then((list) =>
      list.roots.flatMap((root) => {
        const separator = <Candidate>{
          label: root.name,
          kind: vscode.QuickPickItemKind.Separator,
        };
        const repos = root.repos.map(
          (repo) =>
            <Candidate>{
              label: repo.relativePath,
              description: root.name,
              detail: repo.displayPath,
              kind: vscode.QuickPickItemKind.Default,
              repo,
            },
        );
        return [separator].concat(repos);
      }),
    );

    const selected = await vscode.window.showQuickPick(candidates, {
      title: "Select repository to open",
      matchOnDescription: true,
      matchOnDetail: false,
    });

    return selected?.repo ?? null;
  }
}
