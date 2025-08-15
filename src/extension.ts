import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as https from 'https';
import { URL } from 'url';
import { IncomingMessage } from 'http';

export function activate(context: vscode.ExtensionContext) {
    console.log('Jupyter Cell Notifier is now active');

    // Map to track which cells have notifications enabled
    const notificationEnabledCells = new Set<string>();
    
    // Map to track cell execution states
    const executingCells = new Map<string, boolean>();

    // Emitter to refresh status bar items when state changes
    const statusBarEmitter = new vscode.EventEmitter<vscode.NotebookCell | undefined>();
    context.subscriptions.push(statusBarEmitter);

    // Register the toggle notification command
    const toggleCommand = vscode.commands.registerCommand(
        'jupyter-cell-notifier.toggleNotification',
        (cell?: vscode.NotebookCell) => {
            if (!cell) {
                // Try to get the active cell
                const activeNotebook = vscode.window.activeNotebookEditor;
                if (!activeNotebook) {
                    vscode.window.showErrorMessage('No active notebook cell found');
                    return;
                }
                const selection = activeNotebook.selections[0];
                if (!selection) {
                    vscode.window.showErrorMessage('No cell selected');
                    return;
                }
                cell = activeNotebook.notebook.cellAt(selection.start);
            }

            const cellUri = getCellId(cell);
            
            if (notificationEnabledCells.has(cellUri)) {
                // Disable notifications for this cell
                notificationEnabledCells.delete(cellUri);
                updateCellDecoration(cell, false);
                // Clear any executing state for safety on disable
                executingCells.delete(cellUri);
            } else {
                // Enable notifications for this cell
                notificationEnabledCells.add(cellUri);
                updateCellDecoration(cell, true);
            }

            // Refresh status bar item for this cell
            statusBarEmitter.fire(cell);
        }
    );

    // Listen for notebook cell execution changes via document change events
    const executionListener = vscode.workspace.onDidChangeNotebookDocument((e: vscode.NotebookDocumentChangeEvent) => {
        for (const change of e.cellChanges) {
            const cell = change.cell;
            const cellId = getCellId(cell);
            const summary = change.executionSummary; // Only act on real execution changes

            if (!summary) {
                continue;
            }

            // Mark as executing when a startTime appears
            if (typeof summary.timing?.startTime === 'number' && !executingCells.get(cellId)) {
                executingCells.set(cellId, true);
            }

            // When endTime appears, treat as finished
            if (typeof summary.timing?.endTime === 'number') {
                const wasExecuting = executingCells.get(cellId);
                executingCells.delete(cellId);

                if (wasExecuting && notificationEnabledCells.has(cellId)) {
                    showNotification(cell, summary.success);
                }
            }
        }
    });

    // Listen for notebook open events to restore decoration states
    const notebookOpenListener = vscode.window.onDidChangeActiveNotebookEditor((editor: vscode.NotebookEditor | undefined) => {
        if (editor) {
            // Refresh decorations for cells with notifications enabled
            editor.notebook.getCells().forEach((cell: vscode.NotebookCell) => {
                const cellId = getCellId(cell);
                if (notificationEnabledCells.has(cellId)) {
                    updateCellDecoration(cell, true);
                }
            });
        }
    });

    // Command: Set Slack Webhook URL (stored securely in secret storage)
    const setSlackWebhookCommand = vscode.commands.registerCommand('jupyter-cell-notifier.setSlackWebhook', async () => {
        const input = await vscode.window.showInputBox({
            prompt: 'Enter Your Slack Incoming Webhook URL (starts with https://hooks.slack.com/services/...)',
            placeHolder: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
            validateInput: (val: string) => val.startsWith('https://hooks.slack.com/services/') ? undefined : 'Must start with https://hooks.slack.com/services/'
        });
        if (!input) { return; }
        await context.secrets.store('jupyter-cell-notifier.slackWebhook', input.trim());
        vscode.window.showInformationMessage('Slack webhook URL saved securely.');
    });

    // Command: Set Telegram Bot Token & Chat ID
    const setTelegramCredentialsCommand = vscode.commands.registerCommand('jupyter-cell-notifier.setTelegramCredentials', async () => {
        const token = await vscode.window.showInputBox({
            prompt: 'Enter Your Telegram Bot Token',
            placeHolder: '123456789:ABCDEF...',
            validateInput: (v: string) => /:\w/.test(v) ? undefined : 'Seems not a valid bot token (missing :)'
        });
        if (!token) { return; }
        const chatId = await vscode.window.showInputBox({
            prompt: 'Enter Your Telegram Chat ID (user/group ID)',
            placeHolder: '123456789'
        });
        if (!chatId) { return; }
        await context.secrets.store('jupyter-cell-notifier.telegramToken', token.trim());
        await context.secrets.store('jupyter-cell-notifier.telegramChatId', chatId.trim());
        vscode.window.showInformationMessage('Telegram credentials saved securely.');
    });

    // Command: Set Microsoft Teams Webhook URL (stored securely in secret storage)
    const setTeamsWebhookCommand = vscode.commands.registerCommand('jupyter-cell-notifier.setTeamsWebhook', async () => {
        const input = await vscode.window.showInputBox({
            prompt: 'Enter Your Microsoft Teams Incoming Webhook URL',
            placeHolder: 'https://.../webhook/...',
        });
        if (!input) { return; }
        await context.secrets.store('jupyter-cell-notifier.teamsWebhook', input.trim());
        vscode.window.showInformationMessage('Teams webhook URL saved securely.');
    });

    context.subscriptions.push(toggleCommand, executionListener, notebookOpenListener, setSlackWebhookCommand, setTelegramCredentialsCommand, setTeamsWebhookCommand);

    // Register status bar provider to show per-cell On/Off bell with a toggle command (guard for API availability)
    const notebooksApi: any = (vscode as any).notebooks;
    if (notebooksApi && notebooksApi.registerNotebookCellStatusBarItemProvider && (vscode as any).NotebookCellStatusBarItem) {
        const provider: any = {
            onDidChangeStatusBarItems: statusBarEmitter.event,
            provideCellStatusBarItems: (cell: vscode.NotebookCell) => {
                const enabled = notificationEnabledCells.has(getCellId(cell));
                const text = enabled ? '$(bell) On' : '$(bell-slash) Off';
                const item = new (vscode as any).NotebookCellStatusBarItem(
                    text,
                    (vscode as any).NotebookCellStatusBarAlignment.Right
                );
                item.tooltip = enabled ? 'Click to disable cell notifications' : 'Click to enable cell notifications';
                item.command = {
                    command: 'jupyter-cell-notifier.toggleNotification',
                    title: enabled ? 'Disable Cell Notification' : 'Enable Cell Notification',
                    arguments: [cell]
                };
                item.accessibilityInformation = { label: `Notifications ${enabled ? 'on' : 'off'} for this cell`, role: 'button' };
                return [item];
            }
        };
        const statusBarReg = notebooksApi.registerNotebookCellStatusBarItemProvider('jupyter-notebook', provider);
        context.subscriptions.push(statusBarReg);

        // Refresh provider when the active selection changes (to redraw icons)
        const selListener = vscode.window.onDidChangeNotebookEditorSelection(() => statusBarEmitter.fire(undefined));
        context.subscriptions.push(selListener);
    }

    async function showNotification(cell: vscode.NotebookCell, success: boolean | undefined) {
        const cellIndex = cell.index + 1; // Make it 1-based for user display
        const cellContent = cell.document.getText().substring(0, 50); // First 50 chars of cell content
        const truncatedContent = cellContent.length === 50 ? cellContent + '...' : cellContent;

        const status = success === false ? 'failed' : 'finished';
        const emoji = success === false ? '❌' : '📔';
    const config = vscode.workspace.getConfiguration('jupyter-cell-notifier');
    const includeOutput = config.get<boolean>('includeOutputInMessages', true);
    const outputLimit = config.get<number>('outputCharLimit', 1000);
        let outputSnippet = includeOutput ? extractCellOutput(cell, outputLimit) : '';
        if (includeOutput && success === false && !outputSnippet) {
            outputSnippet = '(no error text captured)';
        }
        const message = `${emoji} Jupyter Cell ${cellIndex} ${status}: ${truncatedContent || '(empty cell)'}${includeOutput && outputSnippet ? `\nOutput (truncated):\n${outputSnippet}` : ''}`;

        vscode.window.showInformationMessage(
            `${emoji} Jupyter Cell ${cellIndex} ${status}: "${truncatedContent}"`,
            'Go to Cell',
            'Disable Notifications'
    ).then((selection: string | undefined) => {
            if (selection === 'Go to Cell') {
                // Navigate to the cell
                const activeNotebook = vscode.window.activeNotebookEditor;
                if (activeNotebook && activeNotebook.notebook.uri.toString() === cell.notebook.uri.toString()) {
                    const range = new vscode.NotebookRange(cell.index, cell.index + 1);
                    activeNotebook.selections = [range];
                    activeNotebook.revealRange(range);
                }
            } else if (selection === 'Disable Notifications') {
                // Disable notifications for this cell
                const cellId = getCellId(cell);
                notificationEnabledCells.delete(cellId);
                updateCellDecoration(cell, false);
            }
        });

        // Also show a macOS system notification if enabled
    // 'config' already defined above
        const useSystem = config.get<boolean>('systemNotifications', true);
        if (useSystem && process.platform === 'darwin') {
            const title = `Cell ${cellIndex} ${status}`;
            const message = truncatedContent || 'Execution complete';
            showMacSystemNotification(title, message);
        }

        // Slack notification
        if (config.get<boolean>('slack.enable')) {
            const webhook = await context.secrets.get('jupyter-cell-notifier.slackWebhook');
            if (webhook) {
                postSlack(webhook, message).catch(err => console.debug('Slack post failed', err));
            } else {
                console.debug('Slack enabled but no webhook stored.');
            }
        }

        // Teams notification
        if (config.get<boolean>('teams.enable')) {
            const webhook = await context.secrets.get('jupyter-cell-notifier.teamsWebhook');
            if (webhook) {
                postTeams(webhook, message).catch(err => console.debug('Teams post failed', err));
            } else {
                console.debug('Teams enabled but no webhook stored.');
            }
        }

        // Telegram notification
        if (config.get<boolean>('telegram.enable')) {
            const token = await context.secrets.get('jupyter-cell-notifier.telegramToken');
            const chatId = await context.secrets.get('jupyter-cell-notifier.telegramChatId');
            if (token && chatId) {
                postTelegram(token, chatId, message).catch(err => console.debug('Telegram post failed', err));
            } else {
                console.debug('Telegram enabled but credentials missing.');
            }
        }
    }

    function showMacSystemNotification(title: string, message: string) {
        // Escape quotes for AppleScript
        const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `display notification "${esc(message)}" with title "${esc(title)}"`;
        execFile('osascript', ['-e', script], (err: Error | null) => {
            if (err) {
                console.debug('Failed to send macOS notification via osascript:', (err as any).message);
            }
        });
    }
}

