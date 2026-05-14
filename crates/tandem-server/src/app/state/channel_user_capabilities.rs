use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tandem_channels::channel_registry::{command_tier_for_profile, CommandTier};
use tandem_channels::config::ChannelSecurityProfile;

use crate::app::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChannelUserCapabilityRecord {
    pub channel: String,
    pub user_id: String,
    pub max_tier: StoredCommandTier,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enrolled_at_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enrolled_by: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum StoredCommandTier {
    Read,
    Act,
    Approve,
    Reconfigure,
}

impl From<CommandTier> for StoredCommandTier {
    fn from(value: CommandTier) -> Self {
        match value {
            CommandTier::Read => Self::Read,
            CommandTier::Act => Self::Act,
            CommandTier::Approve => Self::Approve,
            CommandTier::Reconfigure => Self::Reconfigure,
        }
    }
}

impl From<StoredCommandTier> for CommandTier {
    fn from(value: StoredCommandTier) -> Self {
        match value {
            StoredCommandTier::Read => Self::Read,
            StoredCommandTier::Act => Self::Act,
            StoredCommandTier::Approve => Self::Approve,
            StoredCommandTier::Reconfigure => Self::Reconfigure,
        }
    }
}

impl AppState {
    pub async fn load_channel_user_capabilities(&self) -> anyhow::Result<()> {
        if !self.channel_user_capabilities_path.exists() {
            return Ok(());
        }
        let raw = tokio::fs::read_to_string(&self.channel_user_capabilities_path).await?;
        let parsed = serde_json::from_str::<HashMap<String, ChannelUserCapabilityRecord>>(&raw)
            .unwrap_or_default();
        *self.channel_user_capabilities.write().await = parsed;
        Ok(())
    }

    pub async fn persist_channel_user_capabilities(&self) -> anyhow::Result<()> {
        let payload = {
            let guard = self.channel_user_capabilities.read().await;
            serde_json::to_string_pretty(&*guard)?
        };
        if let Some(parent) = self.channel_user_capabilities_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(&self.channel_user_capabilities_path, payload).await?;
        Ok(())
    }

    pub async fn upsert_channel_user_capability(
        &self,
        record: ChannelUserCapabilityRecord,
    ) -> anyhow::Result<()> {
        let key = channel_user_capability_key(&record.channel, &record.user_id);
        self.channel_user_capabilities
            .write()
            .await
            .insert(key, record);
        self.persist_channel_user_capabilities().await
    }

    pub async fn channel_user_capability_tier(
        &self,
        channel: &str,
        user_id: &str,
        fallback_profile: ChannelSecurityProfile,
    ) -> CommandTier {
        let key = channel_user_capability_key(channel, user_id);
        self.channel_user_capabilities
            .read()
            .await
            .get(&key)
            .map(|record| CommandTier::from(record.max_tier))
            .unwrap_or_else(|| command_tier_for_profile(fallback_profile))
    }
}

pub fn channel_user_capability_key(channel: &str, user_id: &str) -> String {
    format!(
        "{}:{}",
        channel.trim().to_ascii_lowercase(),
        user_id.trim().to_ascii_lowercase()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn persists_and_loads_channel_user_capabilities() {
        let dir = tempfile::tempdir().unwrap();
        let mut state = AppState::new_starting("test".to_string(), true);
        state.channel_user_capabilities_path = dir.path().join("channel_user_capabilities.json");
        state
            .upsert_channel_user_capability(ChannelUserCapabilityRecord {
                channel: "slack".to_string(),
                user_id: "U123".to_string(),
                max_tier: StoredCommandTier::Approve,
                enrolled_at_ms: Some(7),
                enrolled_by: Some("admin".to_string()),
            })
            .await
            .unwrap();

        let mut loaded = AppState::new_starting("test".to_string(), true);
        loaded.channel_user_capabilities_path = state.channel_user_capabilities_path.clone();
        loaded.load_channel_user_capabilities().await.unwrap();
        assert_eq!(
            loaded
                .channel_user_capability_tier("slack", "U123", ChannelSecurityProfile::PublicDemo)
                .await,
            CommandTier::Approve
        );
    }

    #[tokio::test]
    async fn missing_user_falls_back_to_channel_profile_tier() {
        let state = AppState::new_starting("test".to_string(), true);
        assert_eq!(
            state
                .channel_user_capability_tier(
                    "telegram",
                    "alice",
                    ChannelSecurityProfile::PublicDemo
                )
                .await,
            CommandTier::Read
        );
    }
}
