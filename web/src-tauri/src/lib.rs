use serde::{Deserialize, Serialize};
use std::{
  collections::BTreeMap,
  fs,
  path::{Component, Path, PathBuf},
};
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};

const CONFIG_FILE: &str = "clawpm.json";
const ROOT_FILES: [&str; 5] = [
  "clawpm.json",
  "domains.json",
  "milestones.json",
  "fields.json",
  "links.json",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultSnapshot {
  path: String,
  files: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultWrite {
  path: String,
  content: String,
}

fn vault_error(message: impl Into<String>) -> String {
  message.into()
}

fn validate_vault_dir(dir: &Path) -> Result<(), String> {
  let config = dir.join(CONFIG_FILE);
  if !config.is_file() {
    return Err(vault_error(format!(
      "不是 ClawPM Vault（缺少 {}）: {}",
      CONFIG_FILE,
      dir.display()
    )));
  }

  let content = fs::read_to_string(&config)
    .map_err(|error| vault_error(format!("无法读取 {}: {error}", config.display())))?;
  let value: serde_json::Value = serde_json::from_str(&content)
    .map_err(|error| vault_error(format!("{} 不是有效 JSON: {error}", config.display())))?;
  if value.get("format").and_then(serde_json::Value::as_str) != Some("clawpm-vault@1") {
    return Err(vault_error(format!(
      "{} 不是 clawpm-vault@1 格式",
      config.display()
    )));
  }
  Ok(())
}

fn add_file(files: &mut BTreeMap<String, String>, dir: &Path, relative: &str) -> Result<(), String> {
  let path = dir.join(relative);
  if !path.is_file() {
    return Ok(());
  }
  let content = fs::read_to_string(&path)
    .map_err(|error| vault_error(format!("无法读取 {}: {error}", path.display())))?;
  files.insert(relative.replace('\\', "/"), content);
  Ok(())
}

fn add_shards(files: &mut BTreeMap<String, String>, dir: &Path, folder: &str) -> Result<(), String> {
  let folder_path = dir.join(folder);
  if !folder_path.is_dir() {
    return Ok(());
  }
  let mut entries = fs::read_dir(&folder_path)
    .map_err(|error| vault_error(format!("无法读取 {}: {error}", folder_path.display())))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|error| vault_error(format!("无法遍历 {}: {error}", folder_path.display())))?;
  entries.sort_by_key(|entry| entry.file_name());
  for entry in entries {
    let path = entry.path();
    if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
      continue;
    }
    let name = entry.file_name().to_string_lossy().into_owned();
    add_file(files, dir, &format!("{folder}/{name}"))?;
  }
  Ok(())
}

fn load_vault(dir: PathBuf) -> Result<VaultSnapshot, String> {
  validate_vault_dir(&dir)?;
  let mut files = BTreeMap::new();
  for file in ROOT_FILES {
    add_file(&mut files, &dir, file)?;
  }
  add_shards(&mut files, &dir, "tasks")?;
  add_shards(&mut files, &dir, "archive")?;
  Ok(VaultSnapshot {
    path: dir.to_string_lossy().into_owned(),
    files,
  })
}

fn safe_relative_path(path: &str) -> Result<PathBuf, String> {
  let relative = Path::new(path);
  if relative.is_absolute()
    || relative.components().any(|part| matches!(part, Component::ParentDir | Component::RootDir | Component::Prefix(_)))
  {
    return Err(vault_error(format!("非法 Vault 文件路径: {path}")));
  }
  let normalized = relative.to_string_lossy().replace('\\', "/");
  let allowed_root = ROOT_FILES.contains(&normalized.as_str());
  let allowed_shard = ["tasks/", "archive/"].iter().any(|prefix| {
    normalized.starts_with(prefix) && normalized.ends_with(".json") && !normalized[prefix.len()..].contains('/')
  });
  if !allowed_root && !allowed_shard {
    return Err(vault_error(format!("不允许写入 Vault 文件: {path}")));
  }
  Ok(relative.to_path_buf())
}

fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
  let parent = path
    .parent()
    .ok_or_else(|| vault_error(format!("无法确定父目录: {}", path.display())))?;
  fs::create_dir_all(parent)
    .map_err(|error| vault_error(format!("无法创建 {}: {error}", parent.display())))?;
  let file_name = path
    .file_name()
    .and_then(|name| name.to_str())
    .ok_or_else(|| vault_error(format!("非法文件名: {}", path.display())))?;
  let temporary = parent.join(format!(".{file_name}.clawpm-tmp-{}", std::process::id()));
  fs::write(&temporary, content)
    .map_err(|error| vault_error(format!("无法写入临时文件 {}: {error}", temporary.display())))?;
  fs::rename(&temporary, path).map_err(|error| {
    let _ = fs::remove_file(&temporary);
    vault_error(format!("无法原子替换 {}: {error}", path.display()))
  })
}

#[tauri::command]
fn pick_vault(app: AppHandle) -> Result<Option<VaultSnapshot>, String> {
  let Some(selection) = app.dialog().file().blocking_pick_folder() else {
    return Ok(None);
  };
  let FilePath::Path(path) = selection else {
    return Err(vault_error("当前平台未提供本地目录路径"));
  };
  load_vault(path).map(Some)
}

#[tauri::command]
fn open_vault(path: String) -> Result<VaultSnapshot, String> {
  load_vault(PathBuf::from(path))
}

#[tauri::command]
fn write_vault_files(path: String, files: Vec<VaultWrite>) -> Result<(), String> {
  let dir = PathBuf::from(path);
  validate_vault_dir(&dir)?;
  for file in files {
    let relative = safe_relative_path(&file.path)?;
    atomic_write(&dir.join(relative), &file.content)?;
  }
  Ok(())
}

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![pick_vault, open_vault, write_vault_files])
    .run(tauri::generate_context!())
    .expect("启动 ClawPM 桌面客户端失败");
}
