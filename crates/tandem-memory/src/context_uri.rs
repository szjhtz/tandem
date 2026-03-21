use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ContextUri {
    pub scheme: String,
    pub segments: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ContextUriError {
    pub message: String,
}

impl fmt::Display for ContextUriError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl ContextUri {
    pub fn new(scheme: impl Into<String>, segments: Vec<impl Into<String>>) -> Self {
        Self {
            scheme: scheme.into(),
            segments: segments.into_iter().map(|s| s.into()).collect(),
        }
    }

    pub fn parse(uri: &str) -> Result<Self, ContextUriError> {
        if !uri.contains("://") {
            return Err(ContextUriError {
                message: format!("invalid URI format: missing '://' in '{}'", uri),
            });
        }

        let parts: Vec<&str> = uri.splitn(2, "://").collect();
        if parts.len() != 2 {
            return Err(ContextUriError {
                message: format!(
                    "invalid URI format: expected 'scheme://path', got '{}'",
                    uri
                ),
            });
        }

        let scheme = parts[0].to_lowercase();
        if scheme.is_empty() {
            return Err(ContextUriError {
                message: format!("invalid URI: empty scheme in '{}'", uri),
            });
        }

        let path = parts[1];
        let segments: Vec<String> = path
            .split('/')
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect();

        Ok(Self { scheme, segments })
    }

    pub fn parent(&self) -> Option<ContextUri> {
        if self.segments.is_empty() {
            return None;
        }
        let mut new_segments = self.segments.clone();
        new_segments.pop();
        if new_segments.is_empty() {
            return None;
        }
        Some(ContextUri {
            scheme: self.scheme.clone(),
            segments: new_segments,
        })
    }

    pub fn last_segment(&self) -> Option<&str> {
        self.segments.last().map(|s| s.as_str())
    }

    pub fn depth(&self) -> usize {
        self.segments.len()
    }

    pub fn is_ancestor_of(&self, other: &ContextUri) -> bool {
        if self.scheme != other.scheme || self.segments.len() >= other.segments.len() {
            return false;
        }
        self.segments
            .iter()
            .zip(other.segments.iter())
            .all(|(a, b)| a == b)
    }

    pub fn join(&self, segment: impl Into<String>) -> ContextUri {
        let mut new_segments = self.segments.clone();
        new_segments.push(segment.into());
        ContextUri {
            scheme: self.scheme.clone(),
            segments: new_segments,
        }
    }

    pub fn starts_with(&self, prefix: &ContextUri) -> bool {
        if self.scheme != prefix.scheme || self.segments.len() < prefix.segments.len() {
            return false;
        }
        self.segments
            .iter()
            .zip(prefix.segments.iter())
            .all(|(a, b)| a == b)
    }
}

impl fmt::Display for ContextUri {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}://", self.scheme)?;
        for (i, segment) in self.segments.iter().enumerate() {
            if i > 0 {
                write!(f, "/")?;
            }
            write!(f, "{}", segment)?;
        }
        Ok(())
    }
}

impl FromStr for ContextUri {
    type Err = ContextUriError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::parse(s)
    }
}

pub const TANDEM_SCHEME: &str = "tandem";

pub fn resources_uri(project_id: &str) -> ContextUri {
    ContextUri::new(TANDEM_SCHEME, vec!["resources", project_id])
}

pub fn user_uri(user_id: &str) -> ContextUri {
    ContextUri::new(TANDEM_SCHEME, vec!["user", user_id])
}

pub fn user_memories_uri(user_id: &str) -> ContextUri {
    ContextUri::new(TANDEM_SCHEME, vec!["user", user_id, "memories"])
}

pub fn agent_uri(agent_id: &str) -> ContextUri {
    ContextUri::new(TANDEM_SCHEME, vec!["agent", agent_id])
}

pub fn agent_skills_uri(agent_id: &str) -> ContextUri {
    ContextUri::new(TANDEM_SCHEME, vec!["agent", agent_id, "skills"])
}

pub fn session_uri(session_id: &str) -> ContextUri {
    ContextUri::new(TANDEM_SCHEME, vec!["session", session_id])
}

pub fn root_uri() -> ContextUri {
    ContextUri::new(TANDEM_SCHEME, Vec::<String>::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_uri_parse() {
        let uri = ContextUri::parse("tandem://user/user123/memories").unwrap();
        assert_eq!(uri.scheme, "tandem");
        assert_eq!(uri.segments, vec!["user", "user123", "memories"]);
    }

    #[test]
    fn test_uri_display() {
        let uri = ContextUri::parse("tandem://resources/myproject/docs").unwrap();
        assert_eq!(uri.to_string(), "tandem://resources/myproject/docs");
    }

    #[test]
    fn test_uri_parent() {
        let uri = ContextUri::parse("tandem://user/user123/memories/prefs").unwrap();
        let parent = uri.parent().unwrap();
        assert_eq!(parent.to_string(), "tandem://user/user123/memories");
    }

    #[test]
    fn test_uri_depth() {
        let uri = ContextUri::parse("tandem://a/b/c").unwrap();
        assert_eq!(uri.depth(), 3);
    }

    #[test]
    fn test_is_ancestor_of() {
        let parent = ContextUri::parse("tandem://user/user123").unwrap();
        let child = ContextUri::parse("tandem://user/user123/memories").unwrap();
        let sibling = ContextUri::parse("tandem://user/otheruser/memories").unwrap();
        let unrelated = ContextUri::parse("tandem://agent/bot/skills").unwrap();

        assert!(parent.is_ancestor_of(&child));
        assert!(!parent.is_ancestor_of(&sibling));
        assert!(!child.is_ancestor_of(&parent));
        assert!(!parent.is_ancestor_of(&unrelated));
    }

    #[test]
    fn test_join() {
        let base = ContextUri::parse("tandem://user/user123").unwrap();
        let joined = base.join("memories");
        assert_eq!(joined.to_string(), "tandem://user/user123/memories");
    }

    #[test]
    fn test_helpers() {
        assert_eq!(
            user_memories_uri("user123").to_string(),
            "tandem://user/user123/memories"
        );
        assert_eq!(
            session_uri("sess123").to_string(),
            "tandem://session/sess123"
        );
        assert_eq!(
            agent_skills_uri("bot1").to_string(),
            "tandem://agent/bot1/skills"
        );
    }

    #[test]
    fn test_invalid_uri() {
        assert!(ContextUri::parse("invalid").is_err());
        assert!(ContextUri::parse("tandem://").is_ok());
        assert!(ContextUri::parse("tandem:///").is_ok());
    }
}