// Extract a concatenated textual representation of cell outputs, truncated to limit chars.
function extractCellOutput(cell: vscode.NotebookCell, limit: number): string {
    try {
        const chunks: string[] = [];
        for (const output of cell.outputs ?? []) {
            // VS Code notebook API normalizes items with { mime, data }
            for (const item of output.items ?? []) {
                const mime = item.mime || '';
                const isError = /error/.test(mime) || mime === 'application/x.notebook.error-traceback' || mime === 'application/vnd.code.notebook.error';
                const isTextLike = isError || /^text\/plain$/.test(mime) || /^text\/markdown$/.test(mime) || /json/.test(mime) || mime === 'application/vnd.code.notebook.stdout' || mime === 'application/vnd.code.notebook.stderr' || mime === 'application/x.notebook.error-traceback';
                if (!isTextLike) continue;
                let raw: string | undefined;
                try {
                    const data = item.data as any;
                    if (typeof data === 'string') raw = data; else if (Array.isArray(data)) raw = Buffer.from(data).toString('utf8'); else if (data instanceof Uint8Array) raw = Buffer.from(data).toString('utf8'); else if (Buffer.isBuffer(data)) raw = data.toString('utf8');
                    if (isError && raw) {
                        // Attempt to parse structured error { name, message, stack }
                        try {
                            const parsed = JSON.parse(raw);
                            if (parsed && (parsed.message || parsed.stack)) {
                                raw = `${parsed.name || 'Error'}: ${parsed.message || ''}\n${(parsed.stack || '').split('\n').slice(0, 15).join('\n')}`.trim();
                            }
                        } catch { /* ignore */ }
                    }
                    if (!isError && /json/.test(mime) && raw) {
                        try { raw = JSON.stringify(JSON.parse(raw), null, 2); } catch { /* ignore */ }
                    }
                } catch { /* ignore */ }
                if (raw) {
                    const trimmed = raw.trim();
                    if (trimmed.length) chunks.push(trimmed);
                }
                if (chunks.join('\n').length >= limit) break;
            }
            if (chunks.join('\n').length >= limit) break;
        }
        if (!chunks.length) return '';
        const combined = chunks.join('\n');
        return combined.length > limit ? combined.slice(0, limit) + '…' : combined;
    } catch {
        return '';
    }
}

