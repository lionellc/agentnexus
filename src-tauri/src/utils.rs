use std::{cmp::Ordering, fs, path::Path};

use sha2::{Digest, Sha256};
use walkdir::WalkDir;

use crate::error::AppError;

pub fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn sha256_hex(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn sha256_file(path: &Path) -> Result<String, AppError> {
    let bytes = fs::read(path)?;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn sha256_directory(path: &Path) -> Result<String, AppError> {
    if !path.exists() || !path.is_dir() {
        return Err(AppError::invalid_argument(format!(
            "目录不存在或不可读: {}",
            path.display()
        )));
    }

    let mut file_entries: Vec<(String, std::path::PathBuf)> = Vec::new();
    for entry in WalkDir::new(path)
        .follow_links(true)
        .into_iter()
        .filter_map(|row| row.ok())
        .filter(|row| row.file_type().is_file())
    {
        let relative = entry
            .path()
            .strip_prefix(path)
            .map_err(|err| AppError::internal(err.to_string()))?
            .to_string_lossy()
            .replace('\\', "/");
        file_entries.push((relative, entry.path().to_path_buf()));
    }
    file_entries.sort_by(|left, right| left.0.cmp(&right.0));

    let mut hasher = Sha256::new();
    for (relative, absolute) in file_entries {
        hasher.update(relative.as_bytes());
        hasher.update([0_u8]);
        hasher.update(fs::read(absolute)?);
        hasher.update([0_u8]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

pub fn compare_version(a: &str, b: &str) -> Ordering {
    let parse = |v: &str| -> Vec<i64> {
        v.trim_start_matches('v')
            .split('.')
            .map(|segment| segment.parse::<i64>().unwrap_or(0))
            .collect()
    };

    let av = parse(a);
    let bv = parse(b);
    let max_len = av.len().max(bv.len());

    for idx in 0..max_len {
        let left = *av.get(idx).unwrap_or(&0);
        let right = *bv.get(idx).unwrap_or(&0);
        if left < right {
            return Ordering::Less;
        }
        if left > right {
            return Ordering::Greater;
        }
    }

    Ordering::Equal
}

pub fn render_template(content: &str, vars: &std::collections::HashMap<String, String>) -> String {
    let mut output = content.to_string();
    for (key, value) in vars {
        let placeholder = format!("{{{{{key}}}}}");
        output = output.replace(&placeholder, value);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::{compare_version, render_template, sha256_directory};
    use std::cmp::Ordering;
    use std::{fs, path::Path};

    #[test]
    fn compare_semver_like_version() {
        assert_eq!(compare_version("1.0.0", "1.0.1"), Ordering::Less);
        assert_eq!(compare_version("v1.2.0", "1.1.9"), Ordering::Greater);
        assert_eq!(compare_version("1.2", "1.2.0"), Ordering::Equal);
    }

    #[test]
    fn render_template_replaces_placeholders() {
        let mut vars = std::collections::HashMap::new();
        vars.insert("name".to_string(), "Codex".to_string());
        vars.insert("task".to_string(), "apply".to_string());
        let rendered = render_template("hello {{name}}, {{task}} now", &vars);
        assert_eq!(rendered, "hello Codex, apply now");
    }

    #[test]
    fn sha256_directory_is_stable_for_same_content() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path();
        fs::create_dir_all(root.join("a")).expect("mkdir a");
        fs::write(root.join("a").join("x.txt"), "x").expect("write x");
        fs::write(root.join("z.txt"), "z").expect("write z");

        let hash1 = sha256_directory(root).expect("hash1");
        let hash2 = sha256_directory(Path::new(root)).expect("hash2");
        assert_eq!(hash1, hash2);
    }
}
