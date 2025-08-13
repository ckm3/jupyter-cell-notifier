# Jupyter Cell Notifier  
![License](https://img.shields.io/badge/license-MIT-green)

A VS Code extension to notify you when individual Jupyter notebook cells finish executing. Supoorting Slack and Telegram messages.

---

## Features

- Bell icon in each cell’s toolbar to toggle notifications  
- Desktop & notification‐center alerts when cells complete  
- Click a notification to jump right back to that cell  
- Optional Slack webhook notifications (securely stored)  
- Optional Telegram bot notifications (securely stored)  

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

### Optional: Telegram Notifications

1. Create a bot with @BotFather and copy the bot token
2. Obtain your chat ID (e.g. by messaging the bot and using a bot like @userinfobot or via logs)
3. Run: `Jupyter Cell Notifier: Set Telegram Bot Token & Chat ID`
4. Enter the token then the chat ID
5. Enable the setting: `jupyter-cell-notifier.telegram.enable`
6. Watched cell completions send a direct Telegram message

All secrets (webhook, bot token, chat ID) are stored securely using VS Code's SecretStorage — they never go into your settings.json or source control.

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT