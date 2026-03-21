use crate::types::{DistillationReport, DistilledFact, FactCategory, MemoryResult};
use chrono::Utc;
use std::sync::Arc;
use tandem_providers::ProviderRegistry;

const DISTILLATION_PROMPT: &str = r#"You are analyzing a conversation session to extract memories.

## Conversation History:
{conversation}

## Task:
Extract and summarize important information from this conversation. Return a JSON array of objects with this format:
[
  {
    "category": "user_preference|task_outcome|learning|fact",
    "content": "The extracted information",
    "importance": 0.0-1.0,
    "follow_up_needed": true|false
  }
]

Only include information that would be valuable for future sessions.
"#;

pub struct SessionDistiller {
    providers: Arc<ProviderRegistry>,
    importance_threshold: f64,
}

impl SessionDistiller {
    pub fn new(providers: Arc<ProviderRegistry>) -> Self {
        Self {
            providers,
            importance_threshold: 0.5,
        }
    }

    pub fn with_threshold(providers: Arc<ProviderRegistry>, importance_threshold: f64) -> Self {
        Self {
            providers,
            importance_threshold,
        }
    }

    pub async fn distill(
        &self,
        session_id: &str,
        conversation: &[String],
    ) -> MemoryResult<DistillationReport> {
        let distillation_id = uuid::Uuid::new_v4().to_string();
        let full_text = conversation.join("\n\n---\n\n");
        let token_count = self.count_tokens(&full_text);

        if token_count < 50 {
            return Ok(DistillationReport {
                distillation_id,
                session_id: session_id.to_string(),
                distilled_at: Utc::now(),
                facts_extracted: 0,
                importance_threshold: self.importance_threshold,
                user_memory_updated: false,
                agent_memory_updated: false,
            });
        }

        let facts = self.extract_facts(&full_text, &distillation_id).await?;

        let filtered_facts: Vec<&DistilledFact> = facts
            .iter()
            .filter(|f| f.importance_score >= self.importance_threshold)
            .collect();

        let user_memory_updated = self.update_user_memory(session_id, &filtered_facts).await?;
        let agent_memory_updated = self
            .update_agent_memory(session_id, &filtered_facts)
            .await?;

        Ok(DistillationReport {
            distillation_id,
            session_id: session_id.to_string(),
            distilled_at: Utc::now(),
            facts_extracted: filtered_facts.len(),
            importance_threshold: self.importance_threshold,
            user_memory_updated,
            agent_memory_updated,
        })
    }

    async fn extract_facts(
        &self,
        conversation: &str,
        distillation_id: &str,
    ) -> MemoryResult<Vec<DistilledFact>> {
        let prompt = DISTILLATION_PROMPT.replace("{conversation}", conversation);

        let response = match self.providers.complete_cheapest(&prompt, None, None).await {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("Distillation LLM failed: {}", e);
                return Ok(Vec::new());
            }
        };

        let extracted: Vec<ExtractedFact> = match serde_json::from_str(&response) {
            Ok(facts) => facts,
            Err(e) => {
                tracing::warn!("Failed to parse distillation response: {}", e);
                return Ok(Vec::new());
            }
        };

        let facts: Vec<DistilledFact> = extracted
            .into_iter()
            .map(|e| DistilledFact {
                id: uuid::Uuid::new_v4().to_string(),
                distillation_id: distillation_id.to_string(),
                content: e.content,
                category: parse_category(&e.category),
                importance_score: e.importance,
                source_message_ids: Vec::new(),
                contradicts_fact_id: None,
            })
            .collect();

        Ok(facts)
    }

    async fn update_user_memory(
        &self,
        session_id: &str,
        facts: &[&DistilledFact],
    ) -> MemoryResult<bool> {
        if facts.is_empty() {
            return Ok(false);
        }

        let user_facts: Vec<&DistilledFact> = facts
            .iter()
            .filter(|f| {
                matches!(
                    f.category,
                    FactCategory::UserPreference | FactCategory::Fact
                )
            })
            .cloned()
            .collect();

        if user_facts.is_empty() {
            return Ok(false);
        }

        tracing::info!(
            "Would update user memory with {} facts for session {}",
            user_facts.len(),
            session_id
        );

        Ok(true)
    }

    async fn update_agent_memory(
        &self,
        session_id: &str,
        facts: &[&DistilledFact],
    ) -> MemoryResult<bool> {
        if facts.is_empty() {
            return Ok(false);
        }

        let agent_facts: Vec<&DistilledFact> = facts
            .iter()
            .filter(|f| {
                matches!(
                    f.category,
                    FactCategory::TaskOutcome | FactCategory::Learning
                )
            })
            .cloned()
            .collect();

        if agent_facts.is_empty() {
            return Ok(false);
        }

        tracing::info!(
            "Would update agent memory with {} facts for session {}",
            agent_facts.len(),
            session_id
        );

        Ok(true)
    }

    fn count_tokens(&self, text: &str) -> i64 {
        tiktoken_rs::cl100k_base()
            .map(|bpe| bpe.encode_with_special_tokens(text).len() as i64)
            .unwrap_or((text.len() / 4) as i64)
    }
}

fn parse_category(s: &str) -> FactCategory {
    match s.to_lowercase().as_str() {
        "user_preference" => FactCategory::UserPreference,
        "task_outcome" => FactCategory::TaskOutcome,
        "learning" => FactCategory::Learning,
        _ => FactCategory::Fact,
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[allow(dead_code)]
struct ExtractedFact {
    category: String,
    content: String,
    importance: f64,
    #[serde(default)]
    follow_up_needed: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_category() {
        assert_eq!(
            parse_category("user_preference"),
            FactCategory::UserPreference
        );
        assert_eq!(parse_category("task_outcome"), FactCategory::TaskOutcome);
        assert_eq!(parse_category("learning"), FactCategory::Learning);
        assert_eq!(parse_category("unknown"), FactCategory::Fact);
    }

    #[tokio::test]
    async fn test_distiller_requires_conversation() {
        // This test would require ProviderRegistry mock
        // Placeholder for now
    }
}
