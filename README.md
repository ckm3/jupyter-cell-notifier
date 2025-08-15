# Jupyter Cell Notifier  
![License](https://img.shields.io/badge/license-MIT-green)

A VS Code extension that notifies you when individual Jupyter notebook cells finish executing. Supports direct messaging via Slack, Microsoft Teams, and Telegram with extreme privacy and security.

---

## Features

- Bell icon in each cell’s toolbar to toggle notifications  
- Desktop & notification‐center alerts when cells complete  
- Click a notification to jump right back to that cell  
- Optional Slack webhook notifications (securely stored)  
- Optional Microsoft Teams webhook notifications (securely stored)  
- Optional Telegram bot notifications (securely stored)
- No server or relay — messages are sent directly to Slack/Teams/Telegram using your credentials

---

## Preview

![Extension Preview](assets/screenshot.png)  

---

## Requirements

- VS Code ≥ 1.74.0  
- [Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python) & Jupyter extension for `.ipynb` support  

---

## Installation

### From the Marketplace

1. Open **Extensions** (`Ctrl+Shift+X`)  
2. Search for **“Jupyter Cell Notifier”**  
3. Click **Install**

## Usage

1. Open a Jupyter notebook in VS Code
2. Look for the bell icon (🔔) in the cell toolbar
3. Click the bell icon to enable notifications for that cell
4. Run the cell - you'll receive a notification when it completes
5. Click the notification to jump to the cell or disable future notifications

### Optional: Slack Notifications

1. Create a Slack Incoming Webhook (in your Slack workspace settings)
2. Run the command palette: `Jupyter Cell Notifier: Set Slack Webhook URL`
3. Paste the webhook URL (must start with `https://hooks.slack.com/services/`)
4. Enable the setting: `jupyter-cell-notifier.slack.enable`
5. When a watched cell completes, a message is sent to Slack

### Optional: Microsoft Teams Notifications

1. Add an Incoming Webhook connector to your Teams channel and copy its webhook URL
2. Run the command palette: `Jupyter Cell Notifier: Set Teams Webhook URL`
3. Paste the webhook URL
4. Enable the setting: `jupyter-cell-notifier.teams.enable`
5. When a watched cell completes, a message is sent to your Teams channel

### Optional: Telegram Notifications

1. Create a bot with @BotFather and copy the bot token
2. Obtain your chat ID (e.g. by messaging the bot and using a bot like @userinfobot or via logs)
3. Run: `Jupyter Cell Notifier: Set Telegram Bot Token & Chat ID`
4. Enter the token then the chat ID
5. Enable the setting: `jupyter-cell-notifier.telegram.enable`
6. Watched cell completions send a direct Telegram message

All secrets (webhooks, bot token, chat ID) are stored securely using VS Code's SecretStorage — they never go into your settings.json or source control.

## Privacy & Security

- No backend server: This extension does not operate any cloud service and does not relay your messages.
- Direct delivery: Notifications are sent from your VS Code directly to Slack, Microsoft Teams, or Telegram via their official webhook/API endpoints.
- Your credentials: You provide and control your own webhook URLs or bot tokens. The extension does not create, proxy, or manage provider accounts.
- Local secure storage: Sensitive values are stored in VS Code SecretStorage and are never written to files in your workspace or settings.

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT