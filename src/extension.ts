import * as vscode from 'vscode';
import { execFile } from 'child_process';

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
    const notebookOpenListener = vscode.window.onDidChangeActiveNotebookEditor(editor => {
        if (editor) {
            // Refresh decorations for cells with notifications enabled
            editor.notebook.getCells().forEach(cell => {
                const cellId = getCellId(cell);
                if (notificationEnabledCells.has(cellId)) {
                    updateCellDecoration(cell, true);
                }
            });
        }
    });

    context.subscriptions.push(toggleCommand, executionListener, notebookOpenListener);

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

    function showNotification(cell: vscode.NotebookCell, success: boolean | undefined) {
        const cellIndex = cell.index + 1; // Make it 1-based for user display
        const cellContent = cell.document.getText().substring(0, 50); // First 50 chars of cell content
        const truncatedContent = cellContent.length === 50 ? cellContent + '...' : cellContent;

        const status = success === false ? 'failed' : 'finished';
        const emoji = success === false ? '❌' : '📔';

        vscode.window.showInformationMessage(
            `${emoji} Jupyter Cell ${cellIndex} ${status}: "${truncatedContent}"`,
            'Go to Cell',
            'Disable Notifications'
        ).then(selection => {
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
        const config = vscode.workspace.getConfiguration('jupyter-cell-notifier');
        const useSystem = config.get<boolean>('systemNotifications', true);
        if (useSystem && process.platform === 'darwin') {
            const title = `Cell ${cellIndex} ${status}`;
            const message = truncatedContent || 'Execution complete';
            showMacSystemNotification(title, message);
        }
    }

    function showMacSystemNotification(title: string, message: string) {
        // Escape quotes for AppleScript
        const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `display notification "${esc(message)}" with title "${esc(title)}"`;
        execFile('osascript', ['-e', script], (err) => {
            if (err) {
                console.debug('Failed to send macOS notification via osascript:', err.message);
            }
        });
    }
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