use anyhow::Context;
use serde::Deserialize;
use sha2::{Digest, Sha256};

const BUNDLE_RAW: &str = include_str!("../resources/default_knowledge_bundle.json");
const MANIFEST_RAW: &str = include_str!("../resources/default_knowledge_manifest.json");

#[derive(Debug, Clone, Deserialize)]
pub struct EmbeddedKnowledgeDoc {
    pub relative_path: String,
    pub source_url: String,
    pub content: String,
    pub content_hash: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmbeddedKnowledgeBundle {
    pub schema_version: u32,
    pub source_root: String,
    pub docs_site_base_url: String,
    pub generated_at: String,
    pub docs: Vec<EmbeddedKnowledgeDoc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmbeddedKnowledgeManifest {
    pub schema_version: u32,
    pub generator_version: String,
    pub corpus_hash: String,
    pub file_count: usize,
    pub total_bytes: usize,
}

pub fn load_embedded_default_knowledge(
) -> anyhow::Result<(EmbeddedKnowledgeBundle, EmbeddedKnowledgeManifest)> {
    let bundle: EmbeddedKnowledgeBundle = serde_json::from_str(BUNDLE_RAW)
        .context("failed to parse embedded default_knowledge_bundle.json")?;
    let manifest: EmbeddedKnowledgeManifest = serde_json::from_str(MANIFEST_RAW)
        .context("failed to parse embedded default_knowledge_manifest.json")?;

    let computed = compute_corpus_hash(&bundle.docs);
    if computed != manifest.corpus_hash {
        anyhow::bail!(
            "embedded knowledge manifest hash mismatch: manifest={} computed={}",
            manifest.corpus_hash,
            computed
        );
    }
    if manifest.file_count != bundle.docs.len() {
        anyhow::bail!(
            "embedded knowledge manifest file_count mismatch: manifest={} bundle={}",
            manifest.file_count,
            bundle.docs.len()
        );
    }

    Ok((bundle, manifest))
}

pub fn compute_corpus_hash(docs: &[EmbeddedKnowledgeDoc]) -> String {
    let mut hasher = Sha256::new();
    for doc in docs {
        hasher.update(doc.relative_path.as_bytes());
        hasher.update(b"\n");
        hasher.update(doc.content_hash.as_bytes());
        hasher.update(b"\n");
    }
    let digest = hasher.finalize();
    bytes_to_hex(&digest)
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(nibble_to_hex((b >> 4) & 0x0f));
        out.push(nibble_to_hex(b & 0x0f));
    }
    out
}

fn nibble_to_hex(nibble: u8) -> char {
    match nibble {
        0..=9 => (b'0' + nibble) as char,
        10..=15 => (b'a' + (nibble - 10)) as char,
        _ => '0',
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn docs_url_for_relative_path(relative_path: &str) -> String {
        let base = "https://tandem.docs.frumu.ai/";
        let mut slug = relative_path.replace('\\', "/");
        if let Some(stripped) = slug.strip_suffix(".md") {
            slug = stripped.to_string();
        } else if let Some(stripped) = slug.strip_suffix(".mdx") {
            slug = stripped.to_string();
        }
        if slug == "index" {
            return base.to_string();
        }
        if let Some(stripped) = slug.strip_suffix("/index") {
            slug = stripped.to_string();
        }
        format!("{}{}", base, slug)
    }

    #[test]
    fn embedded_bundle_parses_and_manifest_matches() {
        let (bundle, manifest) = load_embedded_default_knowledge().expect("embedded bundle");
        assert_eq!(bundle.schema_version, 1);
        assert_eq!(manifest.schema_version, 1);
        assert_eq!(bundle.docs.len(), manifest.file_count);
        assert!(!bundle.docs.is_empty());
    }

    #[test]
    fn docs_url_mapping_expected_shapes() {
        assert_eq!(
            docs_url_for_relative_path("index.md"),
            "https://tandem.docs.frumu.ai/"
        );
        assert_eq!(
            docs_url_for_relative_path("reference/index.md"),
            "https://tandem.docs.frumu.ai/reference"
        );
        assert_eq!(
            docs_url_for_relative_path("desktop/overview.md"),
            "https://tandem.docs.frumu.ai/desktop/overview"
        );
    }
}
