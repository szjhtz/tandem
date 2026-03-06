//! Core trait definitions for Tandem channel adapters.

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TriggerSource {
    SlashCommand,
    DirectMessage,
    Mention,
    ReplyToBot,
    Ambient,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MessageTriggerContext {
    pub source: TriggerSource,
    pub is_direct_message: bool,
    pub was_explicitly_mentioned: bool,
    pub is_reply_to_bot: bool,
}

impl Default for MessageTriggerContext {
    fn default() -> Self {
        Self {
            source: TriggerSource::Ambient,
            is_direct_message: false,
            was_explicitly_mentioned: false,
            is_reply_to_bot: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConversationScopeKind {
    Direct,
    Room,
    Thread,
    Topic,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ConversationScope {
    pub kind: ConversationScopeKind,
    pub id: String,
}

impl Default for ConversationScope {
    fn default() -> Self {
        Self {
            kind: ConversationScopeKind::Room,
            id: "room:unknown".to_string(),
        }
    }
}

pub fn should_accept_message(
    mention_only: bool,
    trigger: &MessageTriggerContext,
    has_text: bool,
    has_attachment: bool,
) -> bool {
    if !has_text && !has_attachment {
        return false;
    }
    if !mention_only {
        return true;
    }
    trigger.is_direct_message
        || trigger.was_explicitly_mentioned
        || trigger.is_reply_to_bot
        || matches!(trigger.source, TriggerSource::SlashCommand)
}

/// A message received from an external channel.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelMessage {
    /// Unique ID for this message (platform-provided).
    pub id: String,
    /// The sender's identifier on the platform (username, user_id, etc.).
    pub sender: String,
    /// Where to send the reply (chat_id, channel_id, etc. — platform-specific).
    pub reply_target: String,
    /// Plain-text message content, with any bot-mention prefix stripped.
    pub content: String,
    /// Name of the originating channel adapter (e.g. `"telegram"`, `"discord"`).
    pub channel: String,
    /// When the message was sent on the platform.
    pub timestamp: DateTime<Utc>,
    /// Optional raw attachment description (file name, URL, etc.)
    pub attachment: Option<String>,
    /// Optional attachment URL when the platform provides one.
    pub attachment_url: Option<String>,
    /// Optional local filesystem path where the adapter stored the attachment.
    pub attachment_path: Option<String>,
    /// Optional MIME type for the attachment.
    pub attachment_mime: Option<String>,
    /// Optional attachment filename.
    pub attachment_filename: Option<String>,
    /// Structured information about how this message targeted the bot.
    #[serde(default)]
    pub trigger: MessageTriggerContext,
    /// Stable conversation scope used for session identity.
    #[serde(default)]
    pub scope: ConversationScope,
}

/// A message to send back to the external channel.
#[derive(Debug, Clone)]
pub struct SendMessage {
    /// Text content to deliver. Adapters must chunk this to platform limits.
    pub content: String,
    /// Destination (chat_id, channel_id, user_id, etc. — platform-specific).
    pub recipient: String,
    /// Optional image URLs to send alongside text.
    pub image_urls: Vec<String>,
}

/// All external channel adapters implement this trait.
#[async_trait]
pub trait Channel: Send + Sync {
    /// Short lowercase adapter name, e.g. `"telegram"`, `"discord"`, `"slack"`.
    fn name(&self) -> &str;

    /// Send a message to the given recipient.
    async fn send(&self, message: &SendMessage) -> anyhow::Result<()>;

    /// Listen for incoming messages and forward them through `tx`.
    ///
    /// This method should run until the sender is dropped or an unrecoverable
    /// error occurs. The supervisor in `dispatcher.rs` handles restarts.
    async fn listen(&self, tx: tokio::sync::mpsc::Sender<ChannelMessage>) -> anyhow::Result<()>;

    /// Returns `true` if the platform connection is currently healthy.
    /// Used by the supervisor to decide whether to log a warning on restart.
    async fn health_check(&self) -> bool {
        true
    }

    /// Begin showing a typing indicator to the recipient. A background task
    /// must be started here and tracked so `stop_typing` can abort it.
    async fn start_typing(&self, _recipient: &str) -> anyhow::Result<()> {
        Ok(())
    }

    /// Cancel the active typing indicator for the recipient.
    async fn stop_typing(&self, _recipient: &str) -> anyhow::Result<()> {
        Ok(())
    }

    /// `true` if the platform supports in-place message editing for streaming
    /// partial responses. Used to enable draft-update mode in the dispatcher.
    fn supports_draft_updates(&self) -> bool {
        false
    }
}
