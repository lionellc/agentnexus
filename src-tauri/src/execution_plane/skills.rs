use std::{
    fs,
    path::{Path, PathBuf},
};

use walkdir::WalkDir;

use crate::error::AppError;

#[derive(Debug, Clone)]
pub struct DiscoveredSkill {
    pub identity: String,
    pub name: String,
    pub version: String,
    pub source: String,
    pub local_path: String,
}

pub fn discover_skills(directories: &[PathBuf]) -> Result<Vec<DiscoveredSkill>, AppError> {
    let mut discovered: Vec<DiscoveredSkill> = Vec::new();

    for root in directories {
        if !root.exists() {
            continue;
        }
        for entry in WalkDir::new(root)
            .into_iter()
            .filter_map(|item| item.ok())
            .filter(|item| item.file_type().is_file())
            .filter(|item| {
                item.file_name()
                    .to_string_lossy()
                    .eq_ignore_ascii_case("SKILL.md")
            })
        {
            let path = entry.path();
            let content = fs::read_to_string(path).unwrap_or_default();
            let skill_root = path.parent().unwrap_or(root);
            let name = skill_root
                .file_name()
                .map(|item| item.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown".to_string());
            let version = parse_version(&content).unwrap_or_else(|| "0.0.0".to_string());
            let source = root.to_string_lossy().to_string();
            let identity = normalize_identity(&name);

            discovered.push(DiscoveredSkill {
                identity,
                name,
                version,
                source,
                local_path: skill_root.to_string_lossy().to_string(),
            });
        }
    }

    Ok(discovered)
}

pub fn default_skill_directories(workspace_root: &Path) -> Vec<PathBuf> {
    let mut dirs = vec![workspace_root.join(".codex/skills")];
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".codex/skills"));
        dirs.push(home.join(".agents/skills"));
    }
    dirs
}

fn parse_version(content: &str) -> Option<String> {
    content
        .lines()
        .map(|line| line.trim())
        .find(|line| line.starts_with("version:"))
        .map(|line| {
            line.trim_start_matches("version:")
                .trim()
                .trim_matches('"')
                .to_string()
        })
}

fn normalize_identity(name: &str) -> String {
    name.chars()
        .map(|ch| {
            if ch.is_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::discover_skills;

    #[test]
    fn scan_skill_from_directory() {
        let workspace = tempfile::tempdir().expect("temp workspace");
        let skill_dir = workspace.path().join("my-skill");
        fs::create_dir_all(&skill_dir).expect("create skill dir");
        fs::write(skill_dir.join("SKILL.md"), "version: \"1.2.3\"\n").expect("write skill file");

        let list = discover_skills(&[workspace.path().to_path_buf()]).expect("scan skills");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].version, "1.2.3");
    }
}