// Post a message to Slack via webhook (minimal dependency-free implementation)
function postSlack(webhookUrl: string, text: string): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            const url = new URL(webhookUrl);
            const body = JSON.stringify({ text });
            const req = https.request({
                method: 'POST',
                hostname: url.hostname,
                path: url.pathname + url.search,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                }
            }, (res: IncomingMessage) => {
                // Consume data to free memory
                res.on('data', () => {});
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve();
                    else reject(new Error(`Slack webhook status ${res.statusCode}`));
                });
            });
            req.on('error', reject);
            req.write(body);
            req.end();
        } catch (e) {
            reject(e);
        }
    });
}

// Post a simple message to Microsoft Teams via Incoming Webhook
// Teams accepts either the legacy "text" card or an Adaptive Card payload. The simplest is a JSON with just "text".
function postTeams(webhookUrl: string, text: string): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            const url = new URL(webhookUrl);
            const body = JSON.stringify({ text });
            const req = https.request({
                method: 'POST',
                hostname: url.hostname,
                path: url.pathname + url.search,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                }
            }, (res: IncomingMessage) => {
                res.on('data', () => {});
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve();
                    else reject(new Error(`Teams webhook status ${res.statusCode}`));
                });
            });
            req.on('error', reject);
            req.write(body);
            req.end();
        } catch (e) {
            reject(e);
        }
    });
}

// Post a message to Telegram
function postTelegram(botToken: string, chatId: string, text: string): Promise<void> {
    const apiUrl = new URL(`https://api.telegram.org/bot${botToken}/sendMessage`);
    const body = JSON.stringify({ chat_id: chatId, text });
    return new Promise((resolve, reject) => {
        const req = https.request({
            method: 'POST',
            hostname: apiUrl.hostname,
            path: apiUrl.pathname + apiUrl.search,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
    }, (res: IncomingMessage) => {
            res.on('data', () => {});
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve();
                else reject(new Error(`Telegram status ${res.statusCode}`));
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function getCellId(cell: vscode.NotebookCell): string {
    // Create a unique identifier for the cell
    // Using document URI + cell index as a simple identifier
    return `${cell.document.uri.toString()}_${cell.index}`;
}

function updateCellDecoration(cell: vscode.NotebookCell, enabled: boolean) {
    // VS Code doesn't provide direct API to add inline visual decorations to notebook cells.
    // Store a flag in the cell metadata so users or other tooling can see it.
    const metadata = { ...cell.metadata, 'jupyter-cell-notifier': { enabled } } as any;
    const edit = new vscode.WorkspaceEdit();
    const notebookEdit = vscode.NotebookEdit.updateCellMetadata(cell.index, metadata);
    edit.set(cell.notebook.uri, [notebookEdit]);
    vscode.workspace.applyEdit(edit);
}

export function deactivate() {
    console.log('Jupyter Cell Notifier is now deactivated');
}